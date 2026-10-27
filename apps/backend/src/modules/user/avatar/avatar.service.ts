import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

import { buildAvatarRef } from './avatar.constants';
import { inspectAvatarImage, type InspectedImage } from './avatar-image.util';

/** The part of a multer memory-storage file this feature relies on. */
export interface UploadedAvatarFile {
  buffer: Buffer;
  size: number;
}

export interface StoredAvatar {
  data: Buffer;
  contentType: string;
  checksum: string;
  size: number;
}

export interface ValidatedAvatar extends InspectedImage {
  buffer: Buffer;
  checksum: string;
}

/**
 * Validates an uploaded picture. Used by the upload endpoint and by
 * registration, so both apply exactly the same rules.
 */
export function validateAvatarUpload(
  file: UploadedAvatarFile | undefined,
): ValidatedAvatar {
  if (!file || !file.buffer) {
    throw new BadRequestException('An image file is required.');
  }

  const image = inspectAvatarImage(file.buffer);

  return {
    ...image,
    buffer: file.buffer,
    checksum: createHash('sha256').update(file.buffer).digest('hex'),
  };
}

@Injectable()
export class UserAvatarService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Replaces the caller's own picture. The :id in the URL must be the
   * authenticated user's own id — checked before anything else, so a probed
   * id (someone else's, or one that does not exist) always gets the same 403.
   */
  async setOwn(
    id: string,
    callerId: string,
    companyId: string,
    file: UploadedAvatarFile | undefined,
  ): Promise<{ avatar: string }> {
    this.assertSelf(id, callerId, 'You can only change your own picture.');

    const image = validateAvatarUpload(file);

    await this.requireUser(id, companyId);

    const avatar = buildAvatarRef(id, image.checksum);

    // One transaction: the picture and the reference to it change together.
    await this.prisma.$transaction([
      this.prisma.userAvatar.upsert({
        where: { userId: id },
        create: {
          userId: id,
          contentType: image.contentType,
          size: image.buffer.length,
          checksum: image.checksum,
          data: image.buffer,
        },
        update: {
          contentType: image.contentType,
          size: image.buffer.length,
          checksum: image.checksum,
          data: image.buffer,
        },
      }),
      this.prisma.user.update({ where: { id }, data: { avatar } }),
    ]);

    return { avatar };
  }

  /** Removes the caller's own picture (back to initials). Idempotent. */
  async removeOwn(
    id: string,
    callerId: string,
    companyId: string,
  ): Promise<{ avatar: null }> {
    this.assertSelf(id, callerId, 'You can only remove your own picture.');

    await this.requireUser(id, companyId);

    await this.prisma.$transaction([
      this.prisma.userAvatar.deleteMany({ where: { userId: id } }),
      this.prisma.user.update({ where: { id }, data: { avatar: null } }),
    ]);

    return { avatar: null };
  }

  /**
   * Reads a colleague's picture. Tenant-isolated: the picture is returned
   * only when its owner belongs to the CALLER'S company. A user in another
   * company, a deleted user and a user without a picture all look the same
   * (404), so this cannot be used to probe who exists elsewhere.
   */
  async readForCompany(id: string, companyId: string): Promise<StoredAvatar> {
    const row = await this.prisma.userAvatar.findFirst({
      where: { userId: id, user: { companyId, deletedAt: null } },
      select: { data: true, contentType: true, checksum: true, size: true },
    });

    if (!row) {
      throw new NotFoundException('Picture not found.');
    }

    return {
      data: Buffer.from(row.data),
      contentType: row.contentType,
      checksum: row.checksum,
      size: row.size,
    };
  }

  private assertSelf(id: string, callerId: string, message: string) {
    if (id !== callerId) {
      throw new ForbiddenException(message);
    }
  }

  private async requireUser(id: string, companyId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }
  }
}
