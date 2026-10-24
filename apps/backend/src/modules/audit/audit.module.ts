import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { AuditLogController } from './audit-log.controller';
import { AuditOwnerGuard } from './audit-owner.guard';
import { AuditQueryService } from './audit-query.service';
import { AuditService } from './audit.service';

/**
 * PrismaModule is global, so PrismaService is injectable here. AuthModule is
 * imported (as every other feature module does) because JwtAuthGuard, used by
 * the controller, needs the JwtService it exports.
 */
@Module({
  imports: [AuthModule],

  controllers: [AuditLogController],
  providers: [AuditQueryService, AuditOwnerGuard, AuditService],
  exports: [AuditService],
})
export class AuditModule {}
