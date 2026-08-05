import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

import { CreateEmailVerificationRepositoryDto } from '../dto/create-email-verification-repository.dto';
import { EmailVerificationEntity } from '../entities/email-verification.entity';

import type { IEmailVerificationRepository } from './email-verification.repository.interface';

@Injectable()
export class EmailVerificationRepository implements IEmailVerificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateEmailVerificationRepositoryDto) {
    const verification = await this.prisma.emailVerification.upsert({
      where: {
        email: dto.email,
      },

      update: {
        code: dto.code,
        expiresAt: dto.expiresAt,
        attempts: 0,
        verifiedAt: null,
      },

      create: {
        email: dto.email,
        code: dto.code,
        expiresAt: dto.expiresAt,
      },
    });

    return new EmailVerificationEntity(verification);
  }

  async createWithTransaction(
    tx: Prisma.TransactionClient,
    dto: CreateEmailVerificationRepositoryDto,
  ) {
    const verification = await tx.emailVerification.upsert({
      where: {
        email: dto.email,
      },

      update: {
        code: dto.code,
        expiresAt: dto.expiresAt,
        attempts: 0,
        verifiedAt: null,
      },

      create: {
        email: dto.email,
        code: dto.code,
        expiresAt: dto.expiresAt,
      },
    });

    return new EmailVerificationEntity(verification);
  }

  async findByEmail(email: string) {
    const verification = await this.prisma.emailVerification.findUnique({
      where: {
        email,
      },
    });

    if (!verification) {
      return null;
    }

    return new EmailVerificationEntity(verification);
  }

  async markAsVerified(email: string) {
    const verification = await this.prisma.emailVerification.update({
      where: {
        email,
      },

      data: {
        verifiedAt: new Date(),
      },
    });

    return new EmailVerificationEntity(verification);
  }

  async incrementAttempts(email: string) {
    const verification = await this.prisma.emailVerification.update({
      where: {
        email,
      },

      data: {
        attempts: {
          increment: 1,
        },
      },
    });

    return new EmailVerificationEntity(verification);
  }

  async delete(email: string) {
    await this.prisma.emailVerification.delete({
      where: {
        email,
      },
    });
  }
}
