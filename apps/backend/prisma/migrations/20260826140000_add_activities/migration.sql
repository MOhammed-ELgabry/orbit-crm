-- CreateTable
CREATE TABLE "public"."Activity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "contactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Activity_companyId_idx" ON "public"."Activity"("companyId");

-- CreateIndex
CREATE INDEX "Activity_companyId_deletedAt_idx" ON "public"."Activity"("companyId", "deletedAt");

-- CreateIndex
CREATE INDEX "Activity_companyId_occurredAt_idx" ON "public"."Activity"("companyId", "occurredAt");

-- CreateIndex
CREATE INDEX "Activity_companyId_type_idx" ON "public"."Activity"("companyId", "type");

-- CreateIndex
CREATE INDEX "Activity_companyId_contactId_idx" ON "public"."Activity"("companyId", "contactId");

-- CreateIndex
CREATE INDEX "Activity_createdById_idx" ON "public"."Activity"("createdById");

-- CreateIndex
CREATE INDEX "Activity_contactId_idx" ON "public"."Activity"("contactId");

-- CreateIndex
CREATE INDEX "Activity_deletedAt_idx" ON "public"."Activity"("deletedAt");

-- AddForeignKey
ALTER TABLE "public"."Activity" ADD CONSTRAINT "Activity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Activity" ADD CONSTRAINT "Activity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Activity" ADD CONSTRAINT "Activity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "public"."Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;