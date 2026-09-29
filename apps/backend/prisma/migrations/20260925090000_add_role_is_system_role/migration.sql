-- Adds an immutable-in-practice identity marker distinguishing the 4
-- built-in staff roles (MANAGER/SALES/SUPPORT/EMPLOYEE), created by
-- ensureDefaultRolesForCompany at company-creation time, from any role
-- a human created or renamed through the ordinary Role API — including
-- one that happens to share a default role's name.
--
-- Role.name alone cannot make this distinction safely: UpdateRoleDto
-- lets a role's name change freely with no reserved-word check, and
-- RoleRepository.update replaces a role's entire permission set on
-- every edit (delete all RolePermission rows for that role, then
-- recreate from the submitted list) rather than merging — so a future
-- permission backfill that matched on name alone could silently
-- re-grant a permission an Owner had deliberately removed from their
-- own default-named role. isSystemRole exists so that backfill can
-- instead be scoped to "genuinely system-provisioned", independent of
-- what the row is currently named.
--
-- Purely additive: no existing column, constraint, or row value is
-- modified. Every row — default and custom alike — starts at false;
-- the UPDATE below only ever flips specific rows to true, never to
-- false, and never touches any other column.
ALTER TABLE "Role" ADD COLUMN "isSystemRole" BOOLEAN NOT NULL DEFAULT false;

-- One-time reconstruction of that history for roles that already
-- exist. ensureDefaultRolesForCompany has, since the migration that
-- introduced the Role/Permission/RolePermission tables
-- (20260810171629_make_user_company_optional_for_registration), always
-- created a new company's 4 default roles inside the SAME Prisma
-- interactive transaction as the Company row itself — AuthService's
-- verifyEmail() and the social-signup new-company path are the only
-- two places a Company is ever created, and both wrap company creation
-- and the ensureDefaultRolesForCompany call in one `$transaction`.
--
-- Every timestamp column in this schema defaults to Postgres's
-- CURRENT_TIMESTAMP at the column-DDL level (see the "createdAt"
-- column on every table, this one included), and CURRENT_TIMESTAMP
-- resolves once, at transaction start, and holds for every statement
-- inside that transaction. So a genuinely-provisioned default role's
-- createdAt is byte-identical to its own Company's createdAt. A role a
-- human typed one of these 4 names into — brand new, or a rename of an
-- existing custom role, or a new role created after the genuine
-- default was itself renamed away — is created in its own, later
-- request and therefore its own, later transaction, and cannot
-- coincidentally match.
--
-- Scoped to "deletedAt" IS NULL: a soft-deleted role's name slot is
-- never reused (no partial/filtered unique index frees it), so a
-- deleted default role is correctly left unflagged rather than
-- re-marked as an active system role.
UPDATE "Role" r
SET "isSystemRole" = true
FROM "Company" c
WHERE r."companyId" = c.id
  AND r."deletedAt" IS NULL
  AND r.name IN ('MANAGER', 'SALES', 'SUPPORT', 'EMPLOYEE')
  AND r."createdAt" = c."createdAt";