import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { IpCountryService } from './ip-country.service';
import {
  parseStoredHints,
  sanitizeRegionalHints,
  withIpCountry,
  type RegionalHints,
} from './regional-hints';
import { RegionalReferenceService } from './regional-reference.service';
import { suggestRegionalSettings } from './regional-suggestion.engine';

/** Multipart registrations deliver the hints as a JSON string field. */
const MAX_RAW_HINTS_CHARS = 4096;

export type CompanyRegionalCreateData = Pick<
  Prisma.CompanyUncheckedCreateInput,
  | 'suggestedCountryCode'
  | 'suggestedTimezone'
  | 'suggestedLocale'
  | 'regionalSource'
  | 'regionalConfidence'
  | 'regionalDetectedAt'
  | 'regionalStatus'
>;

/**
 * Captures optional regional hints at registration and turns the stored,
 * temporary hints into the Company's suggestion columns. Nothing in here may
 * ever make registration, e-mail verification or social login fail: every
 * public method swallows its own errors and degrades to "no hints".
 */
@Injectable()
export class RegionalCaptureService {
  private readonly logger = new Logger(RegionalCaptureService.name);

  constructor(
    private readonly reference: RegionalReferenceService,
    private readonly ipCountry: IpCountryService,
  ) {}

  private readonly isKnownCountry = async (code: string): Promise<boolean> =>
    (await this.reference.getCountry(code)) !== null;

  /** Accepts an object, or the JSON string a multipart form delivers. */
  private normalizeRaw(raw: unknown): unknown {
    if (typeof raw !== 'string') return raw;
    if (raw.length === 0 || raw.length > MAX_RAW_HINTS_CHARS) return null;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }

  /**
   * Validates client hints and adds the server-resolved IP country. The
   * client IP is used only for this lookup and is neither stored nor logged.
   */
  async capture(
    raw: unknown,
    clientIp: string | undefined | null,
  ): Promise<RegionalHints | null> {
    try {
      const sanitized = await sanitizeRegionalHints(
        this.normalizeRaw(raw),
        this.isKnownCountry,
      );
      const country = await this.ipCountry.resolveCountry(clientIp);
      return withIpCountry(sanitized, country);
    } catch (error) {
      this.logger.warn(
        `Regional hint capture skipped: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /** Browser zone to store on the User, when it is a valid IANA identifier. */
  timezoneOf(hints: RegionalHints | null): string | null {
    return hints?.timezone ?? null;
  }

  /**
   * Company columns derived from temporarily stored hints. Returns {} when
   * there is nothing to suggest, leaving the company exactly like a legacy one.
   * The result never confirms anything: countryCode / baseCurrencyCode /
   * timezone / defaultLocale / regionalConfirmedAt are Owner-only.
   */
  async toCompanyData(
    stored: unknown,
    now: Date = new Date(),
  ): Promise<CompanyRegionalCreateData> {
    try {
      const hints = await parseStoredHints(stored, this.isKnownCountry);
      if (!hints) return {};

      const countries = await this.reference.listCountries();
      const byCode = new Map(countries.map((c) => [c.code, c]));

      const suggestion = suggestRegionalSettings(hints, {
        getCountryDefaults: (code) => byCode.get(code) ?? null,
      });

      return {
        suggestedCountryCode: suggestion.countryCode,
        suggestedTimezone: suggestion.timezone,
        suggestedLocale: suggestion.locale,
        regionalSource: suggestion.source,
        regionalConfidence: suggestion.confidence,
        regionalDetectedAt: now,
        regionalStatus: suggestion.status,
      };
    } catch (error) {
      this.logger.warn(
        `Regional suggestion skipped: ${(error as Error).message}`,
      );
      return {};
    }
  }
}
