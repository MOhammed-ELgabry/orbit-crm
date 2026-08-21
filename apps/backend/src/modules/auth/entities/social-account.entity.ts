export class SocialAccountEntity {
  id: string;
  provider: string;
  providerAccountId: string;
  email: string | null;
  userId: string;
  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<SocialAccountEntity>) {
    Object.assign(this, partial);
  }
}
