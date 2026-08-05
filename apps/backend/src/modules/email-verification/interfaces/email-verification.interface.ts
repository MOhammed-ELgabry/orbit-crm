export interface IEmailVerification {
  id: string;

  email: string;

  code: string;

  expiresAt: Date;

  verifiedAt: Date | null;

  attempts: number;

  createdAt: Date;

  updatedAt: Date;
}
