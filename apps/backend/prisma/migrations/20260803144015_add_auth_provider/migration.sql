-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "emailVerificationCode" TEXT,
ADD COLUMN     "emailVerificationExpires" TIMESTAMP(3),
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'local',
ADD COLUMN     "providerId" TEXT,
ALTER COLUMN "passwordHash" DROP NOT NULL,
ALTER COLUMN "isEmailVerified" SET DEFAULT false;

-- CreateIndex
CREATE INDEX "User_provider_idx" ON "public"."User"("provider");

-- CreateIndex
CREATE INDEX "User_providerId_idx" ON "public"."User"("providerId");
