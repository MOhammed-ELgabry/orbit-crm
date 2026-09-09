import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleModule } from '../role/role.module';

import { UserController } from './user.controller';
import { UserService } from './user.service';
import { UserRepository } from './repository/user.repository';
import { PasswordService } from './services/password.service';
import { USER_REPOSITORY } from './constants/user.constants';

import { AuthSessionRepository } from '../auth/repository/auth-session.repository';
import { AUTH_SESSION_REPOSITORY } from '../auth/constants/auth.constants';

@Module({
  imports: [
    RoleModule,

    // JwtAuthGuard needs a configured JwtService to verify access
    // tokens. We cannot import AuthModule here (AuthModule already
    // imports UserModule for USER_REPOSITORY, and importing it back
    // would create a circular module dependency without editing
    // AuthModule, which is out of scope). Registering JwtModule here
    // with the same factory AuthModule already uses gives
    // JwtAuthGuard a working, identically-configured JwtService
    // without touching AuthModule or creating a cycle.
    JwtModule.registerAsync({
      imports: [ConfigModule],

      inject: [ConfigService],

      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('jwt.accessSecret'),

        signOptions: {
          expiresIn: configService.getOrThrow<string>('jwt.accessExpiresIn'),
        },
      }),
    }),
  ],

  controllers: [UserController],

  providers: [
    UserService,
    PasswordService,

    {
      provide: USER_REPOSITORY,
      useClass: UserRepository,
    },

    // Same reasoning as the JwtModule registration above: UserService
    // needs to revoke a user's sessions after a self-service password
    // change (see UserService.update()), which means the existing
    // AuthSessionRepository — not a new abstraction. AuthModule can't
    // be imported here (same circular-dependency constraint), but
    // AuthSessionRepository's only dependency is PrismaService, which
    // is @Global(), so registering it locally under the same
    // AUTH_SESSION_REPOSITORY token AuthModule already uses is safe:
    // both registrations wrap the same PrismaService singleton and
    // behave identically, exactly like the duplicated JwtModule above.
    {
      provide: AUTH_SESSION_REPOSITORY,
      useClass: AuthSessionRepository,
    },

    JwtAuthGuard,
  ],

  exports: [UserService, PasswordService, USER_REPOSITORY],
})
export class UserModule {}
