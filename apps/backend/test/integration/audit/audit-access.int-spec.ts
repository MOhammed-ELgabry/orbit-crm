/**
 * Audit Log — ACCESS CONTROL and TENANT ISOLATION (integration).
 *
 * Runs against the real application and the real PostgreSQL test database
 * (`orbitcrm_test` only). WRITTEN BUT NOT EXECUTED by the author: the
 * authoring sandbox has no database (see TEST_REPORT.md). Run it with
 * `npm run test:int -- audit` after `npm run db:test:migrate`.
 *
 * Contract encoded here (src/modules/audit):
 *   GET /audit-logs, /audit-logs/actors, /audit-logs/:id
 *   guards: JwtAuthGuard -> OwnerGuard -> AuditOwnerGuard (DB re-verification)
 *
 *   - unauthenticated                                    -> 401
 *   - a non-Owner, whatever permissions its role has     -> 403
 *   - a token that CLAIMS isOwner:true for a non-Owner   -> 403 (DB decides)
 *   - an Owner whose DB row was demoted after login      -> 403
 *   - a token whose companyId claim differs from the DB  -> 403
 *   - an Owner of a deleted / inactive company           -> 403
 *   - a deactivated Owner                                -> 401
 *   - the real Owner sees ONLY its own company's rows
 *   - `companyId` in the query is rejected (400); another company's row
 *     answers 404, never its content
 *   - there is NO write route: POST/PUT/PATCH/DELETE answer 404
 */
import request from 'supertest';

import { createAuditTestContext } from './audit-test-context';
import type { Actor, AuditTestContext } from './audit-test-context';

interface ListBody {
  data: Array<{ id: string; entityLabel: string | null }>;
  meta: { total: number };
}

describe('Audit Log access control & tenant isolation (integration)', () => {
  let ctx: AuditTestContext;

  let companyA: string;
  let companyB: string;
  let ownerA: Actor;
  let ownerB: Actor;
  let memberA: Actor; // not an owner, holds every contact permission
  let rowA1: string;
  let rowB1: string;

  async function seedRow(companyId: string, label: string): Promise<string> {
    // INSERT is the only write the application role ever has on AuditLog.
    const row = await ctx.harness.prisma.auditLog.create({
      data: {
        companyId,
        action: 'update',
        entityType: 'contact',
        entityId: `seed-${label}`,
        entityLabel: label,
      },
      select: { id: true },
    });
    return row.id;
  }

  beforeAll(async () => {
    ctx = await createAuditTestContext();

    companyA = await ctx.createCompany('audit-access-a');
    companyB = await ctx.createCompany('audit-access-b');

    ownerA = await ctx.createUser(companyA, 'owner-a', { isOwner: true });
    ownerB = await ctx.createUser(companyB, 'owner-b', { isOwner: true });

    const everything = ['create', 'read', 'update', 'delete'].map(
      (action) => `contact:${action}`,
    );
    const roleA = await ctx.createRole(companyA, 'audit-all', everything);
    memberA = await ctx.createUser(companyA, 'member-a', { roleId: roleA });

    rowA1 = await seedRow(companyA, `A-row-1-${ctx.harness.runId}`);
    await seedRow(companyA, `A-row-2-${ctx.harness.runId}`);
    rowB1 = await seedRow(companyB, `B-row-1-${ctx.harness.runId}`);
  });

  afterAll(async () => {
    if (ctx) {
      await ctx.close();
    }
  });

  describe('who may read', () => {
    it('401 without any credentials', async () => {
      const res = await request(ctx.http).get('/audit-logs');

      expect(res.status).toBe(401);
    });

    it('200 for the real Owner, with Cache-Control: no-store', async () => {
      const res = await ctx.get(ownerA, '/audit-logs');

      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('403 for a non-Owner even with every CRM permission', async () => {
      const res = await ctx.get(memberA, '/audit-logs');

      expect(res.status).toBe(403);
    });

    it('403 for a non-Owner on the other two routes as well', async () => {
      expect((await ctx.get(memberA, '/audit-logs/actors')).status).toBe(403);
      expect((await ctx.get(memberA, `/audit-logs/${rowA1}`)).status).toBe(403);
    });

    it('403 when the token FORGES isOwner:true for a non-Owner (the database decides)', async () => {
      const res = await ctx.get(memberA, '/audit-logs', { isOwner: true });

      expect(res.status).toBe(403);
    });

    it('403 when an Owner was demoted in the database after the token was issued', async () => {
      const demoted = await ctx.createUser(companyA, 'demoted', {
        isOwner: true,
      });
      const before = await ctx.get(demoted, '/audit-logs');
      expect(before.status).toBe(200);

      await ctx.harness.prisma.user.update({
        where: { id: demoted.id },
        data: { isOwner: false },
      });

      // Same token, still claims isOwner:true.
      const after = await ctx.get(demoted, '/audit-logs');
      expect(after.status).toBe(403);
    });

    it("403 when the token's companyId claim is another company's (never silently corrected)", async () => {
      const res = await ctx.get(ownerA, '/audit-logs', {
        companyId: companyB,
      });

      expect(res.status).toBe(403);
    });

    it('403 for the Owner of a soft-deleted company', async () => {
      const company = await ctx.createCompany('audit-deleted-company');
      const owner = await ctx.createUser(company, 'owner-deleted', {
        isOwner: true,
      });
      await ctx.harness.prisma.company.update({
        where: { id: company },
        data: { deletedAt: new Date() },
      });

      expect((await ctx.get(owner, '/audit-logs')).status).toBe(403);
    });

    it('403 for the Owner of an inactive company', async () => {
      const company = await ctx.createCompany('audit-inactive-company');
      const owner = await ctx.createUser(company, 'owner-inactive-co', {
        isOwner: true,
      });
      await ctx.harness.prisma.company.update({
        where: { id: company },
        data: { isActive: false },
      });

      expect((await ctx.get(owner, '/audit-logs')).status).toBe(403);
    });

    it('401 for a deactivated Owner', async () => {
      const owner = await ctx.createUser(companyA, 'owner-off', {
        isOwner: true,
        isActive: false,
      });

      expect((await ctx.get(owner, '/audit-logs')).status).toBe(401);
    });
  });

  describe('tenant isolation', () => {
    it("lists ONLY the Owner's own company rows", async () => {
      const res = await ctx.get(ownerA, '/audit-logs?limit=50');
      const body = res.body as ListBody;

      expect(res.status).toBe(200);
      const labels = body.data.map((r) => r.entityLabel ?? '');
      expect(labels.some((l) => l.startsWith('A-row-1'))).toBe(true);
      expect(labels.some((l) => l.startsWith('B-row'))).toBe(false);
    });

    it('is symmetric: Owner B never sees company A rows', async () => {
      const res = await ctx.get(ownerB, '/audit-logs?limit=50');
      const body = res.body as ListBody;

      const labels = body.data.map((r) => r.entityLabel ?? '');
      expect(labels.some((l) => l.startsWith('B-row-1'))).toBe(true);
      expect(labels.some((l) => l.startsWith('A-row'))).toBe(false);
    });

    it('rejects a client-supplied companyId (400) instead of honouring it', async () => {
      const res = await ctx.get(ownerA, `/audit-logs?companyId=${companyB}`);

      expect(res.status).toBe(400);
    });

    it("answers 404 (not 403, not the content) for another company's row", async () => {
      const res = await ctx.get(ownerA, `/audit-logs/${rowB1}`);

      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain('B-row-1');
    });

    it('returns the detail of its own row', async () => {
      const res = await ctx.get(ownerA, `/audit-logs/${rowA1}`);

      expect(res.status).toBe(200);
    });

    it('does not leak other companies into the actors list', async () => {
      await ctx.harness.prisma.auditLog.create({
        data: {
          companyId: companyB,
          actorUserId: ownerB.id,
          action: 'update',
          entityType: 'contact',
        },
      });

      const res = await ctx.get(ownerA, '/audit-logs/actors');
      const ids = (res.body as { data: Array<{ id: string }> }).data.map(
        (a) => a.id,
      );

      expect(res.status).toBe(200);
      expect(ids).not.toContain(ownerB.id);
    });

    it('enforces the 90-day maximum and the page-size cap', async () => {
      const from = new Date(Date.now() - 120 * 24 * 3600 * 1000).toISOString();

      expect((await ctx.get(ownerA, `/audit-logs?from=${from}`)).status).toBe(
        400,
      );
      expect((await ctx.get(ownerA, '/audit-logs?limit=51')).status).toBe(400);
    });
  });

  describe('read-only surface', () => {
    it.each(['post', 'put', 'patch', 'delete'] as const)(
      'has no %s route on /audit-logs (404)',
      async (method) => {
        const res = await ctx.send(method, ownerA, '/audit-logs', {});

        expect(res.status).toBe(404);
      },
    );

    it.each(['put', 'patch', 'delete'] as const)(
      'has no %s route on /audit-logs/:id (404)',
      async (method) => {
        const res = await ctx.send(method, ownerA, `/audit-logs/${rowA1}`, {});

        expect(res.status).toBe(404);
      },
    );

    it('leaves the rows untouched after every attempt above', async () => {
      const row = await ctx.harness.prisma.auditLog.findUniqueOrThrow({
        where: { id: rowA1 },
      });

      expect(row.entityLabel).toContain('A-row-1');
    });
  });
});
