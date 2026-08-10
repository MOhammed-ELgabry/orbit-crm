-- Repair User authentication schema drift
-- Restores columns required by the 6854f64 baseline.

ALTER TABLE "public"."User"
ADD COLUMN "isOwner" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "refreshTokenHash" TEXT;