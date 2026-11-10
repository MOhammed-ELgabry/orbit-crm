import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { RegionalController } from './regional.controller';
import { RegionalCoreModule } from './regional-core.module';
import { RegionalSettingsService } from './regional-settings.service';

@Module({
  imports: [AuthModule, RegionalCoreModule],
  controllers: [RegionalController],
  providers: [RegionalSettingsService, JwtAuthGuard],
})
export class RegionalModule {}
