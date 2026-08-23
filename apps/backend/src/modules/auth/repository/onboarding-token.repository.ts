import { Injectable } from '@nestjs/common';

import { PrismaExceptionMapper } from '../../../common/exceptions/prisma-exception.mapper';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

import { IOnboardingTokenRepository } from './onboarding-token.repository.interface';

@Injectable()
export class OnboardingTokenRepository implements IOnboardingTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    companyId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    try {
      return await this.prisma.onboardingToken.create({
        data,
      });
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }

  async findByTokenHash(tokenHash: string) {
    return this.prisma.onboardingToken.findUnique({
      where: {
        tokenHash,
      },
    });
  }

  async markAsUsed(id: string): Promise<void> {
    try {
      await this.prisma.onboardingToken.update({
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

  async deleteByCompanyId(companyId: string): Promise<void> {
    try {
      await this.prisma.onboardingToken.deleteMany({
        where: {
          companyId,
        },
      });
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }
}