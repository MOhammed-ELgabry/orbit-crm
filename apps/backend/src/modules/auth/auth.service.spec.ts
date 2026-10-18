import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { EMAIL_VERIFICATION_REPOSITORY } from '../email-verification/constants/email-verification.constants';
import { MailService } from '../mail/mail.service';
import { USER_REPOSITORY } from '../user/constants/user.constants';
import { PasswordService } from '../user/services/password.service';
import { AuthService } from './auth.service';
import {
  AUTH_REPOSITORY,
  AUTH_SESSION_REPOSITORY,
  ONBOARDING_TOKEN_REPOSITORY,
  PASSWORD_RESET_REPOSITORY,
  SOCIAL_ACCOUNT_REPOSITORY,
} from './constants/auth.constants';
import { FacebookAuthProvider } from './providers/facebook-auth.provider';
import { GoogleAuthProvider } from './providers/google-auth.provider';
import { MicrosoftAuthProvider } from './providers/microsoft-auth.provider';
import { OAuthStateService } from './services/oauth-state.service';
import { TokenHashService } from './services/token-hash.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    // Every constructor dependency is an empty stand-in: this smoke test
    // only proves the service can be wired by Nest's DI. Behaviour is
    // covered by the dedicated AuthService specs and the integration suite.
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: {} },
        { provide: USER_REPOSITORY, useValue: {} },
        { provide: EMAIL_VERIFICATION_REPOSITORY, useValue: {} },
        { provide: PasswordService, useValue: {} },
        { provide: MailService, useValue: {} },
        { provide: AUTH_REPOSITORY, useValue: {} },
        { provide: AUTH_SESSION_REPOSITORY, useValue: {} },
        { provide: PASSWORD_RESET_REPOSITORY, useValue: {} },
        { provide: SOCIAL_ACCOUNT_REPOSITORY, useValue: {} },
        { provide: ONBOARDING_TOKEN_REPOSITORY, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: TokenHashService, useValue: {} },
        { provide: OAuthStateService, useValue: {} },
        { provide: GoogleAuthProvider, useValue: {} },
        { provide: FacebookAuthProvider, useValue: {} },
        { provide: MicrosoftAuthProvider, useValue: {} },
        { provide: JwtService, useValue: {} },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
