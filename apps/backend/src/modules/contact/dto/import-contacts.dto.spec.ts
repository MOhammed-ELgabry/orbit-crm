import { ValidationPipe } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';

import {
  CONTACT_IMPORT_MAX_ROWS_PER_REQUEST,
  ImportContactsDto,
} from './import-contacts.dto';

/**
 * Runs the body through a ValidationPipe configured exactly like the global
 * one in main.ts, so these tests describe what the real endpoint accepts.
 */
describe('ImportContactsDto (global ValidationPipe options)', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });

  const meta: ArgumentMetadata = {
    type: 'body',
    metatype: ImportContactsDto,
  };

  const run = (body: unknown) => pipe.transform(body, meta);

  it('accepts a list of plain objects and keeps every key of each row (rows are validated later, one by one)', async () => {
    const rows = [
      { firstName: 'A', unknownColumn: 'x' },
      { companyId: 'company-B' },
    ];

    const result = (await run({ rows })) as ImportContactsDto;

    expect(result.rows).toEqual(rows);
  });

  it('accepts exactly the maximum number of rows', async () => {
    const rows = Array.from(
      { length: CONTACT_IMPORT_MAX_ROWS_PER_REQUEST },
      () => ({ firstName: 'A' }),
    );

    await expect(run({ rows })).resolves.toBeDefined();
  });

  it.each([
    ['no rows key', {}],
    ['an empty list', { rows: [] }],
    ['rows that is not a list', { rows: 'abc' }],
    ['a row that is not an object', { rows: [{ firstName: 'A' }, 'x'] }],
    ['a null row', { rows: [null] }],
    ['an unexpected top-level key', { rows: [{ a: 1 }], companyId: 'c' }],
  ])('rejects %s', async (_name, body) => {
    await expect(run(body)).rejects.toMatchObject({ status: 400 });
  });

  it('rejects more rows than the per-request limit', async () => {
    const rows = Array.from(
      { length: CONTACT_IMPORT_MAX_ROWS_PER_REQUEST + 1 },
      () => ({ firstName: 'A' }),
    );

    await expect(run({ rows })).rejects.toMatchObject({ status: 400 });
  });
});
