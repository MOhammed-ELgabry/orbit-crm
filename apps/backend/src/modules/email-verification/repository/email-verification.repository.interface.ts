import { Prisma } from '@prisma/client';

import { CreateEmailVerificationRepositoryDto } from '../dto/create-email-verification-repository.dto';
import { IEmailVerification } from '../interfaces/email-verification.interface';

export interface IEmailVerificationRepository {
  create(
    dto: CreateEmailVerificationRepositoryDto,
  ): Promise<IEmailVerification>;

  createWithTransaction(
    tx: Prisma.TransactionClient,
    dto: CreateEmailVerificationRepositoryDto,
  ): Promise<IEmailVerification>;

  findByEmail(email: string): Promise<IEmailVerification | null>;

  markAsVerified(email: string): Promise<IEmailVerification>;

  incrementAttempts(email: string): Promise<IEmailVerification>;

  delete(email: string): Promise<void>;
}
