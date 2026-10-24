-- Audit log: append-only trail of important business / administrative changes.
--
-- ADDITIVE ONLY: one new table, its indexes, one foreign key, one trigger
-- function and three triggers. No existing table or row is touched, there is
-- no backfill, and nothing in the application depends on it until the new code
-- is deployed. Safe to apply before the new application version.
--
-- Rollback (manual, only if ever needed; destroys the audit trail):
--   DROP TABLE "AuditLog";
--   DROP FUNCTION "audit_log_block_mutation"();

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "entityLabel" TEXT,
    "changes" JSONB,
    "metadata" JSONB,
    "correlationId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_companyId_occurredAt_id_idx" ON "AuditLog"("companyId", "occurredAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_companyId_entityType_entityId_occurredAt_idx" ON "AuditLog"("companyId", "entityType", "entityId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_companyId_actorUserId_occurredAt_idx" ON "AuditLog"("companyId", "actorUserId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_companyId_correlationId_idx" ON "AuditLog"("companyId", "correlationId");

-- AddForeignKey
-- RESTRICT (not CASCADE): a company with audit rows can never be hard-deleted
-- by accident. The application only ever soft-deletes companies.
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only protection.
--
-- The function ALWAYS raises: there is deliberately NO bypass (no session
-- variable, no setting). Test clean-up and any legitimate administrative purge
-- must disable the triggers explicitly as the table owner
-- (ALTER TABLE "AuditLog" DISABLE TRIGGER USER), outside the application.
--
-- HONEST LIMIT: this blocks the application and ordinary SQL run by a role
-- that is neither the table owner nor a superuser. The table owner and
-- superusers can disable triggers (or set session_replication_role), so this
-- is NOT protection against a database administrator. Run the application
-- with a role that only has SELECT and INSERT on "AuditLog" (see
-- DEPLOYMENT_GUIDE.md) for a stronger guarantee.
CREATE FUNCTION "audit_log_block_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only: % is not allowed', TG_OP;
END;
$$;

CREATE TRIGGER "AuditLog_block_update"
BEFORE UPDATE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION "audit_log_block_mutation"();

CREATE TRIGGER "AuditLog_block_delete"
BEFORE DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION "audit_log_block_mutation"();

-- Row-level triggers do not fire on TRUNCATE, so it needs its own guard.
CREATE TRIGGER "AuditLog_block_truncate"
BEFORE TRUNCATE ON "AuditLog"
FOR EACH STATEMENT EXECUTE FUNCTION "audit_log_block_mutation"();
