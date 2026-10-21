import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserModule } from '../user/user.module';
import { PermissionsGuard } from '../../common/security/permissions.guard';

import { CONTACT_REPOSITORY } from './constants/contact.constants';
import { ContactController } from './contact.controller';
import { ContactImportController } from './contact-import.controller';
import { ContactImportService } from './contact-import.service';
import { ContactRepository } from './repository/contact.repository';
import { ContactService } from './contact.service';

@Module({
  imports: [PrismaModule, AuthModule, UserModule],

  controllers: [ContactController, ContactImportController],

  providers: [
    ContactService,
    ContactImportService,

    {
      provide: CONTACT_REPOSITORY,
      useClass: ContactRepository,
    },

    JwtAuthGuard,
    PermissionsGuard,
  ],

  exports: [ContactService],
})
export class ContactModule {}
