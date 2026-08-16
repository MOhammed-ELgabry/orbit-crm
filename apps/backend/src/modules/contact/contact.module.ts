import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserModule } from '../user/user.module';

import { CONTACT_REPOSITORY } from './constants/contact.constants';
import { ContactController } from './contact.controller';
import { ContactRepository } from './repository/contact.repository';
import { ContactService } from './contact.service';

@Module({
  imports: [PrismaModule, AuthModule, UserModule],

  controllers: [ContactController],

  providers: [
    ContactService,

    {
      provide: CONTACT_REPOSITORY,
      useClass: ContactRepository,
    },

    JwtAuthGuard,
  ],

  exports: [ContactService],
})
export class ContactModule {}
