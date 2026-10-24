import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { ValidationError } from 'class-validator';

import { AuditService } from '../audit/audit.service';
import type { AuditActor } from '../audit/audit.types';
import { CONTACT_REPOSITORY } from './constants/contact.constants';
import type { IContactRepository } from './repository/contact.repository.interface';
import { ContactService } from './contact.service';
import { CreateContactDto } from './dto/create-contact.dto';
import type {
  ContactImportResult,
  ContactImportRowIssue,
  ContactImportRowResult,
  ContactImportValidateResult,
  ContactImportValidateRow,
} from './contact-import.types';

/** القيمة اللي بتتكتب في Contact.source لو الملف مفيهوش عمود مصدر. */
export const CONTACT_IMPORT_DEFAULT_SOURCE = 'Import';

/**
 * Never accepted from an import file. assignedToId is excluded by product
 * decision (an import must not assign contacts to users); companyId /
 * createdById are not DTO fields at all and are rejected by the whitelist.
 */
const FORBIDDEN_FIELDS = new Set(['assignedToId']);

/** Keys that must never be copied from client-controlled objects. */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

interface PreparedRow {
  dto: CreateContactDto | null;
  issues: ContactImportRowIssue[];
}

/**
 * Validates and imports contacts row by row.
 *
 * Security/consistency rules (see the approved plan):
 * - companyId and the acting user ALWAYS come from the caller (the JWT, via
 *   the controller); nothing in a row can change them.
 * - Rows are created exclusively through ContactService.create, so the
 *   email-uniqueness pre-check, normalization and every other side effect of
 *   the normal "create contact" path stay in force. The partial unique index
 *   on (companyId, email) still catches concurrent duplicates, which
 *   ContactService surfaces as a ConflictException.
 * - No transaction spans the whole request on purpose: each row succeeds or
 *   fails on its own, so a partial result is possible and is reported per row.
 * - The read-only repository dependency is used only for the duplicate check
 *   of the dry-run; it never writes.
 */
@Injectable()
export class ContactImportService {
  private readonly logger = new Logger(ContactImportService.name);

  constructor(
    private readonly contactService: ContactService,

    private readonly auditService: AuditService,

    @Inject(CONTACT_REPOSITORY)
    private readonly contactRepository: IContactRepository,
  ) {}

  /** Dry-run: reports the status of every row and never writes anything. */
  async validate(
    companyId: string,
    rows: Record<string, unknown>[],
  ): Promise<ContactImportValidateResult> {
    const result: ContactImportValidateRow[] = [];
    const seenInBatch = new Set<string>();

    for (const [index, raw] of rows.entries()) {
      const { dto, issues } = await this.prepareRow(raw);

      if (!dto || issues.length > 0) {
        result.push({
          index,
          status: 'invalid',
          errors: issues,
          warnings: [],
        });
        continue;
      }

      const warnings = dto.email ? [] : ['noEmail'];

      if (!dto.email) {
        result.push({ index, status: 'valid', errors: [], warnings });
        continue;
      }

      if (seenInBatch.has(dto.email)) {
        result.push({
          index,
          status: 'duplicate',
          errors: [],
          warnings,
          duplicateReason: 'duplicateInBatch',
        });
        continue;
      }

      seenInBatch.add(dto.email);

      const exists = await this.contactRepository.existsByEmail(
        companyId,
        dto.email,
      );

      result.push(
        exists
          ? {
              index,
              status: 'duplicate',
              errors: [],
              warnings,
              duplicateReason: 'existsInCompany',
            }
          : { index, status: 'valid', errors: [], warnings },
      );
    }

    return {
      rows: result,
      summary: {
        valid: result.filter((r) => r.status === 'valid').length,
        duplicate: result.filter((r) => r.status === 'duplicate').length,
        invalid: result.filter((r) => r.status === 'invalid').length,
      },
    };
  }

  /** Creates every acceptable row; reports a per-row outcome. */
  async import(
    companyId: string,
    createdById: string,
    rows: Record<string, unknown>[],
    audit: AuditActor,
  ): Promise<ContactImportResult> {
    const result: ContactImportRowResult[] = [];

    // One id groups every audit row of this request (per-row `contact.create`
    // events and the final `contact.import` summary).
    const correlationId = randomUUID();
    const rowAudit: AuditActor = {
      ...audit,
      correlationId,
      metadata: { ...(audit.metadata ?? {}), source: 'import' },
    };

    for (const [index, raw] of rows.entries()) {
      const { dto, issues } = await this.prepareRow(raw);

      if (!dto || issues.length > 0) {
        result.push({
          index,
          outcome: 'invalid',
          errors: issues,
          warnings: [],
        });
        continue;
      }

      const warnings = dto.email ? [] : ['noEmail'];

      try {
        const created = await this.contactService.create(
          companyId,
          createdById,
          dto,
          rowAudit,
        );

        result.push({
          index,
          outcome: 'created',
          errors: [],
          warnings,
          contactId: created.id,
        });
      } catch (error) {
        if (error instanceof ConflictException) {
          result.push({ index, outcome: 'duplicate', errors: [], warnings });
          continue;
        }

        // Deliberately generic: the real error may mention other data, and
        // the row content must never be echoed back or logged.
        const isClientError =
          error instanceof HttpException && error.getStatus() < 500;

        result.push({
          index,
          outcome: 'failed',
          errors: [
            {
              field: 'row',
              code: isClientError ? 'saveFailed' : 'unexpected',
              message: 'The row could not be saved.',
            },
          ],
          warnings,
        });
      }
    }

    const summary = {
      created: result.filter((r) => r.outcome === 'created').length,
      duplicate: result.filter((r) => r.outcome === 'duplicate').length,
      invalid: result.filter((r) => r.outcome === 'invalid').length,
      failed: result.filter((r) => r.outcome === 'failed').length,
    };

    // Counts only: no names, emails or any other row data in the logs.
    this.logger.log(
      `contacts import: company=${companyId} rows=${rows.length} created=${summary.created} duplicate=${summary.duplicate} invalid=${summary.invalid} failed=${summary.failed}`,
    );

    await this.recordSummary(companyId, rowAudit, rows.length, summary);

    return { rows: result, summary };
  }

  /**
   * Standalone `contact.import` summary event (counts only). The individual
   * rows are already audited atomically by ContactService.create, so a failure
   * to write this derived summary is logged but does NOT fail the request
   * (the rows are already committed and cannot be undone).
   */
  private async recordSummary(
    companyId: string,
    audit: AuditActor,
    totalRows: number,
    summary: Record<'created' | 'duplicate' | 'invalid' | 'failed', number>,
  ): Promise<void> {
    try {
      await this.auditService.record({
        companyId,
        actorUserId: audit.actorUserId,
        action: 'import',
        entityType: 'contact',
        entityId: null,
        entityLabel: null,
        changes: null,
        metadata: { ...(audit.metadata ?? {}), totalRows, ...summary },
        correlationId: audit.correlationId ?? null,
        ipAddress: audit.ipAddress ?? null,
        userAgent: audit.userAgent ?? null,
      });
    } catch {
      // AuditWriter already logged the failure and reported it to Sentry.
      this.logger.error('contacts import: summary audit entry was not written');
    }
  }

  /**
   * Turns one raw JSON object into a validated CreateContactDto using the
   * real DTO rules (same trimming/lower-casing and the same constraints as
   * POST /contacts). Never throws for bad row content.
   */
  private async prepareRow(raw: Record<string, unknown>): Promise<PreparedRow> {
    const issues: ContactImportRowIssue[] = [];
    const clean: Record<string, string> = {};

    for (const [key, value] of Object.entries(raw)) {
      if (UNSAFE_KEYS.has(key)) {
        issues.push(this.notAllowed(key, 'whitelistValidation'));
        continue;
      }

      if (FORBIDDEN_FIELDS.has(key)) {
        issues.push(this.notAllowed(key, 'fieldNotAllowed'));
        continue;
      }

      // Empty cells are "not provided", exactly like the contact form which
      // strips blank optional fields before calling POST /contacts.
      if (value === null || value === undefined) {
        continue;
      }

      if (typeof value !== 'string') {
        issues.push({
          field: key,
          code: 'isString',
          message: `${key} must be a string`,
        });
        continue;
      }

      if (value.trim().length === 0) {
        continue;
      }

      clean[key] = value;
    }

    if (!clean.source) {
      clean.source = CONTACT_IMPORT_DEFAULT_SOURCE;
    }

    const dto = plainToInstance(CreateContactDto, clean);

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
      validationError: { target: false, value: false },
    });

    issues.push(...this.flatten(errors));

    return { dto, issues };
  }

  private notAllowed(field: string, code: string): ContactImportRowIssue {
    return {
      field,
      code,
      message: `property ${field} should not exist`,
    };
  }

  private flatten(errors: ValidationError[]): ContactImportRowIssue[] {
    const issues: ContactImportRowIssue[] = [];

    for (const error of errors) {
      for (const [code, message] of Object.entries(error.constraints ?? {})) {
        issues.push({ field: error.property, code, message });
      }

      if (error.children?.length) {
        issues.push(...this.flatten(error.children));
      }
    }

    return issues;
  }
}
