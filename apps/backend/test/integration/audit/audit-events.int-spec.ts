/**
 * Audit Log — EVENTS, ATOMICITY and DATA PROTECTION (integration).
 *
 * Runs against the real application and the real PostgreSQL test database
 * (`orbitcrm_test` only). WRITTEN BUT NOT EXECUTED by the author: the
 * authoring sandbox has no database (see TEST_REPORT.md).
 *
 * What it proves once run against a migrated test database:
 *   - each audited write (contact, role, user, company, import, password)
 *     leaves exactly the expected audit row, written by the real repository
 *     inside the same transaction;
 *   - personal / free-text values never reach `changes` / `metadata`;
 *   - a no-op update writes no event;
 *   - ATOMICITY: when the audit insert fails, the business change is rolled
 *     back and the API answers a generic 500. The failure is injected with a
 *     temporary BEFORE INSERT trigger that only fires for one marker label of
 *     THIS run (created in beforeAll, always dropped in afterAll, and dropped
 *     defensively before creation as well);
 *   - a cross-tenant write attempt records nothing in the victim company.
 */
import request from 'supertest';

import { createAuditTestContext } from './audit-test-context';
import type { Actor, AuditTestContext } from './audit-test-context';

interface IdBody {
  data: { id: string };
}

const STRONG_PASSWORD = 'Str0ng!Passw0rd#2026';

describe('Audit Log events, atomicity and data protection (integration)', () => {
  let ctx: AuditTestContext;

  let company: string;
  let owner: Actor;
  let otherCompany: string;
  let otherOwner: Actor;
  let failMarker: string;
  let triggerName: string;
  let functionName: string;

  const create = (body: Record<string, unknown>) =>
    ctx.send('post', owner, '/contacts', body);

  async function dropFailureTrigger(): Promise<void> {
    await ctx.harness.prisma.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS "${triggerName}" ON "AuditLog"`,
    );
    await ctx.harness.prisma.$executeRawUnsafe(
      `DROP FUNCTION IF EXISTS "${functionName}"()`,
    );
  }

  beforeAll(async () => {
    ctx = await createAuditTestContext();

    company = await ctx.createCompany('audit-events');
    owner = await ctx.createUser(company, 'events-owner', { isOwner: true });
    // Owner-created members need the company's EMPLOYEE role to exist.
    await ctx.createRole(company, 'employee', ['contact:read'], 'EMPLOYEE');

    otherCompany = await ctx.createCompany('audit-events-other');
    otherOwner = await ctx.createUser(otherCompany, 'events-other-owner', {
      isOwner: true,
    });

    // Failure injection for the atomicity test. Identifier characters come
    // only from the run's UUID, never from input.
    const suffix = ctx.harness.runId.replace(/-/g, '');
    failMarker = `AUDITFAIL-${suffix}`;
    triggerName = `it_audit_fail_${suffix}`;
    functionName = `it_audit_fail_fn_${suffix}`;

    await dropFailureTrigger();
    await ctx.harness.prisma.$executeRawUnsafe(
      `CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         RAISE EXCEPTION 'injected audit failure';
       END; $$`,
    );
    await ctx.harness.prisma.$executeRawUnsafe(
      `CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "AuditLog"
       FOR EACH ROW WHEN (NEW."entityLabel" LIKE '${failMarker}%')
       EXECUTE FUNCTION "${functionName}"()`,
    );
  });

  afterAll(async () => {
    if (ctx) {
      try {
        await dropFailureTrigger();
      } finally {
        await ctx.close();
      }
    }
  });

  describe('contacts', () => {
    let contactId: string;
    const email = 'private.person@example.test';

    it('create → one `create` row with the actor, company and label', async () => {
      const res = await create({
        firstName: 'Amina',
        lastName: `Audit-${ctx.harness.runId}`,
        email,
        phone: '+201000000001',
        notes: 'very private note',
        status: 'new',
      });

      expect(res.status).toBe(201);
      contactId = (res.body as IdBody).data.id;
      ctx.harness.registerContact(contactId);

      const rows = await ctx.auditRows(company, { entityId: contactId });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: 'create',
        entityType: 'contact',
        actorUserId: owner.id,
      });
      expect(rows[0].entityLabel).toContain('Amina');
    });

    it('update → `update` row: operational fields {old,new}, personal fields {changed:true} only', async () => {
      const res = await ctx.send('patch', owner, `/contacts/${contactId}`, {
        status: 'qualified',
        email: 'changed.person@example.test',
        notes: 'another private note',
      });
      expect(res.status).toBe(200);

      const rows = await ctx.auditRows(company, {
        entityId: contactId,
        action: 'update',
      });
      expect(rows).toHaveLength(1);
      const changes = rows[0].changes as Record<string, unknown>;
      expect(changes.status).toEqual({ old: 'new', new: 'qualified' });
      expect(changes.email).toEqual({ changed: true });
      expect(changes.notes).toEqual({ changed: true });
    });

    it('NEVER stores personal values: not in changes, not in metadata', async () => {
      const rows = await ctx.auditRows(company, { entityId: contactId });
      const serialized = JSON.stringify(
        rows.map((r) => ({ changes: r.changes, metadata: r.metadata })),
      );

      for (const secret of [
        'private.person@example.test',
        'changed.person@example.test',
        '+201000000001',
        'very private note',
        'another private note',
      ]) {
        expect(serialized).not.toContain(secret);
      }
    });

    it('a no-op update writes NO audit row', async () => {
      const before = await ctx.auditRows(company, { entityId: contactId });

      const res = await ctx.send('patch', owner, `/contacts/${contactId}`, {
        status: 'qualified',
      });
      expect(res.status).toBe(200);

      expect(
        await ctx.auditRows(company, { entityId: contactId }),
      ).toHaveLength(before.length);
    });

    it('delete → `delete` row', async () => {
      const res = await ctx.send('delete', owner, `/contacts/${contactId}`);
      expect(res.status).toBe(200);

      const rows = await ctx.auditRows(company, {
        entityId: contactId,
        action: 'delete',
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].actorUserId).toBe(owner.id);
    });

    it('deleting an already-deleted / unknown contact answers 404 and records nothing', async () => {
      const before = await ctx.auditRows(company);

      const res = await ctx.send('delete', owner, `/contacts/${contactId}`);

      expect(res.status).toBe(404);
      expect(await ctx.auditRows(company)).toHaveLength(before.length);
    });
  });

  describe('atomicity (injected audit failure)', () => {
    it('create: the contact is NOT created and the API answers a generic 500', async () => {
      const lastName = `Atomic-${ctx.harness.runId}`;
      const before = await ctx.auditRows(company);

      const res = await create({ firstName: failMarker, lastName });

      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain('injected audit failure');
      expect(
        await ctx.harness.prisma.contact.count({ where: { lastName } }),
      ).toBe(0);
      expect(await ctx.auditRows(company)).toHaveLength(before.length);
    });

    it('update: the change is rolled back when its audit row fails', async () => {
      const lastName = `Atomic-update-${ctx.harness.runId}`;
      const ok = await create({ firstName: 'Fine', lastName, status: 'new' });
      expect(ok.status).toBe(201);
      const id = (ok.body as IdBody).data.id;
      ctx.harness.registerContact(id);

      // Rename to the marker: the audit label of the UPDATE now matches the
      // failure trigger, so the whole transaction must roll back.
      const res = await ctx.send('patch', owner, `/contacts/${id}`, {
        firstName: failMarker,
        status: 'qualified',
      });

      expect(res.status).toBe(500);
      const row = await ctx.harness.prisma.contact.findUniqueOrThrow({
        where: { id },
      });
      expect(row.firstName).toBe('Fine');
      expect(row.status).toBe('new');
    });
  });

  describe('bulk import', () => {
    it('writes one `create` row per imported contact (shared correlationId, source=import) and ONE summary without row data', async () => {
      const tag = ctx.harness.runId.slice(0, 8);
      const res = await ctx.send('post', owner, '/contacts/import', {
        rows: [
          {
            firstName: 'Import',
            lastName: `One-${tag}`,
            email: `one-${tag}@example.test`,
          },
          {
            firstName: 'Import',
            lastName: `Two-${tag}`,
            email: `two-${tag}@example.test`,
          },
          {
            firstName: 'Broken',
            lastName: `Bad-${tag}`,
            email: 'not-an-email',
          },
        ],
      });

      expect(res.status).toBe(200);
      const created = (
        res.body as { data: { rows: Array<{ contactId?: string }> } }
      ).data.rows
        .map((r) => r.contactId)
        .filter((id): id is string => typeof id === 'string');
      created.forEach((id) => ctx.harness.registerContact(id));
      expect(created).toHaveLength(2);

      const createRows = await ctx.auditRows(company, {
        entityId: { in: created },
        action: 'create',
      });
      expect(createRows).toHaveLength(2);
      const correlation = createRows[0].correlationId;
      expect(correlation).toBeTruthy();
      expect(createRows.every((r) => r.correlationId === correlation)).toBe(
        true,
      );
      expect(
        createRows.every(
          (r) => (r.metadata as { source?: string }).source === 'import',
        ),
      ).toBe(true);

      const summary = await ctx.auditRows(company, {
        correlationId: correlation,
        action: 'import',
      });
      expect(summary).toHaveLength(1);
      expect(summary[0].metadata).toMatchObject({
        totalRows: 3,
        created: 2,
        invalid: 1,
      });
      const serialized = JSON.stringify(summary[0]);
      expect(serialized).not.toContain('example.test');
      expect(serialized).not.toContain(`One-${tag}`);
    });
  });

  describe('roles', () => {
    it('create → update (permission diff) → delete (affected users)', async () => {
      const created = await ctx.send('post', owner, '/roles', {
        name: ctx.harness.uniqueName('audit-role'),
        permissionIds: [ctx.permissionId('contact:read')],
      });
      expect(created.status).toBe(201);
      const roleId = (created.body as IdBody).data.id;
      ctx.harness.registerRole(roleId);

      const member = await ctx.createUser(company, 'role-holder', {
        roleId,
      });

      const updated = await ctx.send('patch', owner, `/roles/${roleId}`, {
        permissionIds: [ctx.permissionId('contact:create')],
      });
      expect(updated.status).toBe(200);

      const removed = await ctx.send('delete', owner, `/roles/${roleId}`);
      expect(removed.status).toBe(200);

      const rows = await ctx.auditRows(company, { entityId: roleId });
      expect(rows.map((r) => r.action)).toEqual(['create', 'update', 'delete']);
      expect((rows[0].changes as { permissions: unknown }).permissions).toEqual(
        { added: ['contact:read'], removed: [] },
      );
      expect((rows[1].changes as { permissions: unknown }).permissions).toEqual(
        { added: ['contact:create'], removed: ['contact:read'] },
      );
      expect(rows[2].metadata).toMatchObject({ affectedUsers: 1 });

      const after = await ctx.harness.prisma.user.findUniqueOrThrow({
        where: { id: member.id },
        select: { roleId: true },
      });
      expect(after.roleId).toBeNull();
    });
  });

  describe('users', () => {
    let memberId: string;
    const email = () => ctx.harness.uniqueEmail('audit-new-member');

    it('Owner creates a member → `create` row; no email, no password in it', async () => {
      const memberEmail = email();
      const res = await ctx.send('post', owner, '/users', {
        firstName: 'New',
        lastName: 'Member',
        email: memberEmail,
        password: STRONG_PASSWORD,
      });
      expect(res.status).toBe(201);
      memberId = (res.body as IdBody).data.id;
      ctx.harness.registerUser(memberId);

      const rows = await ctx.auditRows(company, { entityId: memberId });
      expect(rows).toHaveLength(1);
      expect(rows[0].action).toBe('create');
      const serialized = JSON.stringify(rows[0]);
      expect(serialized).not.toContain(memberEmail);
      expect(serialized).not.toContain(STRONG_PASSWORD);
      expect(serialized.toLowerCase()).not.toContain('passwordhash');
    });

    it('status change → `status_change` row with isActive old/new', async () => {
      const res = await ctx.send('patch', owner, `/users/${memberId}/status`, {
        isActive: false,
      });
      expect(res.status).toBe(200);

      const rows = await ctx.auditRows(company, {
        entityId: memberId,
        action: 'status_change',
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].changes).toEqual({ isActive: { old: true, new: false } });
    });

    it('role assignment → `role_assign` row with role names from the same company', async () => {
      const roleId = await ctx.createRole(company, 'assignable', [
        'contact:read',
      ]);

      const res = await ctx.send('patch', owner, `/users/${memberId}/role`, {
        roleId,
      });
      expect(res.status).toBe(200);

      const rows = await ctx.auditRows(company, {
        entityId: memberId,
        action: 'role_assign',
      });
      expect(rows).toHaveLength(1);
      expect((rows[0].changes as { roleId: { new: string } }).roleId.new).toBe(
        roleId,
      );
      expect(rows[0].metadata).toHaveProperty('newRoleName');
    });

    it('self-service password change → `password_changed` (self_service), no values', async () => {
      const res = await ctx.send('patch', owner, `/users/${owner.id}`, {
        firstName: 'Audit',
        lastName: 'events-owner',
        password: STRONG_PASSWORD,
      });
      expect(res.status).toBe(200);

      const rows = await ctx.auditRows(company, {
        entityId: owner.id,
        action: 'password_changed',
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].metadata).toEqual({ method: 'self_service' });
      expect(rows[0].changes).toBeNull();
      expect(JSON.stringify(rows[0])).not.toContain(STRONG_PASSWORD);
    });

    it('delete → `delete` row', async () => {
      const res = await ctx.send('delete', owner, `/users/${memberId}`);
      expect(res.status).toBe(200);

      const rows = await ctx.auditRows(company, {
        entityId: memberId,
        action: 'delete',
      });
      expect(rows).toHaveLength(1);
    });
  });

  describe('company', () => {
    it('update → `company.update`: name {old,new}, contact data only {changed:true}', async () => {
      const newName = ctx.harness.uniqueName('audit-company-renamed');
      const res = await ctx.send('patch', owner, `/companies/${company}`, {
        name: newName,
        contactEmail: 'corporate.secret@example.test',
      });
      expect(res.status).toBe(200);

      const rows = await ctx.auditRows(company, {
        entityId: company,
        action: 'update',
      });
      expect(rows).toHaveLength(1);
      const changes = rows[0].changes as Record<string, unknown>;
      expect(changes.name).toMatchObject({ new: newName });
      expect(changes.contactEmail).toEqual({ changed: true });
      expect(JSON.stringify(rows[0])).not.toContain('corporate.secret');
    });
  });

  describe('tenant isolation of writes', () => {
    it("another company's Owner cannot modify this company's contact and leaves no audit row in it", async () => {
      const res = await create({
        firstName: 'Victim',
        lastName: `Iso-${ctx.harness.runId}`,
      });
      expect(res.status).toBe(201);
      const id = (res.body as IdBody).data.id;
      ctx.harness.registerContact(id);
      const before = await ctx.auditRows(company, { entityId: id });

      const attack = await ctx.send('patch', otherOwner, `/contacts/${id}`, {
        status: 'lost',
      });

      expect(attack.status).toBe(404);
      expect(await ctx.auditRows(company, { entityId: id })).toHaveLength(
        before.length,
      );
      expect(await ctx.auditRows(otherCompany, { entityId: id })).toHaveLength(
        0,
      );
    });

    it("an audit row is always written under the acting Owner's own company", async () => {
      const res = await request(ctx.http).get('/audit-logs'); // sanity: unauthenticated
      expect(res.status).toBe(401);

      const rows = await ctx.harness.prisma.auditLog.findMany({
        where: { actorUserId: owner.id },
        select: { companyId: true },
      });

      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.companyId === company)).toBe(true);
    });
  });
});
