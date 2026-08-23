-- Adds Company.businessType (set by the post-verification "Business Type
-- Selection" step) and OnboardingToken, a single-purpose/single-use ticket
-- table that authorizes that one step in the window before the user has a
-- session. Mirrors PasswordResetToken's shape and lifecycle exactly, just
-- scoped to companyId instead of userId. Purely additive: no existing
-- table, column, or constraint is modified.

-- AlterTable
ALTER TABLE "Company" ADD COLUMN "businessType" TEXT;

-- CreateTable
CREATE TABLE "OnboardingToken" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingToken_tokenHash_key" ON "OnboardingToken"("tokenHash");

-- CreateIndex
CREATE INDEX "OnboardingToken_companyId_idx" ON "OnboardingToken"("companyId");

-- CreateIndex
CREATE INDEX "OnboardingToken_expiresAt_idx" ON "OnboardingToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "OnboardingToken" ADD CONSTRAINT "OnboardingToken_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;