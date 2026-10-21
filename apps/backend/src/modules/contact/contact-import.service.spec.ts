import { BadRequestException, ConflictException, Logger } from '@nestjs/common';

import { ContactImportService } from './contact-import.service';
import type { ContactService } from './contact.service';
import type { IContactRepository } from './repository/contact.repository.interface';
import type { CreateContactDto } from './dto/create-contact.dto';

/**
 * Unit tests (no database, no HTTP): ContactService and the repository are
 * mocked, everything else — the real CreateContactDto rules, class-transformer
 * normalization and class-validator — runs for real.
 */
describe('ContactImportService', () => {
  const companyId = 'company-A';
  const userId = 'user-1';

  let create: jest.Mock;
  let existsByEmail: jest.Mock;
  let service: ContactImportService;

  const row = (overrides: Record<string, unknown> = {}) => ({
    firstName: 'Amina',
    lastName: 'Hassan',
    email: 'amina@example.test',
    ...overrides,
  });

  beforeEach(() => {
    create = jest
      .fn()
      .mockImplementation((_c, _u, dto: CreateContactDto) =>
        Promise.resolve({ id: `id-${dto.firstName}`, ...dto }),
      );
    existsByEmail = jest.fn().mockResolvedValue(false);

    service = new ContactImportService(
      { create } as unknown as ContactService,
      { existsByEmail } as unknown as IContactRepository,
    );

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('validate (dry run)', () => {
    it('marks a good row valid and never writes', async () => {
      const result = await service.validate(companyId, [row()]);

      expect(result.rows).toEqual([
        { index: 0, status: 'valid', errors: [], warnings: [] },
      ]);
      expect(result.summary).toEqual({ valid: 1, duplicate: 0, invalid: 0 });
      expect(create).not.toHaveBeenCalled();
    });

    it('normalizes like POST /contacts (trim + lower-case email) before the duplicate check', async () => {
      await service.validate(companyId, [
        row({ email: '  Amina@Example.TEST ', firstName: '  Amina  ' }),
      ]);

      expect(existsByEmail).toHaveBeenCalledWith(
        companyId,
        'amina@example.test',
      );
    });

    it('reports an email that already exists in the company as a duplicate', async () => {
      existsByEmail.mockResolvedValue(true);

      const result = await service.validate(companyId, [row()]);

      expect(result.rows[0]).toMatchObject({
        status: 'duplicate',
        duplicateReason: 'existsInCompany',
      });
      expect(result.summary.duplicate).toBe(1);
    });

    it('reports a repeated email inside the same request as a duplicate of the first', async () => {
      const result = await service.validate(companyId, [
        row(),
        row({ firstName: 'Other', email: 'AMINA@example.test' }),
      ]);

      expect(result.rows.map((r) => r.status)).toEqual(['valid', 'duplicate']);
      expect(result.rows[1].duplicateReason).toBe('duplicateInBatch');
      // The second occurrence never costs another database lookup.
      expect(existsByEmail).toHaveBeenCalledTimes(1);
    });

    it('allows a row without an email, with a warning (no duplicate lookup possible)', async () => {
      const result = await service.validate(companyId, [
        row({ email: undefined }),
        row({ email: '   ' }),
      ]);

      expect(result.rows.map((r) => r.status)).toEqual(['valid', 'valid']);
      expect(result.rows[0].warnings).toEqual(['noEmail']);
      expect(existsByEmail).not.toHaveBeenCalled();
    });

    it('rejects invalid values with stable codes and field names', async () => {
      const result = await service.validate(companyId, [
        row({ email: 'not-an-email' }),
        row({ lastName: '' }),
        row({ firstName: 'A' }),
        row({ status: 'vip' }),
        row({ website: 'nope' }),
        row({ phone: '123' }),
      ]);

      const codes = result.rows.map((r) =>
        r.errors.map((e) => `${e.field}:${e.code}`),
      );

      expect(result.rows.every((r) => r.status === 'invalid')).toBe(true);
      expect(codes[0]).toContain('email:isEmail');
      expect(codes[1]).toContain('lastName:isNotEmpty');
      expect(codes[2]).toContain('firstName:isLength');
      expect(codes[3]).toContain('status:isIn');
      expect(codes[4]).toContain('website:isUrl');
      expect(codes[5]).toContain('phone:isLength');
      expect(existsByEmail).not.toHaveBeenCalled();
    });

    it('rejects fields an import may never set (assignedToId, companyId, createdById)', async () => {
      const result = await service.validate(companyId, [
        row({ assignedToId: 'user-2' }),
        row({ companyId: 'company-B' }),
        row({ createdById: 'user-9' }),
        row({ somethingElse: 'x' }),
      ]);

      expect(result.rows.every((r) => r.status === 'invalid')).toBe(true);
      expect(result.rows[0].errors.map((e) => e.code)).toContain(
        'fieldNotAllowed',
      );
      expect(result.rows[1].errors[0]).toMatchObject({
        field: 'companyId',
        code: 'whitelistValidation',
      });
      expect(result.rows[2].errors[0].code).toBe('whitelistValidation');
      expect(result.rows[3].errors[0].code).toBe('whitelistValidation');
    });

    it('rejects non-string values instead of crashing the DTO transforms', async () => {
      const result = await service.validate(companyId, [
        row({ phone: 1001234567 }),
        row({ firstName: { nested: true } }),
        row({ email: ['a@b.c'] }),
      ]);

      expect(result.rows.every((r) => r.status === 'invalid')).toBe(true);
      expect(result.rows[0].errors).toEqual([
        expect.objectContaining({ field: 'phone', code: 'isString' }),
      ]);
    });

    it('ignores prototype-polluting keys from a JSON body', async () => {
      const polluted = JSON.parse(
        '{"firstName":"Amina","lastName":"Hassan","__proto__":"x","constructor":"y"}',
      ) as Record<string, unknown>;

      const result = await service.validate(companyId, [polluted]);

      expect(result.rows[0].status).toBe('invalid');
      expect(({} as Record<string, unknown>).firstName).toBeUndefined();
    });

    it('treats null and blank optional values as not provided', async () => {
      const result = await service.validate(companyId, [
        row({ phone: null, city: '   ', notes: '' }),
      ]);

      expect(result.rows[0].status).toBe('valid');
    });

    it('does not echo the submitted values back in the errors', async () => {
      const result = await service.validate(companyId, [
        row({ email: 'secret-value-not-an-email' }),
      ]);

      expect(JSON.stringify(result)).not.toContain('secret-value-not-an-email');
    });
  });

  describe('import', () => {
    it('creates rows through ContactService.create with companyId and user taken from the caller', async () => {
      const result = await service.import(companyId, userId, [row()]);

      expect(create).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith(
        companyId,
        userId,
        expect.objectContaining({
          firstName: 'Amina',
          lastName: 'Hassan',
          email: 'amina@example.test',
        }),
      );
      expect(result.rows[0]).toMatchObject({
        index: 0,
        outcome: 'created',
        contactId: 'id-Amina',
      });
      expect(result.summary).toEqual({
        created: 1,
        duplicate: 0,
        invalid: 0,
        failed: 0,
      });
    });

    it('defaults source to "Import" but keeps a source supplied by the file', async () => {
      await service.import(companyId, userId, [
        row(),
        row({
          firstName: 'Omar',
          email: 'omar@example.test',
          source: 'HubSpot',
        }),
      ]);

      const first = create.mock.calls[0][2] as CreateContactDto;
      const second = create.mock.calls[1][2] as CreateContactDto;

      expect(first.source).toBe('Import');
      expect(second.source).toBe('HubSpot');
    });

    it('does not set a status of its own (the database default "active" applies)', async () => {
      await service.import(companyId, userId, [row()]);

      expect((create.mock.calls[0][2] as CreateContactDto).status).toBe(
        undefined,
      );
    });

    it('never calls create for invalid rows and never lets a row choose the company', async () => {
      const result = await service.import(companyId, userId, [
        row({ companyId: 'company-B' }),
        row({ assignedToId: 'user-2' }),
        row({ email: 'bad' }),
      ]);

      expect(create).not.toHaveBeenCalled();
      expect(result.rows.map((r) => r.outcome)).toEqual([
        'invalid',
        'invalid',
        'invalid',
      ]);
      expect(result.summary.invalid).toBe(3);
    });

    it('reports a ConflictException (existing or concurrent duplicate) as duplicate, not as a failure', async () => {
      create.mockRejectedValueOnce(
        new ConflictException('A contact with this email already exists.'),
      );

      const result = await service.import(companyId, userId, [row()]);

      expect(result.rows[0].outcome).toBe('duplicate');
      expect(result.rows[0].errors).toEqual([]);
      expect(result.summary).toMatchObject({ duplicate: 1, failed: 0 });
    });

    it('turns other errors into a generic failed row without leaking the error message', async () => {
      create
        .mockRejectedValueOnce(new BadRequestException('internal detail A'))
        .mockRejectedValueOnce(new Error('connection to db-host-secret lost'));

      const result = await service.import(companyId, userId, [
        row(),
        row({ firstName: 'Omar', email: 'omar@example.test' }),
      ]);

      expect(result.rows.map((r) => r.outcome)).toEqual(['failed', 'failed']);
      expect(result.rows[0].errors[0].code).toBe('saveFailed');
      expect(result.rows[1].errors[0].code).toBe('unexpected');

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('internal detail A');
      expect(serialized).not.toContain('db-host-secret');
    });

    it('keeps going after a bad row and reports a partial result per row index', async () => {
      create.mockImplementation((_c, _u, dto: CreateContactDto) =>
        dto.firstName === 'Dup'
          ? Promise.reject(new ConflictException('dup'))
          : dto.firstName === 'Boom'
            ? Promise.reject(new Error('boom'))
            : Promise.resolve({ id: `id-${dto.firstName}` }),
      );

      const result = await service.import(companyId, userId, [
        row({ firstName: 'Good', email: 'g@example.test' }),
        row({ firstName: 'Dup', email: 'd@example.test' }),
        row({ firstName: 'Bad', email: 'not-email' }),
        row({ firstName: 'Boom', email: 'b@example.test' }),
        row({ firstName: 'Last', email: 'l@example.test' }),
      ]);

      expect(result.rows.map((r) => [r.index, r.outcome])).toEqual([
        [0, 'created'],
        [1, 'duplicate'],
        [2, 'invalid'],
        [3, 'failed'],
        [4, 'created'],
      ]);
      expect(result.summary).toEqual({
        created: 2,
        duplicate: 1,
        invalid: 1,
        failed: 1,
      });
    });

    it('imports rows without an email (with the warning)', async () => {
      const result = await service.import(companyId, userId, [
        row({ email: undefined }),
      ]);

      expect(result.rows[0]).toMatchObject({
        outcome: 'created',
        warnings: ['noEmail'],
      });
    });

    it('logs only counts, never row data', async () => {
      const log = jest.spyOn(Logger.prototype, 'log');

      await service.import(companyId, userId, [
        row({ firstName: 'Zaynab', email: 'zaynab@example.test' }),
      ]);

      const logged = JSON.stringify(log.mock.calls);

      expect(logged).toContain('created=1');
      expect(logged).not.toContain('Zaynab');
      expect(logged).not.toContain('zaynab@example.test');
    });
  });
});
