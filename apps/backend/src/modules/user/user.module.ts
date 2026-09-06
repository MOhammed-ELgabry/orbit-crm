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

    JwtAuthGuard,
  ],

  exports: [UserService, PasswordService, USER_REPOSITORY],
})
export class UserModule {}
