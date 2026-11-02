-- Orbit CRM Chat Attachments -- P1-A (database layer only)
--
-- Adds metadata for chat attachments (PNG / JPEG / WebP images and PDF).
-- File CONTENT is never stored in PostgreSQL: "storageKey" is a relative
-- key into the local-disk storage root chosen by the application
-- (CHAT_ATTACHMENTS_DIR). Nothing in this migration reads or writes files.
--
-- SCOPE
--   * 2 new enum types: "ChatAttachmentStatus", "ChatAttachmentKind".
--   * 1 new table: "ChatAttachment" (+ CHECK constraints, 6 indexes, 3 FKs).
--   * 3 new functions and 3 new triggers, all attached to "ChatAttachment"
--     only: validate insert, protect update (state machine), guard delete.
--   * Purely additive. No existing table, column, index, constraint, trigger,
--     function, enum or row is created, altered, dropped or backfilled.
--     In particular "ChatMessage" and its triggers (ChatMessage_validate_insert,
--     ChatMessage_protect, ChatMessage_guard_delete) are untouched, and no
--     authentication, AuthSession, RBAC, permission or role object is touched.
--   * The only effect on existing tables is that three new foreign keys
--     REFERENCE "Company", "ChatConversation" and "ChatMessage" (all
--     ON DELETE RESTRICT). Referencing does not modify those tables, but
--     adding a foreign key takes a short SHARE ROW EXCLUSIVE lock on them;
--     see the LOCK statement below.
--   * Safe to apply before the application code that uses it is deployed
--     (the running version never touches the table). Keep
--     CHAT_ATTACHMENTS_ENABLED=false (the default) until P1-B/P2 ship.
--
-- DESIGN NOTES
--   * "ChatMessage" stays immutable. The attachment link lives on the
--     attachment row ("messageId"), never on the message, so
--     protect_chat_message / validate_chat_message_insert are not involved.
--     The application links the attachment (READY -> ATTACHED) in the SAME
--     transaction that inserts the message.
--   * "ChatAttachment" is NOT a chat-history table in the sense of
--     guard_chat_history_delete, but ATTACHED rows follow the same policy:
--     they cannot be deleted unless the transaction opted in with
--       SET LOCAL orbit.chat_purge = 'on';
--     (the existing retention / erasure / test clean-up switch). Rows that
--     were never attached (UPLOADING, READY, EXPIRED) may be deleted
--     normally so the sweeper can clean up.
--   * Foreign keys are ON DELETE RESTRICT. There is no cascade anywhere, so
--     nothing that deletes a Company, conversation or message can silently
--     delete an attachment. Consequence: a purge that deletes ChatMessage
--     rows must delete the referencing ChatAttachment rows FIRST (with
--     orbit.chat_purge = 'on'). The integration-test helper purgeChatData
--     (backend/test/integration/helpers/harness.ts) will need that ordering
--     in a later phase; it is deliberately NOT changed here.
--   * "uploaderKey" is a durable copy of the uploader's user id with no
--     foreign key (same pattern as ChatMessage."senderKey"), so a hard user
--     delete does not touch attachment history.
--   * MVP restrictions enforced in the database (defence in depth; the
--     application enforces them too):
--       - DIRECT conversations only (TEAM is rejected on insert).
--       - At most one attachment per message ("messageId" is UNIQUE).
--       - IMAGE <= 5 MiB, PDF <= 10 MiB.
--     Relaxing any of these later is a new additive migration
--     (CREATE OR REPLACE FUNCTION / DROP INDEX / replace CHECK).
--
-- CONSTRAINTS AND TRIGGERS
--   Company isolation
--     - FK "companyId" -> "Company"; insert trigger requires
--       "companyId" = the conversation's "companyId".
--     - CHECK: "storageKey" must start with "<companyId>/".
--     - Attach (UPDATE) requires the message's conversation to be the
--       attachment's conversation AND that conversation's company to equal
--       the attachment's company. All three identity columns are immutable.
--   Correct conversation and message
--     - Insert: conversation exists, is DIRECT, uploader is one of its two
--       users and is an active user of that company, company is active.
--     - Attach: message exists, belongs to the attachment's conversation,
--       was sent by the attachment's uploader, and is the NEWEST message of
--       that conversation (sequence = "nextSequence"). Because the
--       application allocates the sequence and inserts the message in the
--       same transaction, this bounds attaching to the message that
--       transaction just created. It is a bound, not a proof: the database
--       cannot see transaction boundaries without relying on xmin.
--   State machine (BEFORE UPDATE)
--       UPLOADING -> READY | EXPIRED
--       READY     -> ATTACHED | EXPIRED
--       ATTACHED and EXPIRED are final: any further change is rejected.
--     Identity and content columns (id, companyId, conversationId,
--     uploaderKey, kind, contentType, displayName, sizeBytes, sha256,
--     width, height, storageKey, createdAt) never change. The CHECK
--     "ChatAttachment_status_shape_check" fixes which of messageId /
--     readyAt / attachedAt / expiresAt must be set in each status.
--   ATTACHED protection
--     - UPDATE: rejected (final state; identical no-op updates are allowed).
--     - DELETE: rejected unless orbit.chat_purge = 'on' (SQLSTATE 23001,
--       same code as guard_chat_history_delete).
--
-- NOT VERIFIED
--   This file was reviewed by reading only. It has not been executed against
--   any database, and no Prisma command was run. Run it on a disposable test
--   database before it goes anywhere near production.
--
-- ROLLBACK (manual; the migration itself runs in one transaction and rolls
-- back completely if any statement fails)
--   Run only after the application version that uses the table is stopped or
--   rolled back, and preferably while no ATTACHED row exists:
--     SELECT "status", count(*) FROM "ChatAttachment" GROUP BY 1;
--   Dropping the table does not fire the DELETE guard and does NOT delete
--   chat messages, but it permanently loses the attachment metadata, and
--   the files already written under CHAT_ATTACHMENTS_DIR become orphans that
--   must be cleaned up separately.
--     BEGIN;
--     SET LOCAL lock_timeout = '15s';
--     DROP TABLE "ChatAttachment";
--     DROP FUNCTION "validate_chat_attachment_insert"();
--     DROP FUNCTION "protect_chat_attachment"();
--     DROP FUNCTION "guard_chat_attachment_delete"();
--     DROP TYPE "ChatAttachmentKind";
--     DROP TYPE "ChatAttachmentStatus";
--     COMMIT;
--   DROP TABLE removes the table's triggers, indexes, CHECKs and foreign
--   keys with it. If Prisma recorded this migration as failed, use
--     prisma migrate resolve --rolled-back 20261030120000_add_chat_attachments
--   If it was applied successfully and is then rolled back by hand, the
--   _prisma_migrations history must be reconciled by the operator.

BEGIN;

-- One statement, fail fast: adding the foreign keys needs SHARE ROW EXCLUSIVE
-- on the referenced tables. Taking all of them up front avoids acquiring
-- them one by one (and deadlocking part-way) against concurrent writers.
SET LOCAL lock_timeout = '15s';
LOCK TABLE "Company", "ChatConversation", "ChatMessage" IN SHARE ROW EXCLUSIVE MODE;

-- CreateEnum
CREATE TYPE "ChatAttachmentStatus" AS ENUM ('UPLOADING', 'READY', 'ATTACHED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ChatAttachmentKind" AS ENUM ('IMAGE', 'PDF');

-- CreateTable
CREATE TABLE "ChatAttachment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT,
    "uploaderKey" TEXT NOT NULL,
    "status" "ChatAttachmentStatus" NOT NULL DEFAULT 'UPLOADING',
    "kind" "ChatAttachmentKind" NOT NULL,
    "contentType" TEXT NOT NULL,
    "displayName" VARCHAR(255) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMP(3),
    "attachedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ChatAttachment_pkey" PRIMARY KEY ("id"),

    -- kind and the (content-sniffed) MIME type must agree.
    CONSTRAINT "ChatAttachment_kind_contentType_check" CHECK (
        ("kind" = 'IMAGE' AND "contentType" IN ('image/png', 'image/jpeg', 'image/webp'))
        OR
        ("kind" = 'PDF' AND "contentType" = 'application/pdf')
    ),

    -- Hard ceilings (5 MiB image, 10 MiB PDF). The application may enforce
    -- lower limits; it can never exceed these without a new migration.
    CONSTRAINT "ChatAttachment_sizeBytes_check" CHECK (
        "sizeBytes" > 0
        AND (
            ("kind" = 'IMAGE' AND "sizeBytes" <= 5242880)
            OR
            ("kind" = 'PDF' AND "sizeBytes" <= 10485760)
        )
    ),

    -- Dimensions: both NULL, or both set and only for images.
    CONSTRAINT "ChatAttachment_dimensions_check" CHECK (
        ("width" IS NULL AND "height" IS NULL)
        OR
        ("kind" = 'IMAGE'
            AND "width" IS NOT NULL AND "height" IS NOT NULL
            AND "width" BETWEEN 1 AND 65535
            AND "height" BETWEEN 1 AND 65535)
    ),

    -- displayName is for display only (never a path). Reject empty/blank
    -- names, control characters and path separators.
    CONSTRAINT "ChatAttachment_displayName_check" CHECK (
        btrim("displayName") <> ''
        AND "displayName" !~ '[[:cntrl:]]'
        AND strpos("displayName", '/') = 0
        AND strpos("displayName", E'\\') = 0
    ),

    CONSTRAINT "ChatAttachment_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),

    -- storageKey is "<companyId>/<segment>[/<segment>...]" using only
    -- [A-Za-z0-9_-] per segment: no dots, no empty segment, no traversal,
    -- and the first segment is always the attachment's own company.
    CONSTRAINT "ChatAttachment_storageKey_check" CHECK (
        char_length("storageKey") <= 255
        AND "storageKey" ~ '^[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+){1,3}$'
        AND left("storageKey", char_length("companyId") + 1) = "companyId" || '/'
    ),

    -- Which timestamps / link must (not) be present in each status.
    CONSTRAINT "ChatAttachment_status_shape_check" CHECK (
        ("status" = 'UPLOADING'
            AND "messageId" IS NULL AND "readyAt" IS NULL
            AND "attachedAt" IS NULL AND "expiresAt" IS NOT NULL)
        OR
        ("status" = 'READY'
            AND "messageId" IS NULL AND "readyAt" IS NOT NULL
            AND "attachedAt" IS NULL AND "expiresAt" IS NOT NULL)
        OR
        ("status" = 'ATTACHED'
            AND "messageId" IS NOT NULL AND "readyAt" IS NOT NULL
            AND "attachedAt" IS NOT NULL AND "expiresAt" IS NULL)
        OR
        ("status" = 'EXPIRED'
            AND "messageId" IS NULL AND "attachedAt" IS NULL
            AND "expiresAt" IS NOT NULL)
    )
);

-- CreateIndex
-- One attachment per message (MVP). A plain unique index is enough: NULLs
-- (unattached rows) are distinct in PostgreSQL, and this form is exactly
-- what Prisma generates for `messageId String? @unique`.
CREATE UNIQUE INDEX "ChatAttachment_messageId_key" ON "ChatAttachment"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatAttachment_storageKey_key" ON "ChatAttachment"("storageKey");

-- CreateIndex
CREATE INDEX "ChatAttachment_status_expiresAt_idx" ON "ChatAttachment"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "ChatAttachment_companyId_status_idx" ON "ChatAttachment"("companyId", "status");

-- CreateIndex
CREATE INDEX "ChatAttachment_uploaderKey_status_idx" ON "ChatAttachment"("uploaderKey", "status");

-- CreateIndex
CREATE INDEX "ChatAttachment_conversationId_idx" ON "ChatAttachment"("conversationId");

-- AddForeignKey
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- Insert validation: a new attachment row must belong to a DIRECT
-- conversation of its own company, uploaded by one of its two (eligible)
-- users, and must start unattached in UPLOADING.
-- ---------------------------------------------------------------------
CREATE FUNCTION "validate_chat_attachment_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  conversation_company TEXT;
  conversation_type "ChatConversationType";
  low_key TEXT;
  high_key TEXT;
BEGIN
  IF NEW."status" <> 'UPLOADING' OR NEW."messageId" IS NOT NULL THEN
    RAISE EXCEPTION 'chat attachments must be created as UPLOADING and unattached';
  END IF;
  SELECT c."companyId", c."type", c."directUserLowKey", c."directUserHighKey"
    INTO conversation_company, conversation_type, low_key, high_key
    FROM "ChatConversation" c
    WHERE c."id" = NEW."conversationId";
  IF NOT FOUND THEN RAISE EXCEPTION 'chat conversation does not exist'; END IF;
  IF conversation_company <> NEW."companyId" THEN
    RAISE EXCEPTION 'attachment company must match the conversation company';
  END IF;
  IF conversation_type <> 'DIRECT' THEN
    RAISE EXCEPTION 'attachments are only supported in direct conversations';
  END IF;
  IF NEW."uploaderKey" IS DISTINCT FROM low_key
     AND NEW."uploaderKey" IS DISTINCT FROM high_key THEN
    RAISE EXCEPTION 'attachment uploader is not a user of this direct conversation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "User" u
    WHERE u."id" = NEW."uploaderKey" AND u."companyId" = conversation_company
      AND u."isActive" = TRUE AND u."deletedAt" IS NULL
  ) THEN RAISE EXCEPTION 'attachment uploader is not eligible in this company'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "Company" co
    WHERE co."id" = conversation_company AND co."isActive" = TRUE AND co."deletedAt" IS NULL
  ) THEN RAISE EXCEPTION 'company is not eligible for chat'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ChatAttachment_validate_insert"
BEFORE INSERT ON "ChatAttachment" FOR EACH ROW
EXECUTE FUNCTION "validate_chat_attachment_insert"();

-- ---------------------------------------------------------------------
-- Update protection and state machine.
--   UPLOADING -> READY | EXPIRED
--   READY     -> ATTACHED | EXPIRED
--   ATTACHED, EXPIRED: final.
-- ---------------------------------------------------------------------
CREATE FUNCTION "protect_chat_attachment"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  message_conversation TEXT;
  message_sender TEXT;
  message_sequence BIGINT;
  conversation_company TEXT;
  conversation_next BIGINT;
BEGIN
  -- An identical rewrite changes nothing and is harmless.
  IF NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;

  IF NEW."id" <> OLD."id" OR NEW."companyId" <> OLD."companyId"
     OR NEW."conversationId" <> OLD."conversationId"
     OR NEW."uploaderKey" <> OLD."uploaderKey"
     OR NEW."kind" <> OLD."kind" OR NEW."contentType" <> OLD."contentType"
     OR NEW."displayName" <> OLD."displayName"
     OR NEW."sizeBytes" <> OLD."sizeBytes" OR NEW."sha256" <> OLD."sha256"
     OR NEW."width" IS DISTINCT FROM OLD."width"
     OR NEW."height" IS DISTINCT FROM OLD."height"
     OR NEW."storageKey" <> OLD."storageKey"
     OR NEW."createdAt" <> OLD."createdAt" THEN
    RAISE EXCEPTION 'chat attachment identity and content metadata are immutable';
  END IF;

  IF OLD."status" IN ('ATTACHED', 'EXPIRED') THEN
    RAISE EXCEPTION 'chat attachment in status % is final and cannot be modified', OLD."status";
  END IF;

  IF NOT (
    (OLD."status" = 'UPLOADING' AND NEW."status" IN ('READY', 'EXPIRED'))
    OR (OLD."status" = 'READY' AND NEW."status" IN ('ATTACHED', 'EXPIRED'))
  ) THEN
    RAISE EXCEPTION 'invalid chat attachment status transition % -> %', OLD."status", NEW."status";
  END IF;

  -- readyAt is written exactly once, by the UPLOADING -> READY transition.
  IF NEW."status" <> 'READY' AND NEW."readyAt" IS DISTINCT FROM OLD."readyAt" THEN
    RAISE EXCEPTION 'readyAt can only be set when the attachment becomes READY';
  END IF;

  IF NEW."status" = 'ATTACHED' THEN
    SELECT m."conversationId", m."senderKey", m."sequence",
           c."companyId", c."nextSequence"
      INTO message_conversation, message_sender, message_sequence,
           conversation_company, conversation_next
      FROM "ChatMessage" m
      JOIN "ChatConversation" c ON c."id" = m."conversationId"
      WHERE m."id" = NEW."messageId";
    IF NOT FOUND THEN RAISE EXCEPTION 'attachment message does not exist'; END IF;
    IF message_conversation <> NEW."conversationId" THEN
      RAISE EXCEPTION 'attachment message belongs to a different conversation';
    END IF;
    IF conversation_company <> NEW."companyId" THEN
      RAISE EXCEPTION 'attachment message belongs to a different company';
    END IF;
    IF message_sender <> NEW."uploaderKey" THEN
      RAISE EXCEPTION 'attachment can only be linked to a message sent by its uploader';
    END IF;
    IF message_sequence <> conversation_next THEN
      RAISE EXCEPTION 'attachment can only be linked to the newest message of the conversation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ChatAttachment_protect"
BEFORE UPDATE ON "ChatAttachment" FOR EACH ROW
EXECUTE FUNCTION "protect_chat_attachment"();

-- ---------------------------------------------------------------------
-- Delete guard: an attachment that is (or was) linked to a message is part
-- of chat history and follows the same explicit-purge policy as
-- guard_chat_history_delete. Unattached rows can be removed by the sweeper.
-- ---------------------------------------------------------------------
CREATE FUNCTION "guard_chat_attachment_delete"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD."status" = 'ATTACHED' OR OLD."messageId" IS NOT NULL)
     AND coalesce(current_setting('orbit.chat_purge', true), '') <> 'on' THEN
    RAISE EXCEPTION 'attached chat attachments cannot be deleted (%)', TG_TABLE_NAME
      USING ERRCODE = '23001';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "ChatAttachment_guard_delete"
BEFORE DELETE ON "ChatAttachment" FOR EACH ROW
EXECUTE FUNCTION "guard_chat_attachment_delete"();

COMMIT;
