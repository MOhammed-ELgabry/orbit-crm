-- Adds Role.deletedAt so Role deletion can follow the same soft-delete
-- convention already used by Company, User, Contact, and Activity,
-- instead of being the one tenant-owned model that hard-deletes.
-- Purely additive: no existing table, column, or constraint is modified.

-- AlterTable
ALTER TABLE "Role" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Role_deletedAt_idx" ON "Role"("deletedAt");
