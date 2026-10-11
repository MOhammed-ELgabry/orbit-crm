import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';

import { ReportPeriodQueryDto } from './report-query.dto';

/** Same options as the global pipe in main.ts / the integration harness. */
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

const validate = (value: Record<string, unknown>) =>
  pipe.transform(value, {
    type: 'query',
    metatype: ReportPeriodQueryDto,
  }) as Promise<ReportPeriodQueryDto>;

const valid = {
  from: '2026-10-01',
  to: '2026-10-31',
  timezone: 'Africa/Cairo',
};

describe('ReportPeriodQueryDto', () => {
  it('accepts a normal query and trims whitespace', async () => {
    const dto = await validate({ ...valid, timezone: '  Africa/Cairo ' });

    expect(dto.timezone).toBe('Africa/Cairo');
  });

  it.each([
    'UTC',
    'America/New_York',
    'America/Argentina/Buenos_Aires',
    'Etc/GMT+3',
  ])('accepts the IANA name %s', async (timezone) => {
    await expect(validate({ ...valid, timezone })).resolves.toBeDefined();
  });

  it.each([
    '',
    'Africa/Cairo\'; DROP TABLE "Deal";--',
    'Africa Cairo',
    '../etc/passwd',
    '+03:00',
    'A'.repeat(65),
    'a/b/c/d',
  ])('rejects the malformed timezone %j', async (timezone) => {
    await expect(validate({ ...valid, timezone })).rejects.toBeDefined();
  });

  it.each(['from', 'to', 'timezone'])('requires %s', async (field) => {
    const query: Record<string, unknown> = { ...valid };
    delete query[field];

    await expect(validate(query)).rejects.toBeDefined();
  });

  it('rejects a client-supplied companyId (tenant comes only from the token)', async () => {
    await expect(
      validate({ ...valid, companyId: 'someone-elses-company' }),
    ).rejects.toBeDefined();
  });

  it.each(['10/10/2026', '2026-10-10T00:00:00Z', '2026-1-1'])(
    'rejects the non-YYYY-MM-DD date %j',
    async (from) => {
      await expect(validate({ ...valid, from })).rejects.toBeDefined();
    },
  );
});
