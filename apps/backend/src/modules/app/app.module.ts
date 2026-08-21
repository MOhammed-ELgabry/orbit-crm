import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { configuration, envValidationSchema } from '../../config';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';

import { SecurityModule } from '../../common/security/security.module';

import { CompanyModule } from '../company/company.module';
import { UserModule } from '../user/user.module';
import { ContactModule } from '../contact/contact.module';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
    }),

    // Applied globally via the APP_GUARD provider below. Per-route
    // overrides live on the individual endpoints most exposed to abuse
    // (see AuthController) — this "default" bucket is the app-wide
    // baseline for everything else.
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 30,
      },
    ]),

    PrismaModule,

    SecurityModule,

    CompanyModule,

    UserModule,

    AuthModule,

    ContactModule,
  ],

  controllers: [AppController],

  providers: [
    AppService,

    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
