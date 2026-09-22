-- Adds the Deal table — a sales opportunity, independently and
-- optionally linkable to a Contact and/or a Lead (see the model
-- comment in schema.prisma for why both links are nullable and
-- unrelated to each other) — and an optional Activity.dealId so a
-- deal's lifecycle events (DealService) have somewhere to live,
-- mirroring the existing Activity.contactId association. Purely
-- additive: no existing table, column, or constraint is modified,
-- other than Activity gaining one new nullable column.

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "stage" TEXT NOT NULL DEFAULT 'new',
    "notes" TEXT,
    "expectedCloseDate" TIMESTAMP(3),
    "contactId" TEXT,
    "leadId" TEXT,
    "createdById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Deal_companyId_idx" ON "Deal"("companyId");

-- CreateIndex
CREATE INDEX "Deal_companyId_deletedAt_idx" ON "Deal"("companyId", "deletedAt");

-- CreateIndex
CREATE INDEX "Deal_companyId_stage_idx" ON "Deal"("companyId", "stage");

-- CreateIndex
CREATE INDEX "Deal_companyId_assignedToId_idx" ON "Deal"("companyId", "assignedToId");

-- CreateIndex
CREATE INDEX "Deal_companyId_contactId_idx" ON "Deal"("companyId", "contactId");

-- CreateIndex
CREATE INDEX "Deal_companyId_expectedCloseDate_idx" ON "Deal"("companyId", "expectedCloseDate");

-- CreateIndex
CREATE INDEX "Deal_createdById_idx" ON "Deal"("createdById");

-- CreateIndex
CREATE INDEX "Deal_assignedToId_idx" ON "Deal"("assignedToId");

-- CreateIndex
CREATE INDEX "Deal_contactId_idx" ON "Deal"("contactId");

-- CreateIndex
CREATE INDEX "Deal_leadId_idx" ON "Deal"("leadId");

-- CreateIndex
CREATE INDEX "Deal_deletedAt_idx" ON "Deal"("deletedAt");

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN "dealId" TEXT;

-- CreateIndex
CREATE INDEX "Activity_companyId_dealId_idx" ON "Activity"("companyId", "dealId");

-- CreateIndex
CREATE INDEX "Activity_dealId_idx" ON "Activity"("dealId");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;