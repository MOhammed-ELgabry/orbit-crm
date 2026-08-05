import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';

import { EMAIL_VERIFICATION_REPOSITORY } from './constants/email-verification.constants';

import { EmailVerificationRepository } from './repository/email-verification.repository';

import { EmailVerificationService } from './email-verification.service';

@Module({
  imports: [PrismaModule],

  providers: [
    EmailVerificationService,

    {
      provide: EMAIL_VERIFICATION_REPOSITORY,
      useClass: EmailVerificationRepository,
    },
  ],

  exports: [EmailVerificationService, EMAIL_VERIFICATION_REPOSITORY],
})
export class EmailVerificationModule {}
