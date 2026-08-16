-- CreateTable
CREATE TABLE "public"."Contact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "jobTitle" TEXT,
    "organizationName" TEXT,
    "website" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "postalCode" TEXT,
    "notes" TEXT,
    "source" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contact_companyId_idx" ON "public"."Contact"("companyId");

-- CreateIndex
CREATE INDEX "Contact_companyId_deletedAt_idx" ON "public"."Contact"("companyId", "deletedAt");

-- CreateIndex
CREATE INDEX "Contact_companyId_email_idx" ON "public"."Contact"("companyId", "email");

-- CreateIndex
CREATE INDEX "Contact_companyId_phone_idx" ON "public"."Contact"("companyId", "phone");

-- CreateIndex
CREATE INDEX "Contact_companyId_status_idx" ON "public"."Contact"("companyId", "status");

-- CreateIndex
CREATE INDEX "Contact_companyId_assignedToId_idx" ON "public"."Contact"("companyId", "assignedToId");

-- CreateIndex
CREATE INDEX "Contact_createdById_idx" ON "public"."Contact"("createdById");

-- CreateIndex
CREATE INDEX "Contact_assignedToId_idx" ON "public"."Contact"("assignedToId");

-- CreateIndex
CREATE INDEX "Contact_deletedAt_idx" ON "public"."Contact"("deletedAt");

-- AddForeignKey
ALTER TABLE "public"."Contact" ADD CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Contact" ADD CONSTRAINT "Contact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Contact" ADD CONSTRAINT "Contact_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
