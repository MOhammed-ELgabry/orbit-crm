-- Drops Company.businessType, the column that stored the (now removed)
-- "Business Type Selection" onboarding choice. Nothing in the application
-- reads or writes it any more.
--
-- SCOPE: exactly one column on one table. No other column, table, index,
-- constraint or row is touched. In particular the "OnboardingToken" table
-- is intentionally left in place.
--
-- DESTRUCTIVE for this column only: any values it holds are discarded and
-- cannot be recovered from this migration. Deploy the new application
-- version first (it no longer selects this column), then apply this.
--
-- Rollback (manual, structure only; former values are not restored):
--   ALTER TABLE "Company" ADD COLUMN "businessType" TEXT;

-- AlterTable
ALTER TABLE "Company" DROP COLUMN "businessType";
