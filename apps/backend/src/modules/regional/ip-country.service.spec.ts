import { existsSync } from 'fs';

import { IpCountryService } from './ip-country.service';

const config = (path?: string) => ({ get: jest.fn().mockReturnValue(path) });

describe('IpCountryService without a database', () => {
  it('is disabled and resolves nothing (the pipeline keeps working)', async () => {
    const svc = new IpCountryService(config(undefined) as never);
    await svc.onModuleInit();
    expect(svc.isAvailable).toBe(false);
    await expect(svc.resolveCountry('41.33.1.1')).resolves.toBeNull();
  });

  it('a missing / corrupt file is not fatal', async () => {
    const svc = new IpCountryService(
      config('/definitely/missing.mmdb') as never,
    );
    await svc.onModuleInit();
    expect(svc.isAvailable).toBe(false);
    await expect(svc.resolveCountry('8.8.8.8')).resolves.toBeNull();
  });
});

/**
 * Smoke test against a real MMDB when one is available locally (set
 * GEOIP_TEST_DB). It is skipped — not faked — otherwise: this repository does
 * not ship the database (licence + size).
 */
const realDb = process.env.GEOIP_TEST_DB;
const describeReal = realDb && existsSync(realDb) ? describe : describe.skip;

describeReal('IpCountryService with a real MMDB (GEOIP_TEST_DB)', () => {
  const svc = new IpCountryService(config(realDb) as never);
  beforeAll(async () => {
    await svc.onModuleInit();
  });

  it('resolves public addresses to country codes', async () => {
    expect(svc.isAvailable).toBe(true);
    await expect(svc.resolveCountry('8.8.8.8')).resolves.toBe('US');
    await expect(svc.resolveCountry('2a00:1450:4001:81b::200e')).resolves.toBe(
      'DE',
    );
  });

  it('never looks up private / reserved / malformed input', async () => {
    for (const ip of [
      '192.168.1.1',
      '127.0.0.1',
      '100.64.0.1',
      '::1',
      'junk',
      undefined,
    ]) {
      await expect(svc.resolveCountry(ip as string)).resolves.toBeNull();
    }
  });
});
