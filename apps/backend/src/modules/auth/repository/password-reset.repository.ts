import { Injectable } from '@nestjs/common';

import { PrismaExceptionMapper } from '../../../common/exceptions/prisma-exception.mapper';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

import { IPasswordResetRepository } from './password-reset.repository.interface';

@Injectable()
export class PasswordResetRepository implements IPasswordResetRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: { userId: string; tokenHash: string; expiresAt: Date }) {
    try {
      return await this.prisma.passwordResetToken.create({
        data,
      });
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
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
    try {
      await this.prisma.passwordResetToken.update({
        where: {
          id,
        },
        data: {
          usedAt: new Date(),
        },
      });
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }

  async deleteByUserId(userId: string): Promise<void> {
    try {
      await this.prisma.passwordResetToken.deleteMany({
        where: {
          userId,
        },
      });
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }
}
