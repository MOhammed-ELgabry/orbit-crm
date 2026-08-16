-- Tenant-scoped, soft-delete-aware uniqueness for Contact.email.
--
-- Design decision: uniqueness is TENANT-SCOPED (per companyId), not global —
-- two different companies may legitimately have a contact with the same
-- email address, and this must never collide. It is also SOFT-DELETE-AWARE:
-- once a contact is soft-deleted (deletedAt IS NOT NULL), its email becomes
-- reusable by a new contact in the same company, and multiple soft-deleted
-- contacts may share the same email (e.g. a contact deleted and re-imported
-- more than once over time). NULL emails are always allowed to repeat
-- (a contact with no email is not a "duplicate" of another contact with no
-- email).
--
-- This is expressed as a PostgreSQL partial unique index because Prisma's
-- schema DSL does not support filtered/partial unique constraints. It is
-- intentionally NOT declared as `@@unique` in schema.prisma, since Prisma
-- would then generate a full (non-partial) unique constraint that would
-- incorrectly block reuse of an email after soft-delete. See the comment
-- above the matching @@index([companyId, email]) in schema.prisma.
--
-- This closes a race condition: without a DB-level constraint, two
-- concurrent "create contact" requests with the same email in the same
-- company could both pass an application-level pre-check and both succeed,
-- creating a duplicate. With this index, the second concurrent insert fails
-- with a unique-violation (Postgres error 23505 / Prisma P2002), which the
-- application already maps to a clean 409 Conflict via PrismaExceptionMapper.
 
CREATE UNIQUE INDEX "Contact_companyId_email_active_key"
ON "public"."Contact" ("companyId", "email")
WHERE "deletedAt" IS NULL AND "email" IS NOT NULL;