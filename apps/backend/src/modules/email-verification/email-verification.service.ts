import { Inject, Injectable } from '@nestjs/common';

import { EMAIL_VERIFICATION_REPOSITORY } from './constants/email-verification.constants';
import { CreateEmailVerificationRepositoryDto } from './dto/create-email-verification-repository.dto';
import type { IEmailVerificationRepository } from './repository/email-verification.repository.interface';
@Injectable()
export class EmailVerificationService {
  constructor(
    @Inject(EMAIL_VERIFICATION_REPOSITORY)
    private readonly repository: IEmailVerificationRepository,
  ) {}

  generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async createVerification(email: string) {
    const code = this.generateCode();

    const repositoryDto: CreateEmailVerificationRepositoryDto = {
      email,
      code,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    };

    return this.repository.create(repositoryDto);
  }
}
