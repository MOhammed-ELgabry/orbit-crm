import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { configuration, envValidationSchema } from '../../config';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';

import { SecurityModule } from '../../common/security/security.module';

import { CompanyModule } from '../company/company.module';
import { UserModule } from '../user/user.module';

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

    PrismaModule,

    SecurityModule,

    CompanyModule,

    UserModule,

    AuthModule,
  ],

  controllers: [AppController],

  providers: [AppService],
})
export class AppModule {}
