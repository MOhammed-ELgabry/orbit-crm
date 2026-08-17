import { SocialAccountEntity } from '../entities/social-account.entity';

export interface ISocialAccountRepository {
  findByProviderAccount(
    provider: string,
    providerAccountId: string,
  ): Promise<SocialAccountEntity | null>;

  create(data: {
    provider: string;
    providerAccountId: string;
    email: string | null;
    userId: string;
  }): Promise<SocialAccountEntity>;
}