import { Injectable } from '@nestjs/common';

import { PrismaExceptionMapper } from '../../../common/exceptions/prisma-exception.mapper';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

import { SocialAccountEntity } from '../entities/social-account.entity';

import type { ISocialAccountRepository } from './social-account.repository.interface';

@Injectable()
export class SocialAccountRepository implements ISocialAccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByProviderAccount(
    provider: string,
    providerAccountId: string,
  ): Promise<SocialAccountEntity | null> {
    const account = await this.prisma.socialAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId,
        },
      },
    });

    if (!account) {
      return null;
    }

    return new SocialAccountEntity(account);
  }

  async create(data: {
    provider: string;
    providerAccountId: string;
    email: string | null;
    userId: string;
  }): Promise<SocialAccountEntity> {
    try {
      const account = await this.prisma.socialAccount.create({
        data,
      });

      return new SocialAccountEntity(account);
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }
}
