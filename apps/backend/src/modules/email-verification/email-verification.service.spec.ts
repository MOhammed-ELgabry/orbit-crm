import { Test, TestingModule } from '@nestjs/testing';

import { EMAIL_VERIFICATION_REPOSITORY } from './constants/email-verification.constants';
import { EmailVerificationService } from './email-verification.service';

describe('EmailVerificationService', () => {
  let service: EmailVerificationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailVerificationService,
        { provide: EMAIL_VERIFICATION_REPOSITORY, useValue: {} },
      ],
    }).compile();

    service = module.get<EmailVerificationService>(EmailVerificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});