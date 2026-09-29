-- Adds the CalendarEvent table — a calendar event/appointment,
-- independently and optionally linkable to a Contact, a Lead, and/or a
-- Deal (see the model comment in schema.prisma for why all three links
-- are nullable and unrelated to each other, mirroring Task exactly) —
-- and an optional Activity.calendarEventId so an event's lifecycle
-- events (CalendarService) have somewhere to live, mirroring the
-- existing Activity.dealId/taskId associations. Also grants the new
-- calendar:* permissions to every existing company's genuine default
-- roles — see the block below the AddForeignKey statements for why
-- that grant is safe to express as data in this migration rather than
-- a recurring self-heal.
--
-- Depends on 20260925090000_add_role_is_system_role having already run
-- in this deploy (the grant backfill below reads Role.isSystemRole).

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "contactId" TEXT,
    "leadId" TEXT,
    "dealId" TEXT,
    "createdById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarEvent_companyId_startAt_idx" ON "CalendarEvent"("companyId", "startAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_companyId_assignedToId_startAt_idx" ON "CalendarEvent"("companyId", "assignedToId", "startAt");

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN "calendarEventId" TEXT;

-- CreateIndex
CREATE INDEX "Activity_companyId_calendarEventId_idx" ON "Activity"("companyId", "calendarEventId");

-- CreateIndex
CREATE INDEX "Activity_calendarEventId_idx" ON "Activity"("calendarEventId");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Permission catalog: additive, idempotent on the schema's own
-- (resource, action) unique constraint — identical in spirit to
-- ensurePermissionsExist() (permission/utils/ensure-permissions-exist.util.ts),
-- just expressed as SQL because this needs to exist for every existing
-- database the moment this migration runs, rather than waiting for the
-- next company to register. Permission.id has no database-level
-- default (@default(cuid()) is applied by Prisma Client, not the
-- column), so gen_random_uuid() supplies one here — built into
-- Postgres 13+ with no extension required. These 4 rows will have
-- UUID-shaped ids rather than cuid-shaped ones; Prisma does not
-- validate id format on read, so this is a cosmetic difference only.
INSERT INTO "Permission" ("id", "resource", "action", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'calendar', 'create', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'calendar', 'read',   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'calendar', 'update', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'calendar', 'delete', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("resource", "action") DO NOTHING;

-- Default-role grant backfill for companies that already exist.
-- Scoped exclusively to "isSystemRole" = true — never to name alone —
-- so this is structurally incapable of touching a custom role, even
-- one named exactly "SALES" (see the design note in the previous
-- migration for why name alone is not a safe signal).
--
-- This is a one-time grant of exactly these 4 new keys, not a
-- recomputed "give this role its full current policy" pass:
-- RoleRepository.update replaces a role's entire permission set on
-- every edit, so for any permission that existed before this
-- deployment, "missing" and "deliberately removed by the Owner" are
-- indistinguishable — recomputing a role's full policy here could
-- silently restore something an Owner removed on purpose. These 4
-- keys did not exist before this deployment, so there is nothing they
-- could have been deliberately removed from — that is what makes a
-- one-time grant of exactly these keys, and only these keys, safe.
-- A future feature needing to reach existing companies should ship
-- its own equally-scoped migration for its own new keys, copy-adapting
-- this pattern, rather than re-running this one.
--
-- Idempotent via RolePermission's own composite primary key
-- (@@id([roleId, permissionId])) — ON CONFLICT DO NOTHING makes this
-- safe to apply to a database that already has some of these rows
-- (see Case D in the design review: a role that already had
-- calendar:read granted through some other path keeps that exact row
-- untouched and just gains whatever else its policy calls for), and
-- safe if ever replayed against a partially-seeded shadow/dev
-- database. Existing, unrelated RolePermission rows are never read,
-- updated, or deleted by this statement.
INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT r.id, p.id, CURRENT_TIMESTAMP
FROM "Role" r
JOIN "Permission" p ON p."resource" = 'calendar'
WHERE r."isSystemRole" = true
  AND r."deletedAt" IS NULL
  AND (
    (r.name = 'MANAGER'  AND p.action IN ('create', 'read', 'update', 'delete')) OR
    (r.name = 'SALES'    AND p.action IN ('create', 'read', 'update')) OR
    (r.name = 'SUPPORT'  AND p.action IN ('create', 'read', 'update')) OR
    (r.name = 'EMPLOYEE' AND p.action = 'read')
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;