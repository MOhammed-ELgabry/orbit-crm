import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { ROLE_REPOSITORY } from './constants/role.constants';
import { RoleController } from './role.controller';
import { RoleRepository } from './repository/role.repository';
import { RoleService } from './role.service';

@Module({
  imports: [
    // Cannot import AuthModule here: AuthModule imports UserModule (for
    // USER_REPOSITORY), and UserModule needs to import RoleModule (for
    // role assignment — see UserService.assignRole) — importing
    // AuthModule from here would close that into a cycle
    // (UserModule -> RoleModule -> AuthModule -> UserModule). Mirrors
    // UserModule's identical, already-documented workaround: register
    // JwtModule directly with the same factory AuthModule uses, so
    // JwtAuthGuard gets a working JwtService without the cycle.
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

  controllers: [RoleController],

  providers: [
    RoleService,

    {
      provide: ROLE_REPOSITORY,
      useClass: RoleRepository,
    },

    JwtAuthGuard,
  ],

  exports: [RoleService],
})
export class RoleModule {}