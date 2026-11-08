/**
 * Lead -> Contact conversion after a won Deal (integration).
 *
 * Proves, against the real application + the real PostgreSQL test database
 * (`orbitcrm_test` only):
 *   - authentication, CSRF and the three permissions (deal:update,
 *     lead:update, contact:create) on POST, read permissions on the preview;
 *   - eligibility (only closed_won, only a deal with a lead);
 *   - the create path: Contact created, Lead kept + marked converted, Deal
 *     re-pointed (leadId kept), other open records re-pointed, audit rows
 *     sharing one correlationId, timeline visible on the Contact;
 *   - idempotency, including N concurrent requests (the unique-email index
 *     and the per-company advisory lock are real here);
 *   - duplicate policy: email blocks create, phone needs an acknowledgement,
 *     link never modifies the existing Contact;
 *   - tenant isolation (cross-company deal / contact -> 404);
 *   - a converted Lead can no longer be edited, deleted or set to
 *     `converted` by a client;
 *   - the existing PATCH /deals/:id -> closed_won does NOT convert anything.
 *
 * Needs the PostgreSQL test database (`orbitcrm_test`, migrated with the
 * 20261107120000_add_lead_conversion migration) and the Prisma engine; it
 * cannot run without them:
 *   npm run db:test:migrate && npm run test:int
 *
 * Fixtures that the harness ledger does not know (leads, deals, tasks,
 * calendar events, activities) are tracked here and deleted, children first,
 * scoped by the ledger's companies, before `harness.cleanup()`. Contacts the
 * CONVERSION creates are registered with the harness as they appear.
 */
import type { Server } from 'http';

import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { HttpExceptionFilter } from '../../../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../../../src/common/filters/prisma-exception.filter';
import { ResponseInterceptor } from '../../../src/common/interceptors/response.interceptor';
import { AppModule } from '../../../src/modules/app/app.module';

import { createTestHarness } from '../helpers/harness';
import type { TestHarness } from '../helpers/harness';

const BCRYPT_ROUNDS = 10;
const CSRF_COOKIE = 'orbit_csrf_token';
const CSRF_HEADER = 'x-csrf-token';

interface Actor {
  companyId: string;
  userId: string;
  email: string;
}

interface Session {
  agent: ReturnType<typeof request.agent>;
  csrf: string;
}

interface ResultBody {
  data: {
    outcome: 'created' | 'linked' | 'already_converted';
    contactId: string;
    leadId: string;
    dealId: string;
    relinked: { deals: number; tasks: number; calendarEvents: number };
  };
}

interface PreviewData {
  eligible: boolean;
  reason: string | null;
  alreadyConverted: { contactId: string | null } | null;
  duplicate: { blocksCreate: boolean; requiresAcknowledgement: boolean };
  candidates: Array<{ contactId: string }>;
}

const previewOf = (res: { body: unknown }): PreviewData =>
  (res.body as { data: PreviewData }).data;

describe('Lead conversion after a won deal (integration)', () => {
  let harness: TestHarness;
  let app: INestApplication | undefined;
  let httpServer: Server;
  let password: string;

  let companyA: string;
  let companyB: string;
  let full: Session; // company A, every deal/lead/contact/activity permission
  let noContactCreate: Session;
  let noLeadUpdate: Session;
  let noDealUpdate: Session;
  let roleLess: Session;
  let fullB: Session; // company B

  const ledger = {
    leadIds: [] as string[],
    dealIds: [] as string[],
    taskIds: [] as string[],
    eventIds: [] as string[],
  };
  let userA: Actor;
  let userB: Actor;
  let counter = 0;

  // ------------------------------------------------------------- fixtures

  async function createCompany(label: string): Promise<string> {
    const company = await harness.prisma.company.create({
      data: { name: harness.uniqueName(label) },
      select: { id: true },
    });
    harness.registerCompany(company.id);
    return company.id;
  }

  async function createRole(
    companyId: string,
    name: string,
    permissionKeys: string[],
  ): Promise<string> {
    const rows = await harness.prisma.permission.findMany({
      where: { resource: { in: ['deal', 'lead', 'contact', 'activity'] } },
      select: { id: true, resource: true, action: true },
    });
    const idByKey = new Map(
      rows.map((p) => [`${p.resource}:${p.action}`, p.id]),
    );
    const missing = permissionKeys.filter((k) => !idByKey.has(k));
    if (missing.length > 0) {
      throw new Error(
        `The Permission catalog of orbitcrm_test is missing: ${missing.join(', ')}.`,
      );
    }
    const role = await harness.prisma.role.create({
      data: {
        companyId,
        name,
        isSystemRole: true,
        rolePermissions: {
          createMany: {
            data: permissionKeys.map((k) => ({
              permissionId: idByKey.get(k) as string,
            })),
          },
        },
      },
      select: { id: true },
    });
    harness.registerRole(role.id);
    return role.id;
  }

  async function createUser(
    label: string,
    companyId: string,
    roleId: string | null,
    passwordHash: string,
  ): Promise<Actor> {
    const email = harness.uniqueEmail(`conv-${label}`);
    const user = await harness.prisma.user.create({
      data: {
        firstName: 'Conv',
        lastName: label.toUpperCase(),
        email,
        passwordHash,
        isEmailVerified: true,
        isActive: true,
        isOwner: false,
        roleId,
        companyId,
      },
      select: { id: true },
    });
    harness.registerUser(user.id);
    return { companyId, userId: user.id, email };
  }

  function cookieValue(
    setCookie: string[] | undefined,
    name: string,
  ): string | undefined {
    const entry = (setCookie ?? []).find((c) => c.startsWith(`${name}=`));
    return entry?.split(';')[0].slice(name.length + 1);
  }

  async function loginAs(actor: Actor): Promise<Session> {
    const agent = request.agent(httpServer);
    const res = await agent
      .post('/auth/login')
      .send({ email: actor.email, password });
    expect(res.status).toBe(200);
    const setCookie = res.headers['set-cookie'] as unknown as
      string[] | undefined;
    const csrf = cookieValue(setCookie, CSRF_COOKIE);
    expect(csrf).toBeTruthy();
    return { agent, csrf: csrf as string };
  }

  /** A fresh lead (unique email by default) + a deal in `stage`. */
  async function seed(
    companyId: string,
    createdById: string,
    opts: {
      stage?: string;
      email?: string | null;
      phone?: string | null;
      notes?: string | null;
      withLead?: boolean;
    } = {},
  ): Promise<{ leadId: string | null; dealId: string }> {
    counter += 1;
    let leadId: string | null = null;
    if (opts.withLead !== false) {
      const lead = await harness.prisma.lead.create({
        data: {
          companyId,
          createdById,
          firstName: 'Lena',
          lastName: `Lead${counter}`,
          email:
            opts.email === undefined
              ? `lena${counter}.${harness.runId}@orbit-it.invalid`
              : opts.email,
          phone: opts.phone ?? null,
          organizationName: 'Acme',
          source: 'web',
          status: 'qualified',
          notes: opts.notes === undefined ? 'wants a demo' : opts.notes,
        },
        select: { id: true },
      });
      ledger.leadIds.push(lead.id);
      leadId = lead.id;
    }
    const deal = await harness.prisma.deal.create({
      data: {
        companyId,
        createdById,
        title: `Deal ${counter}`,
        stage: opts.stage ?? 'closed_won',
        leadId,
      },
      select: { id: true },
    });
    ledger.dealIds.push(deal.id);
    return { leadId, dealId: deal.id };
  }

  async function createContact(
    companyId: string,
    createdById: string,
    data: { email?: string; phone?: string; notes?: string } = {},
  ): Promise<string> {
    counter += 1;
    const contact = await harness.prisma.contact.create({
      data: {
        companyId,
        createdById,
        firstName: 'Existing',
        lastName: `Contact${counter}`,
        email: data.email ?? null,
        phone: data.phone ?? null,
        notes: data.notes ?? null,
      },
      select: { id: true },
    });
    harness.registerContact(contact.id);
    return contact.id;
  }

  const preview = (s: Session, dealId: string) =>
    s.agent.get(`/deals/${dealId}/lead-conversion/preview`);

  const convert = (s: Session, dealId: string, body: object) =>
    s.agent
      .post(`/deals/${dealId}/lead-conversion`)
      .set(CSRF_HEADER, s.csrf)
      .send(body);

  /** Registers a contact the conversion created so cleanup can remove it. */
  const track = (body: ResultBody): ResultBody => {
    if (body.data.outcome === 'created') {
      harness.registerContact(body.data.contactId);
    }
    return body;
  };

  const contactCount = (companyId: string) =>
    harness.prisma.contact.count({ where: { companyId, deletedAt: null } });

  // ---------------------------------------------------------------- setup

  beforeAll(async () => {
    harness = await createTestHarness();
    await harness.assertDatabaseIdentity();
    await harness.recoverOrphans();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(
      new PrismaExceptionFilter(),
      new HttpExceptionFilter(),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    httpServer = app.getHttpServer() as Server;

    password = `Pw-${harness.runId}-aA1!`;
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    companyA = await createCompany('conv-a');
    companyB = await createCompany('conv-b');

    const all = ['deal', 'lead', 'contact', 'activity'].flatMap((r) =>
      ['read', 'create', 'update', 'delete'].map((a) => `${r}:${a}`),
    );
    const without = (key: string) => all.filter((k) => k !== key);

    const roleFull = await createRole(companyA, 'conv-full', all);
    const roleNoContact = await createRole(
      companyA,
      'conv-no-contact-create',
      without('contact:create'),
    );
    const roleNoLead = await createRole(
      companyA,
      'conv-no-lead-update',
      without('lead:update'),
    );
    const roleNoDeal = await createRole(
      companyA,
      'conv-no-deal-update',
      without('deal:update'),
    );
    const roleFullB = await createRole(companyB, 'conv-full-b', all);

    userA = await createUser('full', companyA, roleFull, passwordHash);
    userB = await createUser('full-b', companyB, roleFullB, passwordHash);
    const uNoContact = await createUser(
      'no-contact',
      companyA,
      roleNoContact,
      passwordHash,
    );
    const uNoLead = await createUser(
      'no-lead',
      companyA,
      roleNoLead,
      passwordHash,
    );
    const uNoDeal = await createUser(
      'no-deal',
      companyA,
      roleNoDeal,
      passwordHash,
    );
    const uRoleLess = await createUser(
      'roleless',
      companyA,
      null,
      passwordHash,
    );

    full = await loginAs(userA);
    fullB = await loginAs(userB);
    noContactCreate = await loginAs(uNoContact);
    noLeadUpdate = await loginAs(uNoLead);
    noDealUpdate = await loginAs(uNoDeal);
    roleLess = await loginAs(uRoleLess);
  });

  afterAll(async () => {
    let cleanupError: unknown;
    try {
      if (app) await app.close();
    } catch (error) {
      cleanupError = error;
    }

    if (harness) {
      try {
        const ids = harness.createdIds();
        if (ids.createdCompanyIds.length > 0) {
          const where = { companyId: { in: ids.createdCompanyIds } };
          // children first; every delete is scoped to THIS run's companies
          await harness.prisma.activity.deleteMany({ where });
          await harness.prisma.task.deleteMany({ where });
          await harness.prisma.calendarEvent.deleteMany({ where });
          await harness.prisma.deal.deleteMany({ where });
          await harness.prisma.lead.deleteMany({ where });
        }
        await harness.cleanup();
      } catch (error) {
        cleanupError ??= error;
      } finally {
        try {
          await harness.close();
        } catch (error) {
          cleanupError ??= error;
        }
      }
    }
    if (cleanupError) {
      throw cleanupError instanceof Error
        ? cleanupError
        : new Error(`Cleanup failed: ${JSON.stringify(cleanupError)}`);
    }
  });

  // ------------------------------------------- authentication / authorization

  describe('authentication and authorization', () => {
    it('401 without a session (preview and convert)', async () => {
      const { dealId } = await seed(companyA, userA.userId);
      expect(
        (
          await request(httpServer).get(
            `/deals/${dealId}/lead-conversion/preview`,
          )
        ).status,
      ).toBe(401);
      expect(
        (
          await request(httpServer)
            .post(`/deals/${dealId}/lead-conversion`)
            .send({ resolution: 'create' })
        ).status,
      ).toBe(401);
    });

    it('403 when the CSRF header is missing', async () => {
      const { dealId } = await seed(companyA, userA.userId);
      const res = await full.agent
        .post(`/deals/${dealId}/lead-conversion`)
        .send({ resolution: 'create' });
      expect(res.status).toBe(403);
    });

    it.each([
      ['contact:create', () => noContactCreate],
      ['lead:update', () => noLeadUpdate],
      ['deal:update', () => noDealUpdate],
      ['(role-less user)', () => roleLess],
    ])(
      '403 and nothing written when %s is missing',
      async (_label, session) => {
        const { dealId, leadId } = await seed(companyA, userA.userId);
        const before = await contactCount(companyA);

        const res = await convert(session(), dealId, { resolution: 'create' });

        expect(res.status).toBe(403);
        expect(await contactCount(companyA)).toBe(before);
        const lead = await harness.prisma.lead.findUniqueOrThrow({
          where: { id: leadId as string },
        });
        expect(lead.convertedAt).toBeNull();
      },
    );

    it('preview is allowed with read permissions only (role-less read-only user)', async () => {
      const { dealId } = await seed(companyA, userA.userId);
      const res = await preview(roleLess, dealId);
      // role-less users are read-only by decision D2
      expect(res.status).toBe(200);
    });
  });

  // ------------------------------------------------------------ eligibility

  describe('eligibility', () => {
    it('400 for a deal that is not closed_won; preview says so', async () => {
      const { dealId, leadId } = await seed(companyA, userA.userId, {
        stage: 'negotiation',
      });
      expect(
        (await convert(full, dealId, { resolution: 'create' })).status,
      ).toBe(400);
      const p = await preview(full, dealId);
      expect(previewOf(p)).toMatchObject({
        eligible: false,
        reason: 'deal_not_won',
      });
      const lead = await harness.prisma.lead.findUniqueOrThrow({
        where: { id: leadId as string },
      });
      expect(lead.convertedAt).toBeNull();
    });

    it('400 for a won deal without a lead', async () => {
      const { dealId } = await seed(companyA, userA.userId, {
        withLead: false,
      });
      expect(
        (await convert(full, dealId, { resolution: 'create' })).status,
      ).toBe(400);
      expect(previewOf(await preview(full, dealId)).reason).toBe(
        'deal_has_no_lead',
      );
    });

    it('400 for an invalid body (unknown field / bad resolution / link without contactId)', async () => {
      const { dealId } = await seed(companyA, userA.userId);
      expect(
        (
          await convert(full, dealId, {
            resolution: 'create',
            companyId: companyB,
          })
        ).status,
      ).toBe(400);
      expect(
        (await convert(full, dealId, { resolution: 'merge' })).status,
      ).toBe(400);
      expect((await convert(full, dealId, { resolution: 'link' })).status).toBe(
        400,
      );
    });

    it('the existing PATCH /deals/:id -> closed_won does NOT convert anything', async () => {
      const { dealId, leadId } = await seed(companyA, userA.userId, {
        stage: 'negotiation',
      });
      const before = await contactCount(companyA);
      const res = await full.agent
        .patch(`/deals/${dealId}`)
        .set(CSRF_HEADER, full.csrf)
        .send({ stage: 'closed_won' });
      expect(res.status).toBe(200);
      expect(await contactCount(companyA)).toBe(before);
      const lead = await harness.prisma.lead.findUniqueOrThrow({
        where: { id: leadId as string },
      });
      expect(lead.convertedAt).toBeNull();
      expect(lead.status).toBe('qualified');
    });
  });

  // ------------------------------------------------------------ create path

  describe('create', () => {
    it('creates the Contact, keeps and marks the Lead, re-points the Deal and open records, audits with one correlationId', async () => {
      const { dealId, leadId } = await seed(companyA, userA.userId, {
        phone: '0100-create',
      });

      // other open records of the same lead: one without a contact, one with
      const keepContact = await createContact(companyA, userA.userId);
      const taskFree = await harness.prisma.task.create({
        data: {
          companyId: companyA,
          createdById: userA.userId,
          title: 'free',
          leadId,
        },
        select: { id: true },
      });
      const taskOwned = await harness.prisma.task.create({
        data: {
          companyId: companyA,
          createdById: userA.userId,
          title: 'owned',
          leadId,
          contactId: keepContact,
        },
        select: { id: true },
      });
      const event = await harness.prisma.calendarEvent.create({
        data: {
          companyId: companyA,
          createdById: userA.userId,
          title: 'meeting',
          startAt: new Date(Date.UTC(2026, 0, 1)),
          endAt: new Date(Date.UTC(2026, 0, 1, 1)),
          leadId,
        },
        select: { id: true },
      });
      ledger.taskIds.push(taskFree.id, taskOwned.id);
      ledger.eventIds.push(event.id);

      const p = await preview(full, dealId);
      expect(p.status).toBe(200);
      expect(previewOf(p)).toMatchObject({ eligible: true, candidates: [] });

      const res = await convert(full, dealId, { resolution: 'create' });
      expect(res.status).toBe(200);
      const body = track(res.body as ResultBody);
      expect(body.data).toMatchObject({ outcome: 'created', leadId, dealId });
      expect(body.data.relinked).toEqual({
        deals: 0,
        tasks: 1,
        calendarEvents: 1,
      });

      const contact = await harness.prisma.contact.findUniqueOrThrow({
        where: { id: body.data.contactId },
      });
      expect(contact).toMatchObject({
        companyId: companyA,
        createdById: userA.userId,
        firstName: 'Lena',
        organizationName: 'Acme',
        phone: '0100-create',
        status: 'customer',
        notes: 'wants a demo',
      });

      const lead = await harness.prisma.lead.findUniqueOrThrow({
        where: { id: leadId as string },
      });
      expect(lead).toMatchObject({
        deletedAt: null, // never deleted
        status: 'converted',
        convertedContactId: contact.id,
        convertedByDealId: dealId,
      });
      expect(lead.convertedAt).toBeInstanceOf(Date);

      const deal = await harness.prisma.deal.findUniqueOrThrow({
        where: { id: dealId },
      });
      expect(deal).toMatchObject({ contactId: contact.id, leadId });

      // re-pointed only where there was no contact; leadId kept; owned task untouched
      expect(
        await harness.prisma.task.findUniqueOrThrow({
          where: { id: taskFree.id },
        }),
      ).toMatchObject({ contactId: contact.id, leadId });
      expect(
        await harness.prisma.task.findUniqueOrThrow({
          where: { id: taskOwned.id },
        }),
      ).toMatchObject({ contactId: keepContact, leadId });
      expect(
        await harness.prisma.calendarEvent.findUniqueOrThrow({
          where: { id: event.id },
        }),
      ).toMatchObject({ contactId: contact.id, leadId });

      // SYSTEM activity; Contact timeline shows the deal history
      const activities = await harness.prisma.activity.findMany({
        where: { companyId: companyA, contactId: contact.id, type: 'SYSTEM' },
      });
      expect(activities).toHaveLength(1);
      const timeline = await full.agent.get(
        `/activities?contactId=${contact.id}`,
      );
      expect(timeline.status).toBe(200);
      expect(
        JSON.stringify((timeline.body as { data: unknown }).data),
      ).toContain(activities[0].id);

      // audit: contact create + lead status_change + deal update + task + event, ONE correlationId
      const rows = await harness.prisma.auditLog.findMany({
        where: {
          companyId: companyA,
          OR: [
            { entityId: contact.id },
            { entityId: leadId as string },
            { entityId: dealId },
            { entityId: taskFree.id },
            { entityId: event.id },
          ],
        },
        select: { entityType: true, action: true, correlationId: true },
      });
      const kinds = rows.map((r) => `${r.entityType}:${r.action}`);
      expect(kinds).toEqual(
        expect.arrayContaining([
          'contact:create',
          'lead:status_change',
          'deal:update',
          'task:update',
          'calendarEvent:update',
        ]),
      );
      const correlated = rows.filter((r) => r.correlationId !== null);
      expect(new Set(correlated.map((r) => r.correlationId)).size).toBe(1);
      // no personal data in the audit trail of the contact row
      expect(
        JSON.stringify(
          await harness.prisma.auditLog.findMany({
            where: { entityId: contact.id },
          }),
        ),
      ).not.toContain('Lena');
    });

    it('the converted Lead is locked: no edit, no delete, no manual "converted"', async () => {
      const { dealId, leadId } = await seed(companyA, userA.userId);
      track(
        (await convert(full, dealId, { resolution: 'create' }))
          .body as ResultBody,
      );

      const patch = await full.agent
        .patch(`/leads/${leadId}`)
        .set(CSRF_HEADER, full.csrf)
        .send({ notes: 'x' });
      expect(patch.status).toBe(409);
      const del = await full.agent
        .delete(`/leads/${leadId}`)
        .set(CSRF_HEADER, full.csrf);
      expect(del.status).toBe(409);

      const { leadId: other } = await seed(companyA, userA.userId);
      const manual = await full.agent
        .patch(`/leads/${other}`)
        .set(CSRF_HEADER, full.csrf)
        .send({ status: 'converted' });
      expect(manual.status).toBe(400);

      const lead = await harness.prisma.lead.findUniqueOrThrow({
        where: { id: leadId as string },
      });
      expect(lead.deletedAt).toBeNull();
    });
  });

  // ------------------------------------------------------------ idempotency

  describe('idempotency and concurrency', () => {
    it('repeating the request returns already_converted with the same Contact and creates nothing', async () => {
      const { dealId } = await seed(companyA, userA.userId);
      const first = track(
        (await convert(full, dealId, { resolution: 'create' }))
          .body as ResultBody,
      );
      const before = await contactCount(companyA);

      const again = await convert(full, dealId, { resolution: 'create' });
      expect(again.status).toBe(200);
      expect((again.body as ResultBody).data).toMatchObject({
        outcome: 'already_converted',
        contactId: first.data.contactId,
      });
      expect(await contactCount(companyA)).toBe(before);

      const p = await preview(full, dealId);
      expect(previewOf(p).alreadyConverted?.contactId).toBe(
        first.data.contactId,
      );
    });

    it('a second won deal of the SAME lead is attached to the existing Contact, never a second Contact', async () => {
      const { dealId, leadId } = await seed(companyA, userA.userId);
      const first = track(
        (await convert(full, dealId, { resolution: 'create' }))
          .body as ResultBody,
      );

      const second = await harness.prisma.deal.create({
        data: {
          companyId: companyA,
          createdById: userA.userId,
          title: 'second',
          stage: 'closed_won',
          leadId,
        },
        select: { id: true },
      });
      ledger.dealIds.push(second.id);

      const before = await contactCount(companyA);
      const res = await convert(full, second.id, { resolution: 'create' });
      expect(res.status).toBe(200);
      expect((res.body as ResultBody).data.outcome).toBe('already_converted');
      expect(await contactCount(companyA)).toBe(before);
      expect(
        (
          await harness.prisma.deal.findUniqueOrThrow({
            where: { id: second.id },
          })
        ).contactId,
      ).toBe(first.data.contactId);
    });

    it('N concurrent requests for the same deal create exactly ONE Contact', async () => {
      const { dealId, leadId } = await seed(companyA, userA.userId);
      const before = await contactCount(companyA);

      const responses = await Promise.all(
        Array.from({ length: 6 }, () =>
          convert(full, dealId, { resolution: 'create' }),
        ),
      );

      const bodies = responses.map((r) => ({
        status: r.status,
        body: r.body as ResultBody,
      }));
      bodies.forEach((b) => b.status === 200 && track(b.body));

      // no response may be a 5xx; every success is created or already_converted
      expect(bodies.every((b) => b.status === 200 || b.status === 409)).toBe(
        true,
      );
      expect(
        bodies.filter(
          (b) => b.status === 200 && b.body.data.outcome === 'created',
        ),
      ).toHaveLength(1);
      expect(await contactCount(companyA)).toBe(before + 1);

      const lead = await harness.prisma.lead.findUniqueOrThrow({
        where: { id: leadId as string },
      });
      const contactIds = new Set(
        bodies
          .filter((b) => b.status === 200)
          .map((b) => b.body.data.contactId),
      );
      expect(contactIds).toEqual(new Set([lead.convertedContactId]));
    });

    it('two leads with the same email converted at once: one Contact, the other request is refused', async () => {
      const email = `same.${harness.runId}@orbit-it.invalid`;
      const a = await seed(companyA, userA.userId, { email });
      const b = await seed(companyA, userA.userId, { email });
      const before = await contactCount(companyA);

      const [ra, rb] = await Promise.all([
        convert(full, a.dealId, { resolution: 'create' }),
        convert(full, b.dealId, { resolution: 'create' }),
      ]);

      const statuses = [ra.status, rb.status].sort();
      expect(statuses).toEqual([200, 409]);
      [ra, rb].forEach((r) => r.status === 200 && track(r.body as ResultBody));
      expect(await contactCount(companyA)).toBe(before + 1);
    });
  });

  // ----------------------------------------------------- duplicate handling

  describe('duplicate handling', () => {
    it('email match: create is refused (even if acknowledged), preview lists the candidate, link works and never touches the existing Contact', async () => {
      const email = `dup.${harness.runId}@orbit-it.invalid`;
      const existing = await createContact(companyA, userA.userId, {
        email,
        notes: 'original notes',
      });
      const { dealId, leadId } = await seed(companyA, userA.userId, {
        email,
        notes: 'lead notes',
      });
      const snapshot = await harness.prisma.contact.findUniqueOrThrow({
        where: { id: existing },
      });
      const before = await contactCount(companyA);

      const p = await preview(full, dealId);
      expect(previewOf(p).duplicate).toEqual({
        blocksCreate: true,
        requiresAcknowledgement: false,
      });
      expect(
        previewOf(p).candidates.map((c: { contactId: string }) => c.contactId),
      ).toContain(existing);

      expect(
        (await convert(full, dealId, { resolution: 'create' })).status,
      ).toBe(409);
      expect(
        (
          await convert(full, dealId, {
            resolution: 'create',
            acknowledgeDuplicate: true,
          })
        ).status,
      ).toBe(409);
      expect(await contactCount(companyA)).toBe(before);

      const res = await convert(full, dealId, {
        resolution: 'link',
        contactId: existing,
      });
      expect(res.status).toBe(200);
      expect((res.body as ResultBody).data).toMatchObject({
        outcome: 'linked',
        contactId: existing,
      });

      // never modified / merged
      const after = await harness.prisma.contact.findUniqueOrThrow({
        where: { id: existing },
      });
      expect(after).toEqual(snapshot);
      expect(await contactCount(companyA)).toBe(before);

      // the lead's notes were kept as a NOTE activity on the existing contact
      const notes = await harness.prisma.activity.findMany({
        where: { companyId: companyA, contactId: existing, type: 'NOTE' },
      });
      expect(notes.map((n) => n.description)).toContain('lead notes');

      const lead = await harness.prisma.lead.findUniqueOrThrow({
        where: { id: leadId as string },
      });
      expect(lead).toMatchObject({
        status: 'converted',
        convertedContactId: existing,
      });
      expect(
        (await harness.prisma.deal.findUniqueOrThrow({ where: { id: dealId } }))
          .contactId,
      ).toBe(existing);
    });

    it('email match is case-insensitive', async () => {
      const lower = `case.${harness.runId}@orbit-it.invalid`;
      await createContact(companyA, userA.userId, {
        email: lower.toUpperCase(),
      });
      const { dealId } = await seed(companyA, userA.userId, { email: lower });
      expect(
        (await convert(full, dealId, { resolution: 'create' })).status,
      ).toBe(409);
    });

    it('phone-only match: create needs acknowledgeDuplicate', async () => {
      const phone = `0111-${harness.runId.slice(0, 8)}`;
      await createContact(companyA, userA.userId, { phone });
      const { dealId } = await seed(companyA, userA.userId, { phone });

      const p = await preview(full, dealId);
      expect(previewOf(p).duplicate).toEqual({
        blocksCreate: false,
        requiresAcknowledgement: true,
      });

      expect(
        (await convert(full, dealId, { resolution: 'create' })).status,
      ).toBe(409);
      const ok = await convert(full, dealId, {
        resolution: 'create',
        acknowledgeDuplicate: true,
      });
      expect(ok.status).toBe(200);
      expect(track(ok.body as ResultBody).data.outcome).toBe('created');
    });

    it('a deal that already has a Contact is never overwritten: create 409, link to another contact 409, link to the same one OK', async () => {
      const own = await createContact(companyA, userA.userId);
      const other = await createContact(companyA, userA.userId);
      const { dealId } = await seed(companyA, userA.userId);
      await harness.prisma.deal.update({
        where: { id: dealId },
        data: { contactId: own },
      });

      expect(
        (await convert(full, dealId, { resolution: 'create' })).status,
      ).toBe(409);
      expect(
        (await convert(full, dealId, { resolution: 'link', contactId: other }))
          .status,
      ).toBe(409);
      expect(
        (await harness.prisma.deal.findUniqueOrThrow({ where: { id: dealId } }))
          .contactId,
      ).toBe(own);

      const ok = await convert(full, dealId, {
        resolution: 'link',
        contactId: own,
      });
      expect(ok.status).toBe(200);
    });

    it('a soft-deleted contact with the same email does not block create', async () => {
      const email = `gone.${harness.runId}@orbit-it.invalid`;
      const gone = await createContact(companyA, userA.userId, { email });
      await harness.prisma.contact.update({
        where: { id: gone },
        data: { deletedAt: new Date() },
      });
      const { dealId } = await seed(companyA, userA.userId, { email });

      const res = await convert(full, dealId, { resolution: 'create' });
      expect(res.status).toBe(200);
      track(res.body as ResultBody);
    });
  });

  // ------------------------------------------------------ tenant isolation

  describe('tenant isolation', () => {
    it("company B cannot preview or convert company A's deal (404, nothing written)", async () => {
      const { dealId, leadId } = await seed(companyA, userA.userId);
      expect((await preview(fullB, dealId)).status).toBe(404);
      expect(
        (await convert(fullB, dealId, { resolution: 'create' })).status,
      ).toBe(404);
      const lead = await harness.prisma.lead.findUniqueOrThrow({
        where: { id: leadId as string },
      });
      expect(lead.convertedAt).toBeNull();
      expect(await contactCount(companyB)).toBe(0);
    });

    it('cannot link to a contact of another company (404) and the lead stays unconverted', async () => {
      const foreign = await createContact(companyA, userA.userId);
      const { dealId, leadId } = await seed(companyB, userB.userId);

      const res = await convert(fullB, dealId, {
        resolution: 'link',
        contactId: foreign,
      });
      expect(res.status).toBe(404);
      const lead = await harness.prisma.lead.findUniqueOrThrow({
        where: { id: leadId as string },
      });
      expect(lead.convertedAt).toBeNull();
      expect(
        (await harness.prisma.deal.findUniqueOrThrow({ where: { id: dealId } }))
          .contactId,
      ).toBeNull();
    });

    it('a same-email contact of ANOTHER company is not a duplicate', async () => {
      const email = `tenant.${harness.runId}@orbit-it.invalid`;
      await createContact(companyA, userA.userId, { email });
      const { dealId } = await seed(companyB, userB.userId, { email });

      const res = await convert(fullB, dealId, { resolution: 'create' });
      expect(res.status).toBe(200);
      track(res.body as ResultBody);
    });
  });
});
