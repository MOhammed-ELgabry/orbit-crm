import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { open, type Reader, type Response } from 'maxmind';

import { isPublicIp, normalizeIp } from './client-ip.util';

/** Record shapes of the two MMDB flavours we accept. */
interface CountryRecord {
  /** Official DB-IP Lite / GeoLite2 "Country" layout. */
  country?: { iso_code?: string };
  /** ip-location-db layout. */
  country_code?: string;
}

/**
 * Country of an IP address from a LOCAL MMDB file (DB-IP Lite "IP to
 * Country", CC BY 4.0 — attribution is shown in the Regional Settings UI).
 *
 *  - No external call, no paid API, nothing is sent anywhere.
 *  - The IP is used for the lookup only: it is never stored or logged.
 *  - Only a validated ISO country code is returned. Private, loopback,
 *    carrier-NAT and reserved addresses resolve to null.
 *  - Without a configured/readable database the service resolves nothing and
 *    the rest of the pipeline works without the IP signal.
 *
 * Accuracy caveats (documented, enforced by the confidence model): VPNs,
 * corporate egress and mobile carrier NAT can place a user in another
 * country, so the IP alone is only ever LOW confidence.
 */
@Injectable()
export class IpCountryService implements OnModuleInit {
  private readonly logger = new Logger(IpCountryService.name);
  private reader: Reader<Response> | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const path = this.config.get<string>('regional.geoipDbPath');
    if (!path) {
      this.logger.log(
        'GEOIP_COUNTRY_DB_PATH is not set: the IP country signal is disabled.',
      );
      return;
    }
    await this.load(path);
  }

  /** Public for tests and for a future hot-reload of a refreshed database. */
  async load(path: string): Promise<boolean> {
    try {
      this.reader = await open<Response>(path);
      this.logger.log('IP country database loaded.');
      return true;
    } catch (error) {
      this.reader = null;
      this.logger.warn(
        `IP country database could not be loaded (${(error as Error).message}); the IP signal is disabled.`,
      );
      return false;
    }
  }

  get isAvailable(): boolean {
    return this.reader !== null;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async resolveCountry(ip: string | undefined | null): Promise<string | null> {
    if (!this.reader) return null;

    const normalized = normalizeIp(ip);
    if (!normalized || !isPublicIp(normalized)) return null;

    try {
      const record = this.reader.get(
        normalized,
      ) as unknown as CountryRecord | null;
      const code = (record?.country?.iso_code ?? record?.country_code ?? '')
        .toString()
        .toUpperCase();
      return /^[A-Z]{2}$/.test(code) ? code : null;
    } catch {
      return null;
    }
  }
}
