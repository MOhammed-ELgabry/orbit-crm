-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "emailVerificationCode" TEXT,
ADD COLUMN     "emailVerificationExpires" TIMESTAMP(3),
ADD COLUMN     "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passwordResetCode" TEXT,
ADD COLUMN     "passwordResetExpires" TIMESTAMP(3),
ADD COLUMN     "refreshTokenHash" TEXT;

-- CreateIndex
CREATE INDEX "User_isEmailVerified_idx" ON "public"."User"("isEmailVerified");
