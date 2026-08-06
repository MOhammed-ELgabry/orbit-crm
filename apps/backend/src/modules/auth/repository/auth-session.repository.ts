import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

import { IAuthSessionRepository } from './auth-session.repository.interface';

@Injectable()
export class AuthSessionRepository implements IAuthSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: { userId: string; tokenHash: string; expiresAt: Date }) {
    return this.prisma.authSession.create({
      data,
    });
  }

  async findById(id: string) {
    return this.prisma.authSession.findUnique({
      where: {
        id,
      },
    });
  }

  async findByTokenHash(tokenHash: string) {
    return this.prisma.authSession.findFirst({
      where: {
        tokenHash,
      },
    });
  }

  async revoke(id: string): Promise<void> {
    await this.prisma.authSession.update({
      where: {
        id,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  async revokeAllByUserId(userId: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }
  async rotate(
    oldSessionId: string,
    data: {
      id: string;
      userId: string;
      tokenHash: string;
      expiresAt: Date;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.authSession.update({
        where: {
          id: oldSessionId,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      return tx.authSession.create({
        data,
      });
    });
  }
}
