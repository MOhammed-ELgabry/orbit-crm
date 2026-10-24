/**
 * Audit Log — APPEND-ONLY enforcement in the DATABASE (integration).
 *
 * Runs against the real PostgreSQL test database (`orbitcrm_test` only).
 * WRITTEN BUT NOT EXECUTED by the author: the authoring sandbox has no
 * database (see TEST_REPORT.md).
 *
 * Proves, once run against a database that has the
 * 20261022090000_add_audit_log migration applied, that the triggers reject
 * UPDATE, DELETE and TRUNCATE on "AuditLog" (all with the same message and
 * with no session-level bypass), and that a company that has audit rows cannot
 * be hard-deleted (ON DELETE RESTRICT).
 *
 * HONEST LIMIT (also in DEPLOYMENT_GUIDE.md): these triggers do not stop the
 * table owner or a superuser. This test connects as the test database role and
 * therefore only proves what that role cannot do through ordinary SQL.
 */
import { createTestHarness } from '../helpers/harness';
import type { TestHarness } from '../helpers/harness';

const APPEND_ONLY = /AuditLog is append-only/;

describe('Audit Log append-only enforcement (integration)', () => {
  let harness: TestHarness;
  let companyId: string;
  let rowId: string;

  beforeAll(async () => {
    harness = await createTestHarness();
    await harness.assertDatabaseIdentity();

    const company = await harness.prisma.company.create({
      data: { name: harness.uniqueName('audit-append-only') },
      select: { id: true },
    });
    harness.registerCompany(company.id);
    companyId = company.id;

    const row = await harness.prisma.auditLog.create({
      data: {
        companyId,
        action: 'create',
        entityType: 'contact',
        entityId: 'append-only-seed',
        entityLabel: 'seed',
      },
      select: { id: true },
    });
    rowId = row.id;
  });

  afterAll(async () => {
    if (!harness) return;

    try {
      await harness.cleanup();
    } finally {
      await harness.close();
    }
  });

  it('the three guard triggers exist (precondition of the TRUNCATE test below)', async () => {
    const triggers = await harness.prisma.$queryRaw<Array<{ tgname: string }>>`
      SELECT tgname FROM pg_trigger
      WHERE tgrelid = '"AuditLog"'::regclass AND NOT tgisinternal
      ORDER BY tgname`;

    expect(triggers.map((t) => t.tgname)).toEqual([
      'AuditLog_block_delete',
      'AuditLog_block_truncate',
      'AuditLog_block_update',
    ]);
  });

  it('rejects UPDATE through the ORM', async () => {
    await expect(
      harness.prisma.auditLog.update({
        where: { id: rowId },
        data: { entityLabel: 'tampered' },
      }),
    ).rejects.toThrow(APPEND_ONLY);
  });

  it('rejects UPDATE through raw SQL', async () => {
    await expect(
      harness.prisma
        .$executeRaw`UPDATE "AuditLog" SET "action" = 'delete' WHERE "id" = ${rowId}`,
    ).rejects.toThrow(APPEND_ONLY);
  });

  it('rejects DELETE through the ORM and through raw SQL', async () => {
    await expect(
      harness.prisma.auditLog.delete({ where: { id: rowId } }),
    ).rejects.toThrow(APPEND_ONLY);
    await expect(
      harness.prisma.$executeRaw`DELETE FROM "AuditLog" WHERE "id" = ${rowId}`,
    ).rejects.toThrow(APPEND_ONLY);
  });

  it('rejects deleteMany / updateMany', async () => {
    await expect(
      harness.prisma.auditLog.deleteMany({ where: { id: rowId } }),
    ).rejects.toThrow(APPEND_ONLY);
    await expect(
      harness.prisma.auditLog.updateMany({
        where: { id: rowId },
        data: { entityLabel: 'tampered' },
      }),
    ).rejects.toThrow(APPEND_ONLY);
  });

  it('rejects TRUNCATE (statement-level trigger)', async () => {
    await expect(
      harness.prisma.$executeRaw`TRUNCATE TABLE "AuditLog"`,
    ).rejects.toThrow(APPEND_ONLY);
  });

  it('has no session-level bypass: the chat purge switch does not unlock it', async () => {
    await expect(
      harness.prisma.$transaction([
        harness.prisma
          .$executeRaw`SELECT set_config('orbit.chat_purge', 'on', true)`,
        harness.prisma.auditLog.deleteMany({ where: { id: rowId } }),
      ]),
    ).rejects.toThrow(APPEND_ONLY);
  });

  it('the row survived every attempt unchanged', async () => {
    const row = await harness.prisma.auditLog.findUniqueOrThrow({
      where: { id: rowId },
    });

    expect(row.entityLabel).toBe('seed');
    expect(row.action).toBe('create');
  });

  it('a company that has audit rows cannot be hard-deleted (ON DELETE RESTRICT)', async () => {
    await expect(
      harness.prisma.company.delete({ where: { id: companyId } }),
    ).rejects.toThrow();

    expect(
      await harness.prisma.company.count({ where: { id: companyId } }),
    ).toBe(1);
  });

  it('the harness purge removes the test rows and leaves the triggers ENABLED afterwards', async () => {
    await harness.cleanup();

    expect(await harness.prisma.auditLog.count({ where: { companyId } })).toBe(
      0,
    );

    const states = await harness.prisma.$queryRaw<Array<{ tgenabled: string }>>`
      SELECT tgenabled FROM pg_trigger
      WHERE tgrelid = '"AuditLog"'::regclass AND NOT tgisinternal`;

    expect(states).toHaveLength(3);
    expect(states.every((s) => s.tgenabled === 'O')).toBe(true);
  });
});
