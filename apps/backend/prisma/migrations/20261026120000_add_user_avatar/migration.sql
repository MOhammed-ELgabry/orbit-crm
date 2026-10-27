-- Adds "UserAvatar": one row per user holding the uploaded profile picture
-- (PNG / JPEG / WebP, at most 512 KiB, validated by the API before it is
-- written). Stored inside PostgreSQL so it survives redeploys and is covered
-- by the normal database backups.
--
-- SCOPE: one new table and one foreign key. Purely additive: no existing
-- table, column, index or row is changed, so it is safe to apply before or
-- after the new application version is deployed (the old version simply
-- never touches the table).
--
-- Rollback (manual; deletes every stored picture):
--   DROP TABLE "UserAvatar";

-- CreateTable
CREATE TABLE "UserAvatar" (
    "userId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAvatar_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "UserAvatar" ADD CONSTRAINT "UserAvatar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
