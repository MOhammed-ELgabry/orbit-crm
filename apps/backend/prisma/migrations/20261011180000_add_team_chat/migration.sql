-- Orbit CRM Team Chat
--
-- Additive only: no existing authentication, AuthSession, RBAC, permission,
-- role, or authorization table is modified (Company only gains one column).
--
-- Differences from the unverified Codex draft (all confirmed by executing the
-- draft against PostgreSQL 16 -- see docs/team-chat/REVIEW.md):
--   1. ChatParticipant identity is immutable (a participant row can no longer
--      be moved between conversations, which used to leave the old direct
--      conversation committed with a single participant).
--   2. DirectMessageRead and ChatMessage are immutable after insert (only the
--      FK-driven "live user deleted" SET NULL is allowed) and DELETEs of chat
--      history require an explicit purge switch.
--   3. ChatMessage.sequence must equal the conversation's allocated
--      nextSequence, and nextSequence can never decrease.
--   4. A direct conversation/participant must belong to users of the
--      conversation's own company; TEAM conversations have no participants.
--   5. The direct-pair ordering check uses COLLATE "C" so it cannot depend on
--      the database's default collation.
--   6. ChatPresenceLease.sessionId is removed (it could not be populated
--      truthfully); ChatUserPresence is added for "last seen".
--   7. Lock acquisition is done first, in one statement, with a lock_timeout,
--      so a blocked deployment fails fast and rolls back instead of waiting
--      indefinitely or deadlocking part-way through.
--
-- Membership trigger installation and backfill run in one transaction while
-- Company/User writers are locked. Keep chat disabled until all API instances
-- that can write eligibility fields run code that is aware of the triggers
-- (the triggers themselves keep the data consistent for any writer).
--
-- If this migration fails it rolls back completely (single transaction); fix
-- the reported error and re-run `prisma migrate deploy`. If Prisma marks it as
-- failed, use `prisma migrate resolve --rolled-back 20261011180000_add_team_chat`.

BEGIN;

SET LOCAL lock_timeout = '15s';
LOCK TABLE "Company", "User" IN ACCESS EXCLUSIVE MODE;

CREATE TYPE "ChatConversationType" AS ENUM ('TEAM', 'DIRECT');

ALTER TABLE "Company"
  ADD COLUMN "chatMembershipEpoch" BIGINT NOT NULL DEFAULT 0,
  ADD CONSTRAINT "Company_chatMembershipEpoch_nonnegative"
    CHECK ("chatMembershipEpoch" >= 0);

CREATE TABLE "ChatConversation" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "type" "ChatConversationType" NOT NULL,
  "conversationKey" TEXT NOT NULL,
  "directUserLowKey" TEXT,
  "directUserHighKey" TEXT,
  "nextSequence" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChatConversation_nextSequence_nonnegative"
    CHECK ("nextSequence" >= 0),
  CONSTRAINT "ChatConversation_key_matches_type" CHECK (
    ("type" = 'TEAM' AND "conversationKey" = 'TEAM'
      AND "directUserLowKey" IS NULL AND "directUserHighKey" IS NULL)
    OR
    ("type" = 'DIRECT' AND "directUserLowKey" IS NOT NULL
      AND "directUserHighKey" IS NOT NULL
      AND "directUserLowKey" COLLATE "C" < "directUserHighKey" COLLATE "C"
      AND "conversationKey" = 'DIRECT:' || length("directUserLowKey")::text
        || ':' || "directUserLowKey" || ':'
        || length("directUserHighKey")::text || ':' || "directUserHighKey")
  )
);

CREATE TABLE "ChatParticipant" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "participantKey" TEXT NOT NULL,
  "userId" TEXT,
  "readSequence" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatParticipant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChatParticipant_readSequence_nonnegative"
    CHECK ("readSequence" >= 0)
);

CREATE TABLE "ChatMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "sequence" BIGINT NOT NULL,
  "senderKey" TEXT NOT NULL,
  "senderId" TEXT,
  "senderName" TEXT NOT NULL,
  "senderAvatar" TEXT,
  "clientMessageId" TEXT NOT NULL,
  "body" VARCHAR(8000) NOT NULL,
  "audienceEpoch" BIGINT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChatMessage_sequence_positive" CHECK ("sequence" > 0),
  CONSTRAINT "ChatMessage_audienceEpoch_nonnegative"
    CHECK ("audienceEpoch" IS NULL OR "audienceEpoch" >= 0)
);

CREATE TABLE "DirectMessageRead" (
  "messageId" TEXT NOT NULL,
  "readerKey" TEXT NOT NULL,
  "readerUserId" TEXT,
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DirectMessageRead_pkey" PRIMARY KEY ("messageId")
);

CREATE TABLE "TeamMembershipInterval" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userKey" TEXT NOT NULL,
  "fromEpoch" BIGINT NOT NULL,
  "toEpoch" BIGINT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeamMembershipInterval_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeamMembershipInterval_epoch_range_check"
    CHECK ("fromEpoch" >= 0 AND ("toEpoch" IS NULL OR "toEpoch" > "fromEpoch"))
);

CREATE TABLE "ChatTeamReadCursor" (
  "companyId" TEXT NOT NULL,
  "userKey" TEXT NOT NULL,
  "lastReadSequence" BIGINT NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatTeamReadCursor_pkey" PRIMARY KEY ("companyId", "userKey"),
  CONSTRAINT "ChatTeamReadCursor_sequence_nonnegative"
    CHECK ("lastReadSequence" >= 0)
);

CREATE TABLE "ChatPresenceLease" (
  "connectionKey" TEXT NOT NULL,
  "userKey" TEXT NOT NULL,
  "userId" TEXT,
  "companyId" TEXT NOT NULL,
  "lastHeartbeat" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatPresenceLease_pkey" PRIMARY KEY ("connectionKey"),
  CONSTRAINT "ChatPresenceLease_expiry_after_heartbeat"
    CHECK ("expiresAt" > "lastHeartbeat")
);

CREATE TABLE "ChatUserPresence" (
  "companyId" TEXT NOT NULL,
  "userKey" TEXT NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatUserPresence_pkey" PRIMARY KEY ("companyId", "userKey")
);

CREATE UNIQUE INDEX "ChatConversation_companyId_conversationKey_key"
  ON "ChatConversation"("companyId", "conversationKey");
CREATE INDEX "ChatConversation_companyId_updatedAt_idx"
  ON "ChatConversation"("companyId", "updatedAt");

CREATE UNIQUE INDEX "ChatParticipant_conversationId_participantKey_key"
  ON "ChatParticipant"("conversationId", "participantKey");
CREATE INDEX "ChatParticipant_userId_idx" ON "ChatParticipant"("userId");

CREATE UNIQUE INDEX "ChatMessage_conversationId_sequence_key"
  ON "ChatMessage"("conversationId", "sequence");
CREATE UNIQUE INDEX "ChatMessage_conversationId_senderKey_clientMessageId_key"
  ON "ChatMessage"("conversationId", "senderKey", "clientMessageId");
CREATE INDEX "ChatMessage_conversationId_createdAt_sequence_idx"
  ON "ChatMessage"("conversationId", "createdAt", "sequence");

CREATE INDEX "DirectMessageRead_readerKey_readAt_idx"
  ON "DirectMessageRead"("readerKey", "readAt");

CREATE UNIQUE INDEX "TeamMembershipInterval_companyId_userKey_fromEpoch_key"
  ON "TeamMembershipInterval"("companyId", "userKey", "fromEpoch");
-- Not representable in schema.prisma (partial index). Intentionally kept:
-- at most one OPEN interval per (company, user).
CREATE UNIQUE INDEX "TeamMembershipInterval_one_open_interval"
  ON "TeamMembershipInterval"("companyId", "userKey")
  WHERE "toEpoch" IS NULL;
CREATE INDEX "TeamMembershipInterval_companyId_fromEpoch_toEpoch_idx"
  ON "TeamMembershipInterval"("companyId", "fromEpoch", "toEpoch");

CREATE INDEX "ChatPresenceLease_companyId_userKey_expiresAt_idx"
  ON "ChatPresenceLease"("companyId", "userKey", "expiresAt");
CREATE INDEX "ChatPresenceLease_expiresAt_idx" ON "ChatPresenceLease"("expiresAt");

ALTER TABLE "ChatConversation"
  ADD CONSTRAINT "ChatConversation_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatParticipant"
  ADD CONSTRAINT "ChatParticipant_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ChatParticipant_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChatMessage"
  ADD CONSTRAINT "ChatMessage_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ChatMessage_senderId_fkey"
  FOREIGN KEY ("senderId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DirectMessageRead"
  ADD CONSTRAINT "DirectMessageRead_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DirectMessageRead_readerUserId_fkey"
  FOREIGN KEY ("readerUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TeamMembershipInterval"
  ADD CONSTRAINT "TeamMembershipInterval_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatTeamReadCursor"
  ADD CONSTRAINT "ChatTeamReadCursor_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatPresenceLease"
  ADD CONSTRAINT "ChatPresenceLease_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ChatPresenceLease_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatUserPresence"
  ADD CONSTRAINT "ChatUserPresence_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- Initial membership epochs/intervals (writers are locked above).
-- ---------------------------------------------------------------------

UPDATE "Company" AS c
SET "chatMembershipEpoch" = 1
WHERE c."isActive" = TRUE AND c."deletedAt" IS NULL
  AND EXISTS (
    SELECT 1 FROM "User" AS u
    WHERE u."companyId" = c."id" AND u."isActive" = TRUE AND u."deletedAt" IS NULL
  );

INSERT INTO "TeamMembershipInterval" ("id", "companyId", "userKey", "fromEpoch")
SELECT md5('chat-membership:' || c."id" || ':' || u."id" || ':1'),
       c."id", u."id", 1
FROM "Company" AS c
JOIN "User" AS u ON u."companyId" = c."id"
WHERE c."isActive" = TRUE AND c."deletedAt" IS NULL
  AND u."isActive" = TRUE AND u."deletedAt" IS NULL;

-- ---------------------------------------------------------------------
-- History protection
-- ---------------------------------------------------------------------

-- Chat history is never deleted by the application. A DELETE is only
-- accepted inside a transaction that explicitly opted in with
--   SET LOCAL orbit.chat_purge = 'on';
-- (retention / erasure jobs, test clean-up). Without it a bug or a stray
-- statement cannot silently remove history.
CREATE FUNCTION "guard_chat_history_delete"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('orbit.chat_purge', true), '') <> 'on' THEN
    RAISE EXCEPTION 'chat history rows cannot be deleted (%)', TG_TABLE_NAME
      USING ERRCODE = '23001';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "ChatConversation_guard_delete" BEFORE DELETE ON "ChatConversation"
  FOR EACH ROW EXECUTE FUNCTION "guard_chat_history_delete"();
CREATE TRIGGER "ChatParticipant_guard_delete" BEFORE DELETE ON "ChatParticipant"
  FOR EACH ROW EXECUTE FUNCTION "guard_chat_history_delete"();
CREATE TRIGGER "ChatMessage_guard_delete" BEFORE DELETE ON "ChatMessage"
  FOR EACH ROW EXECUTE FUNCTION "guard_chat_history_delete"();
CREATE TRIGGER "DirectMessageRead_guard_delete" BEFORE DELETE ON "DirectMessageRead"
  FOR EACH ROW EXECUTE FUNCTION "guard_chat_history_delete"();
CREATE TRIGGER "TeamMembershipInterval_guard_delete" BEFORE DELETE ON "TeamMembershipInterval"
  FOR EACH ROW EXECUTE FUNCTION "guard_chat_history_delete"();

-- ---------------------------------------------------------------------
-- Membership epochs/intervals
-- ---------------------------------------------------------------------

-- This trigger is the database synchronization point for existing user
-- create/status/soft-delete paths and any future company reassignment path.
CREATE FUNCTION "sync_team_membership_for_user"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  old_company TEXT;
  new_company TEXT;
  old_open BOOLEAN := FALSE;
  new_eligible BOOLEAN := FALSE;
  new_epoch BIGINT;
  effective_user_key TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_company := OLD."companyId"; END IF;
  IF TG_OP <> 'DELETE' THEN new_company := NEW."companyId"; END IF;
  effective_user_key := CASE WHEN TG_OP = 'DELETE' THEN OLD."id" ELSE NEW."id" END;

  -- Stable lock order for moves between companies.
  PERFORM c."id" FROM "Company" c
  WHERE c."id" = old_company OR c."id" = new_company
  ORDER BY c."id" FOR UPDATE;

  IF old_company IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM "TeamMembershipInterval" i
      WHERE i."companyId" = old_company AND i."userKey" = effective_user_key
        AND i."toEpoch" IS NULL
    ) INTO old_open;
  END IF;

  IF TG_OP <> 'DELETE' AND new_company IS NOT NULL
     AND NEW."isActive" = TRUE AND NEW."deletedAt" IS NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM "Company" c
      WHERE c."id" = new_company AND c."isActive" = TRUE AND c."deletedAt" IS NULL
    ) INTO new_eligible;
  END IF;

  IF old_open AND (old_company IS DISTINCT FROM new_company OR NOT new_eligible) THEN
    UPDATE "Company" SET "chatMembershipEpoch" = "chatMembershipEpoch" + 1
    WHERE "id" = old_company RETURNING "chatMembershipEpoch" INTO new_epoch;
    UPDATE "TeamMembershipInterval"
      SET "toEpoch" = new_epoch
      WHERE "companyId" = old_company AND "userKey" = effective_user_key
        AND "toEpoch" IS NULL;
    old_open := FALSE;
  END IF;

  IF new_eligible AND NOT (old_open AND old_company = new_company) THEN
    UPDATE "Company" SET "chatMembershipEpoch" = "chatMembershipEpoch" + 1
    WHERE "id" = new_company RETURNING "chatMembershipEpoch" INTO new_epoch;
    INSERT INTO "TeamMembershipInterval" ("id", "companyId", "userKey", "fromEpoch")
      VALUES (md5('chat-membership:' || new_company || ':' || effective_user_key || ':' || new_epoch::text),
              new_company, effective_user_key, new_epoch);
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "User_sync_team_membership"
AFTER INSERT OR DELETE OR UPDATE OF "companyId", "isActive", "deletedAt"
ON "User" FOR EACH ROW EXECUTE FUNCTION "sync_team_membership_for_user"();

-- Company deactivation/deletion closes all current intervals at one epoch;
-- reactivation opens current eligible users at one new epoch.
CREATE FUNCTION "sync_team_membership_for_company"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  was_eligible BOOLEAN;
  is_eligible BOOLEAN;
  new_epoch BIGINT;
BEGIN
  was_eligible := OLD."isActive" = TRUE AND OLD."deletedAt" IS NULL;
  is_eligible := NEW."isActive" = TRUE AND NEW."deletedAt" IS NULL;
  IF was_eligible = is_eligible THEN RETURN NEW; END IF;

  UPDATE "Company" SET "chatMembershipEpoch" = "chatMembershipEpoch" + 1
  WHERE "id" = NEW."id" RETURNING "chatMembershipEpoch" INTO new_epoch;

  IF NOT is_eligible THEN
    UPDATE "TeamMembershipInterval" SET "toEpoch" = new_epoch
    WHERE "companyId" = NEW."id" AND "toEpoch" IS NULL;
  ELSE
    INSERT INTO "TeamMembershipInterval" ("id", "companyId", "userKey", "fromEpoch")
    SELECT md5('chat-membership:' || NEW."id" || ':' || u."id" || ':' || new_epoch::text),
           NEW."id", u."id", new_epoch
    FROM "User" u
    WHERE u."companyId" = NEW."id" AND u."isActive" = TRUE AND u."deletedAt" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "TeamMembershipInterval" i
        WHERE i."companyId" = NEW."id" AND i."userKey" = u."id" AND i."toEpoch" IS NULL
      );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Company_sync_team_membership"
AFTER UPDATE OF "isActive", "deletedAt" ON "Company"
FOR EACH ROW EXECUTE FUNCTION "sync_team_membership_for_company"();

-- Membership intervals are append-only except for closing an open interval.
CREATE FUNCTION "protect_team_membership_interval"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" <> OLD."id" OR NEW."companyId" <> OLD."companyId"
     OR NEW."userKey" <> OLD."userKey" OR NEW."fromEpoch" <> OLD."fromEpoch"
     OR NEW."createdAt" <> OLD."createdAt"
     OR (OLD."toEpoch" IS NOT NULL AND NEW."toEpoch" IS DISTINCT FROM OLD."toEpoch") THEN
    RAISE EXCEPTION 'membership intervals may only be closed, never rewritten';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "TeamMembershipInterval_protect"
BEFORE UPDATE ON "TeamMembershipInterval"
FOR EACH ROW EXECUTE FUNCTION "protect_team_membership_interval"();

-- ---------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------

-- A direct conversation must be between two users of the conversation's own
-- company (checked at creation: users may legitimately move later, history
-- keeps its original identity).
CREATE FUNCTION "validate_chat_conversation_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."type" = 'DIRECT' THEN
    IF (SELECT count(*) FROM "User" u
        WHERE u."id" IN (NEW."directUserLowKey", NEW."directUserHighKey")
          AND u."companyId" = NEW."companyId") <> 2 THEN
      RAISE EXCEPTION 'direct conversation users must belong to the conversation company';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ChatConversation_validate_insert"
BEFORE INSERT ON "ChatConversation"
FOR EACH ROW EXECUTE FUNCTION "validate_chat_conversation_insert"();

-- Conversation identity is immutable and the sequence counter is monotonic.
CREATE FUNCTION "protect_chat_conversation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" <> OLD."id" OR NEW."companyId" <> OLD."companyId"
     OR NEW."type" <> OLD."type" OR NEW."conversationKey" <> OLD."conversationKey"
     OR NEW."directUserLowKey" IS DISTINCT FROM OLD."directUserLowKey"
     OR NEW."directUserHighKey" IS DISTINCT FROM OLD."directUserHighKey"
     OR NEW."createdAt" <> OLD."createdAt" THEN
    RAISE EXCEPTION 'chat conversation identity is immutable';
  END IF;
  IF NEW."nextSequence" < OLD."nextSequence" THEN
    RAISE EXCEPTION 'conversation sequence counter cannot move backwards';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ChatConversation_protect"
BEFORE UPDATE ON "ChatConversation"
FOR EACH ROW EXECUTE FUNCTION "protect_chat_conversation"();

-- ---------------------------------------------------------------------
-- Participants (DIRECT conversations only)
-- ---------------------------------------------------------------------

CREATE FUNCTION "validate_chat_participant"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  conversation_type "ChatConversationType";
  conversation_company TEXT;
  low_key TEXT;
  high_key TEXT;
BEGIN
  SELECT c."type", c."companyId", c."directUserLowKey", c."directUserHighKey"
    INTO conversation_type, conversation_company, low_key, high_key
    FROM "ChatConversation" c WHERE c."id" = NEW."conversationId";
  IF NOT FOUND THEN RAISE EXCEPTION 'chat conversation does not exist'; END IF;
  IF conversation_type <> 'DIRECT' THEN
    RAISE EXCEPTION 'only direct conversations have participant rows';
  END IF;
  IF NEW."userId" IS NOT NULL AND NEW."userId" <> NEW."participantKey" THEN
    RAISE EXCEPTION 'participant live user must match participant key';
  END IF;
  IF NEW."participantKey" NOT IN (low_key, high_key) THEN
    RAISE EXCEPTION 'direct participant is outside the canonical pair';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "User" u
    WHERE u."id" = NEW."participantKey" AND u."companyId" = conversation_company
  ) THEN
    RAISE EXCEPTION 'direct participant must belong to the conversation company';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ChatParticipant_validate_identity"
BEFORE INSERT ON "ChatParticipant"
FOR EACH ROW EXECUTE FUNCTION "validate_chat_participant"();

-- Identity cannot be rewritten: a row cannot move between conversations or
-- change owner. The only allowed identity change is the FK-driven SET NULL of
-- the live user reference when a user row is hard-deleted.
CREATE FUNCTION "protect_chat_participant"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" <> OLD."id" OR NEW."conversationId" <> OLD."conversationId"
     OR NEW."participantKey" <> OLD."participantKey"
     OR NEW."createdAt" <> OLD."createdAt"
     OR (NEW."userId" IS NOT NULL AND NEW."userId" IS DISTINCT FROM OLD."userId") THEN
    RAISE EXCEPTION 'chat participant identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ChatParticipant_protect"
BEFORE UPDATE ON "ChatParticipant"
FOR EACH ROW EXECUTE FUNCTION "protect_chat_participant"();

-- Deferred count check permits creating the conversation and its two
-- participants in one transaction, but rejects commit with 0, 1, or >2. A
-- participant can no longer be updated across conversations, so INSERT and
-- DELETE are the only events that can change a conversation's participant set.
CREATE FUNCTION "assert_direct_conversation_has_two_participants"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  conversation_id TEXT;
  conversation_type "ChatConversationType";
  low_key TEXT;
  high_key TEXT;
  participant_count BIGINT;
  matched_count BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'ChatConversation' THEN
    conversation_id := NEW."id";
  ELSIF TG_OP = 'DELETE' THEN
    conversation_id := OLD."conversationId";
  ELSE
    conversation_id := NEW."conversationId";
  END IF;

  SELECT c."type", c."directUserLowKey", c."directUserHighKey"
    INTO conversation_type, low_key, high_key
    FROM "ChatConversation" c WHERE c."id" = conversation_id;
  IF NOT FOUND OR conversation_type <> 'DIRECT' THEN RETURN NULL; END IF;

  SELECT count(*), count(*) FILTER (WHERE p."participantKey" IN (low_key, high_key))
    INTO participant_count, matched_count
    FROM "ChatParticipant" p WHERE p."conversationId" = conversation_id;
  IF participant_count <> 2 OR matched_count <> 2 THEN
    RAISE EXCEPTION 'direct conversation must have exactly its two canonical participants';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "ChatConversation_two_participants"
AFTER INSERT ON "ChatConversation" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "assert_direct_conversation_has_two_participants"();
CREATE CONSTRAINT TRIGGER "ChatParticipant_two_participants"
AFTER INSERT OR DELETE ON "ChatParticipant"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "assert_direct_conversation_has_two_participants"();

-- ---------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------

-- Check message kind, canonical sender, live tenant eligibility, allocated
-- sequence and freeze the current team epoch under a shared company-row lock.
-- If a sender read an old epoch before waiting on a membership change, reject
-- and retry (SQLSTATE 40001) rather than committing an ambiguous audience.
--
-- The sequence must equal the conversation's nextSequence: the application
-- allocates it with `UPDATE ... SET "nextSequence" = "nextSequence" + 1` in the
-- SAME transaction, which holds the conversation row lock until commit, so the
-- value read here cannot be changed by anyone else.
CREATE FUNCTION "validate_chat_message_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  conversation_company TEXT;
  conversation_type "ChatConversationType";
  low_key TEXT;
  high_key TEXT;
  allocated_sequence BIGINT;
  current_epoch BIGINT;
BEGIN
  SELECT c."companyId", c."type", c."directUserLowKey", c."directUserHighKey",
         c."nextSequence", co."chatMembershipEpoch"
    INTO conversation_company, conversation_type, low_key, high_key,
         allocated_sequence, current_epoch
    FROM "ChatConversation" c
    JOIN "Company" co ON co."id" = c."companyId"
    WHERE c."id" = NEW."conversationId"
    FOR SHARE OF co;
  IF NOT FOUND THEN RAISE EXCEPTION 'chat conversation does not exist'; END IF;
  IF NEW."sequence" <> allocated_sequence THEN
    RAISE EXCEPTION 'message sequence must equal the allocated conversation sequence';
  END IF;
  IF NEW."senderId" IS NOT NULL AND NEW."senderId" <> NEW."senderKey" THEN
    RAISE EXCEPTION 'message sender relation must match stable sender key';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "User" u
    WHERE u."id" = NEW."senderKey" AND u."companyId" = conversation_company
      AND u."isActive" = TRUE AND u."deletedAt" IS NULL
  ) THEN RAISE EXCEPTION 'message sender is not eligible in this company'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "Company" co
    WHERE co."id" = conversation_company AND co."isActive" = TRUE AND co."deletedAt" IS NULL
  ) THEN RAISE EXCEPTION 'company is not eligible for chat'; END IF;

  IF conversation_type = 'TEAM' THEN
    IF NEW."audienceEpoch" IS NULL OR NEW."audienceEpoch" <> current_epoch THEN
      RAISE EXCEPTION 'team audience epoch is stale or missing' USING ERRCODE = '40001';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM "TeamMembershipInterval" i
      WHERE i."companyId" = conversation_company AND i."userKey" = NEW."senderKey"
        AND i."fromEpoch" <= NEW."audienceEpoch"
        AND (i."toEpoch" IS NULL OR NEW."audienceEpoch" < i."toEpoch")
    ) THEN RAISE EXCEPTION 'team sender is outside the frozen audience'; END IF;
  ELSE
    IF NEW."audienceEpoch" IS NOT NULL
       OR NEW."senderKey" NOT IN (low_key, high_key) THEN
      RAISE EXCEPTION 'direct message has invalid audience or sender';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."id" = CASE WHEN NEW."senderKey" = low_key THEN high_key ELSE low_key END
        AND u."companyId" = conversation_company
        AND u."isActive" = TRUE AND u."deletedAt" IS NULL
    ) THEN RAISE EXCEPTION 'direct recipient is not eligible in this company'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ChatMessage_validate_insert"
BEFORE INSERT ON "ChatMessage" FOR EACH ROW
EXECUTE FUNCTION "validate_chat_message_insert"();

-- A persisted message is immutable. The only accepted change is the FK-driven
-- SET NULL of the live sender reference (the immutable senderKey and the
-- name/avatar snapshots keep history readable after a hard user delete).
CREATE FUNCTION "protect_chat_message"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" <> OLD."id" OR NEW."conversationId" <> OLD."conversationId"
     OR NEW."sequence" <> OLD."sequence" OR NEW."senderKey" <> OLD."senderKey"
     OR NEW."senderName" <> OLD."senderName"
     OR NEW."senderAvatar" IS DISTINCT FROM OLD."senderAvatar"
     OR NEW."clientMessageId" <> OLD."clientMessageId"
     OR NEW."body" <> OLD."body"
     OR NEW."audienceEpoch" IS DISTINCT FROM OLD."audienceEpoch"
     OR NEW."createdAt" <> OLD."createdAt"
     OR (NEW."senderId" IS NOT NULL AND NEW."senderId" IS DISTINCT FROM OLD."senderId") THEN
    RAISE EXCEPTION 'persisted chat messages are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ChatMessage_protect"
BEFORE UPDATE ON "ChatMessage" FOR EACH ROW
EXECUTE FUNCTION "protect_chat_message"();

-- A direct receipt belongs only to the non-sender in a direct conversation.
-- Service code must additionally authenticate the caller and enforce current
-- company eligibility for every acknowledgement.
CREATE FUNCTION "validate_direct_message_read"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  message_sender TEXT;
  conversation_type "ChatConversationType";
  conversation_company TEXT;
  low_key TEXT;
  high_key TEXT;
  expected_reader TEXT;
BEGIN
  SELECT m."senderKey", c."type", c."companyId",
         c."directUserLowKey", c."directUserHighKey"
    INTO message_sender, conversation_type, conversation_company,
         low_key, high_key
    FROM "ChatMessage" m JOIN "ChatConversation" c ON c."id" = m."conversationId"
    WHERE m."id" = NEW."messageId";
  IF NOT FOUND OR conversation_type <> 'DIRECT' THEN
    RAISE EXCEPTION 'read receipt must reference a direct message';
  END IF;
  IF message_sender = low_key THEN expected_reader := high_key;
  ELSIF message_sender = high_key THEN expected_reader := low_key;
  ELSE RAISE EXCEPTION 'direct message sender is outside its pair';
  END IF;
  IF NEW."readerKey" <> expected_reader
     OR (NEW."readerUserId" IS NOT NULL AND NEW."readerUserId" <> NEW."readerKey") THEN
    RAISE EXCEPTION 'only the other direct participant may be recorded as reader';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "User" u
    WHERE u."id" = NEW."readerKey" AND u."companyId" = conversation_company
      AND u."isActive" = TRUE AND u."deletedAt" IS NULL
  ) THEN RAISE EXCEPTION 'direct reader is not eligible in this company'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "DirectMessageRead_validate_insert"
BEFORE INSERT ON "DirectMessageRead" FOR EACH ROW
EXECUTE FUNCTION "validate_direct_message_read"();

-- Receipts are immutable (validated on INSERT only, so UPDATE must not be able
-- to re-point or re-assign one). The FK-driven SET NULL of readerUserId is the
-- only accepted change.
CREATE FUNCTION "protect_direct_message_read"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."messageId" <> OLD."messageId" OR NEW."readerKey" <> OLD."readerKey"
     OR NEW."readAt" <> OLD."readAt"
     OR (NEW."readerUserId" IS NOT NULL
         AND NEW."readerUserId" IS DISTINCT FROM OLD."readerUserId") THEN
    RAISE EXCEPTION 'direct read receipts are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "DirectMessageRead_protect"
BEFORE UPDATE ON "DirectMessageRead" FOR EACH ROW
EXECUTE FUNCTION "protect_direct_message_read"();

-- Direct participant cursors are monotonic summaries of DirectMessageRead.
-- A cursor may pass an incoming sequence only after each such message has
-- its durable read acknowledgement; messages authored by the reader do not
-- require a receipt from that same reader.
CREATE FUNCTION "validate_direct_read_cursor"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  conversation_type "ChatConversationType";
  max_sequence BIGINT;
BEGIN
  IF NEW."readSequence" < OLD."readSequence" THEN
    RAISE EXCEPTION 'direct read cursor cannot move backwards';
  END IF;
  SELECT c."type", c."nextSequence"
    INTO conversation_type, max_sequence
    FROM "ChatConversation" c WHERE c."id" = NEW."conversationId";
  IF conversation_type <> 'DIRECT' THEN
    RAISE EXCEPTION 'direct read cursor requires a direct conversation';
  END IF;
  IF NEW."readSequence" > max_sequence THEN
    RAISE EXCEPTION 'direct read cursor cannot exceed the conversation sequence';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "ChatMessage" m
    LEFT JOIN "DirectMessageRead" r
      ON r."messageId" = m."id" AND r."readerKey" = NEW."participantKey"
    WHERE m."conversationId" = NEW."conversationId"
      AND m."sequence" > OLD."readSequence"
      AND m."sequence" <= NEW."readSequence"
      AND m."senderKey" <> NEW."participantKey"
      AND r."messageId" IS NULL
  ) THEN RAISE EXCEPTION 'direct cursor cannot pass an unread incoming message'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ChatParticipant_validate_read_cursor"
BEFORE UPDATE OF "readSequence" ON "ChatParticipant"
FOR EACH ROW EXECUTE FUNCTION "validate_direct_read_cursor"();

-- Team cursor monotonicity and live eligibility are also checked in SQL as
-- a data-integrity backstop. The service must still authenticate the actor
-- and confirm the client visibility acknowledgement for every event.
CREATE FUNCTION "validate_team_read_cursor"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  current_epoch BIGINT;
  max_sequence BIGINT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."lastReadSequence" < OLD."lastReadSequence" THEN
    RAISE EXCEPTION 'team read cursor cannot move backwards';
  END IF;
  SELECT co."chatMembershipEpoch", c."nextSequence"
    INTO current_epoch, max_sequence
    FROM "Company" co
    JOIN "ChatConversation" c
      ON c."companyId" = co."id" AND c."type" = 'TEAM'
    WHERE co."id" = NEW."companyId"
    FOR SHARE OF co;
  IF NOT FOUND OR NEW."lastReadSequence" > max_sequence THEN
    RAISE EXCEPTION 'team read cursor has no team conversation or exceeds its sequence';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "User" u
    WHERE u."id" = NEW."userKey" AND u."companyId" = NEW."companyId"
      AND u."isActive" = TRUE AND u."deletedAt" IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM "TeamMembershipInterval" i
    WHERE i."companyId" = NEW."companyId" AND i."userKey" = NEW."userKey"
      AND i."fromEpoch" <= current_epoch
      AND (i."toEpoch" IS NULL OR current_epoch < i."toEpoch")
  ) THEN RAISE EXCEPTION 'team reader is not currently eligible'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ChatTeamReadCursor_validate"
BEFORE INSERT OR UPDATE ON "ChatTeamReadCursor"
FOR EACH ROW EXECUTE FUNCTION "validate_team_read_cursor"();

COMMIT;