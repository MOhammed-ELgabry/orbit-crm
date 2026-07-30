-- AlterTable
ALTER TABLE "public"."Company" ADD COLUMN     "description" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "taxNumber" TEXT,
ADD COLUMN     "website" TEXT;
