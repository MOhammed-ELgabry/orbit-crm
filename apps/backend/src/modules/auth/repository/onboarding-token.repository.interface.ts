import { OnboardingToken } from '@prisma/client';

export interface IOnboardingTokenRepository {
  create(data: {
    companyId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<OnboardingToken>;

  findByTokenHash(tokenHash: string): Promise<OnboardingToken | null>;

  markAsUsed(id: string): Promise<void>;

  deleteByCompanyId(companyId: string): Promise<void>;
}
