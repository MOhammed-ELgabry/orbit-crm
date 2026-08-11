import { Injectable } from '@nestjs/common';

import { PrismaExceptionMapper } from '../../../common/exceptions/prisma-exception.mapper';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

import type { IAuthSessionRepository } from './auth-session.repository.interface';

@Injectable()
export class AuthSessionRepository implements IAuthSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    try {
      return await this.prisma.authSession.create({
        data,
      });
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
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
    try {
      await this.prisma.authSession.update({
        where: {
          id,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }

  async revokeAllByUserId(userId: string): Promise<void> {
    try {
      await this.prisma.authSession.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
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
    try {
      return await this.prisma.$transaction(async (tx) => {
        const revokedSession = await tx.authSession.updateMany({
          where: {
            id: oldSessionId,
            revokedAt: null,
          },
          data: {
            revokedAt: new Date(),
          },
        });

        if (revokedSession.count !== 1) {
          return null;
        }

        return tx.authSession.create({
          data,
        });
      });
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }
}
