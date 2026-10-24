import { ValidationPipe, BadRequestException } from '@nestjs/common';

import { AuditLogQueryDto } from './audit-log-query.dto';

/** Same options as the application's global ValidationPipe (see main.ts). */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const run = (value: Record<string, unknown>) =>
  pipe.transform(value, { type: 'query', metatype: AuditLogQueryDto });

describe('AuditLogQueryDto (through the real ValidationPipe)', () => {
  it('applies the defaults', async () => {
    const dto = (await run({})) as AuditLogQueryDto;

    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('REJECTS a client-supplied companyId (400): the tenant is never client-controlled', async () => {
    await expect(run({ companyId: 'company-B' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it.each(['userId', 'isOwner', 'tenantId', 'deletedAt'])(
    'rejects the unknown field %s',
    async (field) => {
      await expect(run({ [field]: 'x' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it('rejects limit above 50 and below 1', async () => {
    await expect(run({ limit: '51' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(run({ limit: '0' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an unknown action / entityType (closed vocabularies)', async () => {
    await expect(run({ action: 'purge' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(run({ entityType: 'auditLog' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects malformed dates and injection-looking ids', async () => {
    await expect(run({ from: 'yesterday' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(run({ actorUserId: "x' OR '1'='1" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('accepts a full, valid filter set', async () => {
    const dto = (await run({
      page: '2',
      limit: '50',
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-20T00:00:00.000Z',
      actorUserId: 'ckabc123',
      action: 'update',
      entityType: 'contact',
      entityId: 'ckxyz789',
      q: 'amina',
    })) as AuditLogQueryDto;

    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(50);
    expect(dto.action).toBe('update');
  });
});
