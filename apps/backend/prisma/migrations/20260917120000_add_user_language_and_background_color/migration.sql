-- Adds two personal Settings fields to User — language (Feature 1) and
-- backgroundColor (Feature 3). Purely additive: no existing table,
-- column, constraint, or row is modified or dropped.
--
-- language defaults to 'en' (matching the frontend's i18next
-- fallbackLng), so every existing row gets a valid, non-null value with
-- no follow-up backfill needed. Mirrors Company.businessType's existing
-- precedent: a plain validated string, not a Postgres enum, so adding a
-- future language is a one-line constant change, not a migration.
-- Allowed values ("ar" | "en") are enforced at the DTO layer
-- (UpdateUserLanguageDto), not by a DB constraint — same tradeoff
-- already used for businessType.
--
-- backgroundColor is left nullable with no default: NULL means "no
-- custom preference, use the application's built-in default", so that
-- default can keep evolving in code without a stale value baked into
-- every existing user row. The corresponding foreground/text color is
-- never persisted — it's derived deterministically from backgroundColor
-- at render time (WCAG contrast), so it can never drift out of sync
-- with it.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "backgroundColor" TEXT;