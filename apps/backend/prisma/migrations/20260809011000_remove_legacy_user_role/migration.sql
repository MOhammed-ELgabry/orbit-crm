-- Remove legacy RBAC role relation from User.
-- RBAC will be redesigned in Phase 3.

ALTER TABLE "public"."User"
DROP CONSTRAINT IF EXISTS "User_roleId_fkey";

DROP INDEX IF EXISTS "public"."User_roleId_idx";

ALTER TABLE "public"."User"
DROP COLUMN IF EXISTS "roleId";