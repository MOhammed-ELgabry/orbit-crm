import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

import { IPasswordResetRepository } from './password-reset.repository.interface';

@Injectable()
export class PasswordResetRepository implements IPasswordResetRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: { userId: string; tokenHash: string; expiresAt: Date }) {
    return this.prisma.passwordResetToken.create({
      data,
    });
  }

  async findByTokenHash(tokenHash: string) {
    return this.prisma.passwordResetToken.findUnique({
      where: {
        tokenHash,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.passwordResetToken.findUnique({
      where: {
        id,
      },
    });
  }

  async markAsUsed(id: string): Promise<void> {
    await this.prisma.passwordResetToken.update({
      where: {
        id,
      },
      data: {
        usedAt: new Date(),
      },
    });
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.prisma.passwordResetToken.deleteMany({
      where: {
        userId,
      },
    });
  }
}
