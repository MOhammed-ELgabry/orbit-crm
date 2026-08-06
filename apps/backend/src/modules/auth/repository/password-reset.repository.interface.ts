import { PasswordResetToken } from '@prisma/client';

export interface IPasswordResetRepository {
  create(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<PasswordResetToken>;

  findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null>;

  findById(id: string): Promise<PasswordResetToken | null>;

  markAsUsed(id: string): Promise<void>;

  deleteByUserId(userId: string): Promise<void>;
}
