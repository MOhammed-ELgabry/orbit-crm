import { COUNTRY_SEED } from './data/countries.data';
import { RegionalCaptureService } from './regional-capture.service';

const countries = COUNTRY_SEED.map((c) => ({
  code: c.code,
  alpha3: c.alpha3,
  nameEn: c.nameEn,
  nameAr: c.nameAr,
  nativeName: c.nativeName,
  defaultCurrencyCode: c.defaultCurrency,
  defaultLocale: c.defaultLocale,
  defaultTimezone: c.defaultTimezone,
}));

const build = (ipCountry: string | null = null) => {
  const reference = {
    getCountry: jest.fn((code: string) =>
      Promise.resolve(countries.find((c) => c.code === code) ?? null),
    ),
    listCountries: jest.fn().mockResolvedValue(countries),
  };
  const ip = { resolveCountry: jest.fn().mockResolvedValue(ipCountry) };
  return {
    service: new RegionalCaptureService(reference as never, ip as never),
    ip,
    reference,
  };
};

describe('RegionalCaptureService.capture', () => {
  it('returns null (never throws) for missing / garbage input', async () => {
    const { service } = build();
    for (const v of [undefined, null, 5, 'not json', '[1]', '{"x":1}', {}]) {
      await expect(service.capture(v, '1.2.3.4')).resolves.toBeNull();
    }
  });

  it('accepts the JSON string a multipart form delivers', async () => {
    const { service } = build();
    const hints = await service.capture(
      JSON.stringify({ timezone: 'Africa/Cairo', locales: ['ar-EG'] }),
      '1.2.3.4',
    );
    expect(hints).toMatchObject({
      timezone: 'Africa/Cairo',
      locales: ['ar-EG'],
    });
  });

  it('ignores an oversized string without parsing it', async () => {
    const { service } = build();
    await expect(
      service.capture(
        JSON.stringify({ timezone: 'Africa/Cairo', pad: 'x'.repeat(5000) }),
        null,
      ),
    ).resolves.toBeNull();
  });

  it('adds only the server-resolved IP country and never stores the IP itself', async () => {
    const { service, ip } = build('EG');
    const hints = await service.capture(
      { timezone: 'Africa/Cairo' },
      '41.1.2.3',
    );
    expect(ip.resolveCountry).toHaveBeenCalledWith('41.1.2.3');
    expect(hints?.ipCountry).toBe('EG');
    expect(JSON.stringify(hints)).not.toContain('41.1.2.3');
  });

  it('ignores a client-sent ipCountry', async () => {
    const { service } = build(null);
    const hints = await service.capture(
      { timezone: 'Africa/Cairo', ipCountry: 'US' },
      null,
    );
    expect(hints?.ipCountry).toBeUndefined();
  });

  it('survives a failing IP resolver', async () => {
    const { service, ip } = build();
    ip.resolveCountry.mockRejectedValue(new Error('db missing'));
    await expect(
      service.capture({ timezone: 'Africa/Cairo' }, '1.1.1.1'),
    ).resolves.toBeNull();
  });
});

describe('RegionalCaptureService.toCompanyData', () => {
  const NOW = new Date('2026-11-09T10:00:00Z');

  it('is {} for no / invalid stored hints (legacy-like company)', async () => {
    const { service } = build();
    await expect(service.toCompanyData(null, NOW)).resolves.toEqual({});
    await expect(service.toCompanyData({ v: 9 }, NOW)).resolves.toEqual({});
  });

  it('produces a suggestion only — never confirmed values', async () => {
    const { service } = build();
    const data = await service.toCompanyData(
      {
        v: 1,
        capturedAt: NOW.toISOString(),
        timezone: 'Africa/Cairo',
        ipCountry: 'EG',
        locales: ['ar-EG'],
      },
      NOW,
    );
    expect(data).toEqual({
      suggestedCountryCode: 'EG',
      suggestedTimezone: 'Africa/Cairo',
      suggestedLocale: 'ar-EG',
      regionalSource: 'IP',
      regionalConfidence: 'HIGH',
      regionalDetectedAt: NOW,
      regionalStatus: 'DETECTED',
    });
    expect(data).not.toHaveProperty('countryCode');
    expect(data).not.toHaveProperty('baseCurrencyCode');
    expect(data).not.toHaveProperty('regionalConfirmedAt');
  });

  it('conflicting signals => no country, NEEDS_REVIEW', async () => {
    const { service } = build();
    const data = await service.toCompanyData(
      {
        v: 1,
        capturedAt: NOW.toISOString(),
        timezone: 'Africa/Cairo',
        ipCountry: 'DE',
      },
      NOW,
    );
    expect(data.suggestedCountryCode).toBeNull();
    expect(data.regionalStatus).toBe('NEEDS_REVIEW');
    expect(data.regionalConfidence).toBe('AMBIGUOUS');
  });

  it('never throws: a failing reference lookup yields {}', async () => {
    const { service, reference } = build();
    reference.listCountries.mockRejectedValue(new Error('db down'));
    await expect(
      service.toCompanyData(
        { v: 1, capturedAt: NOW.toISOString(), timezone: 'Africa/Cairo' },
        NOW,
      ),
    ).resolves.toEqual({});
  });
});
