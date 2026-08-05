import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

import { IAuthUser } from '../interfaces/auth-user.interface';

import type { IAuthRepository } from './auth.repository.interface';

@Injectable()
export class AuthRepository implements IAuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUserForLogin(email: string): Promise<IAuthUser | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        email,
        deletedAt: null,
      },

      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        passwordHash: true,
        isActive: true,
        isEmailVerified: true,
        isOwner: true,
        companyId: true,
      },
    });

    return user;
  }
}
