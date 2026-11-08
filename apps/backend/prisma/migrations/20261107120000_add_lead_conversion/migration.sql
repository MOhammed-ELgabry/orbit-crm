-- Lead -> Contact conversion provenance.
--
-- Purely additive: three nullable columns on "Lead", two indexes and two
-- foreign keys. No existing row is rewritten (every new column is NULL for
-- existing leads), no data is backfilled, and no existing constraint or
-- index is touched. Lead.status is a plain string validated by the
-- application, so the new "converted" status needs no schema change.
--
--   convertedAt        idempotency gate: set once, by the conversion only.
--   convertedContactId the Contact this Lead became (or was linked to).
--   convertedByDealId  the closed_won Deal that triggered the conversion.

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "convertedAt" TIMESTAMP(3),
ADD COLUMN     "convertedByDealId" TEXT,
ADD COLUMN     "convertedContactId" TEXT;

-- CreateIndex
CREATE INDEX "Lead_companyId_convertedContactId_idx" ON "Lead"("companyId", "convertedContactId");

-- CreateIndex
CREATE INDEX "Lead_convertedByDealId_idx" ON "Lead"("convertedByDealId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_convertedContactId_fkey" FOREIGN KEY ("convertedContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_convertedByDealId_fkey" FOREIGN KEY ("convertedByDealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
