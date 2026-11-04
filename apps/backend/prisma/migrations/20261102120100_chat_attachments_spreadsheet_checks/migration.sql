-- =====================================================================
-- Chat attachments - Excel spreadsheets (.xlsx / .xls), step 2 of 2
--
-- REVIEW DRAFT: written for manual review, NOT executed anywhere by the
-- author (no database was contacted). Requires step 1
-- (20261102120000_chat_attachments_spreadsheet_kind) to be applied first.
--
-- Replaces the two CHECK constraints of "ChatAttachment" that enumerate the
-- allowed kinds:
--   * ChatAttachment_kind_contentType_check - kind and the (content-sniffed)
--     MIME type must agree; SPREADSHEET allows exactly the .xlsx and .xls
--     MIME types. Macro-enabled workbooks (.xlsm) are NOT allowed.
--   * ChatAttachment_sizeBytes_check - hard ceiling per kind; SPREADSHEET
--     is capped at 10 MiB (10485760). The application can lower the limit
--     (CHAT_ATTACHMENTS_SPREADSHEET_MAX_BYTES) but never raise it above this.
--
-- Everything that was valid before is still valid (IMAGE / PDF rules are
-- copied verbatim), so existing rows pass the new constraints. The new
-- constraints are added NOT VALID and then VALIDATEd: the table is locked
-- exclusively only for the instant of the swap, and the validation scan
-- runs with a weaker lock. DROP + ADD happen in one transaction, so there
-- is no moment without these constraints.
--
-- Dimensions: "ChatAttachment_dimensions_check" already allows NULL width /
-- height for any kind, which is what a spreadsheet has - unchanged.
--
-- Rollback (review before use; only valid while no SPREADSHEET row exists,
-- otherwise those rows would violate the old constraints):
--   ALTER TABLE "ChatAttachment" DROP CONSTRAINT "ChatAttachment_kind_contentType_check";
--   ALTER TABLE "ChatAttachment" DROP CONSTRAINT "ChatAttachment_sizeBytes_check";
--   ... then re-add the two constraints exactly as written in
--   20261030120000_add_chat_attachments/migration.sql.
-- =====================================================================

ALTER TABLE "ChatAttachment" DROP CONSTRAINT "ChatAttachment_kind_contentType_check";
ALTER TABLE "ChatAttachment" DROP CONSTRAINT "ChatAttachment_sizeBytes_check";

ALTER TABLE "ChatAttachment"
  ADD CONSTRAINT "ChatAttachment_kind_contentType_check" CHECK (
    ("kind" = 'IMAGE' AND "contentType" IN ('image/png', 'image/jpeg', 'image/webp'))
    OR
    ("kind" = 'PDF' AND "contentType" = 'application/pdf')
    OR
    ("kind" = 'SPREADSHEET' AND "contentType" IN (
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ))
  ) NOT VALID;

ALTER TABLE "ChatAttachment"
  ADD CONSTRAINT "ChatAttachment_sizeBytes_check" CHECK (
    "sizeBytes" > 0
    AND (
      ("kind" = 'IMAGE' AND "sizeBytes" <= 5242880)
      OR
      ("kind" = 'PDF' AND "sizeBytes" <= 10485760)
      OR
      ("kind" = 'SPREADSHEET' AND "sizeBytes" <= 10485760)
    )
  ) NOT VALID;

ALTER TABLE "ChatAttachment" VALIDATE CONSTRAINT "ChatAttachment_kind_contentType_check";
ALTER TABLE "ChatAttachment" VALIDATE CONSTRAINT "ChatAttachment_sizeBytes_check";
