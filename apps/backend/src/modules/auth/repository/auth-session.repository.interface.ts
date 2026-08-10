import { AuthSession } from '@prisma/client';

export interface IAuthSessionRepository {
  create(data: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<AuthSession>;

  findById(id: string): Promise<AuthSession | null>;

  findByTokenHash(tokenHash: string): Promise<AuthSession | null>;

  revoke(id: string): Promise<void>;

  revokeAllByUserId(userId: string): Promise<void>;

  rotate(
    oldSessionId: string,
    data: {
      id: string;
      userId: string;
      tokenHash: string;
      expiresAt: Date;
    },
  ): Promise<AuthSession | null>;
}