import { Module } from '@nestjs/common';

import { IpCountryService } from './ip-country.service';
import { RegionalCaptureService } from './regional-capture.service';
import { RegionalHandoffService } from './regional-handoff.service';
import { RegionalMoneyService } from './regional-money.service';
import { RegionalReferenceService } from './regional-reference.service';

/**
 * Auth-independent building blocks (reference data, hint capture, OAuth
 * handoff). Kept apart from RegionalModule so AuthModule can import it
 * without a circular dependency (RegionalModule's controller needs AuthModule
 * for its guards).
 */
@Module({
  providers: [
    IpCountryService,
    RegionalReferenceService,
    RegionalCaptureService,
    RegionalHandoffService,
    RegionalMoneyService,
  ],
  exports: [
    IpCountryService,
    RegionalReferenceService,
    RegionalCaptureService,
    RegionalHandoffService,
    RegionalMoneyService,
  ],
})
export class RegionalCoreModule {}
