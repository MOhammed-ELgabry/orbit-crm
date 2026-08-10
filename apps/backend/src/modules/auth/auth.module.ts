import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { StringValue } from 'ms';

import { UserModule } from '../user/user.module';
import { EmailVerificationModule } from '../email-verification/email-verification.module';
import { MailModule } from '../mail/mail.module';

import {
  AUTH_REPOSITORY,
  AUTH_SESSION_REPOSITORY,
  PASSWORD_RESET_REPOSITORY,
} from './constants/auth.constants';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

import { AuthRepository } from './repository/auth.repository';
import { AuthSessionRepository } from './repository/auth-session.repository';
import { PasswordResetRepository } from './repository/password-reset.repository';
import { TokenHashService } from './services/token-hash.service';

import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    UserModule,
    EmailVerificationModule,
    MailModule,

    JwtModule.registerAsync({
      imports: [ConfigModule],

      inject: [ConfigService],

      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('jwt.accessSecret'),

        signOptions: {
          expiresIn: configService.getOrThrow<string>(
            'jwt.accessExpiresIn',
          ) as StringValue,
        },
      }),
    }),
  ],

  controllers: [AuthController],

  providers: [
    AuthService,

    TokenHashService,

    {
      provide: AUTH_REPOSITORY,
      useClass: AuthRepository,
    },

    {
      provide: AUTH_SESSION_REPOSITORY,
      useClass: AuthSessionRepository,
    },

    {
      provide: PASSWORD_RESET_REPOSITORY,
      useClass: PasswordResetRepository,
    },
  ],

  exports: [AuthService, JwtModule],
})
export class AuthModule {}
