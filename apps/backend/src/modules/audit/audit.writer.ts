import { InternalServerErrorException, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';

import {
  buildCreateChanges,
  buildEntityLabel,
  buildUpdateChanges,
  capJson,
} from './audit-change.builder';
import { AUDIT_WRITE_FAILED_MESSAGE } from './audit.constants';
import {
  AUDIT_LIMITS,
  type AuditActor,
  type AuditAction,
  type AuditChanges,
  type AuditEntityType,
  type AuditEntryInput,
} from './audit.types';

/**
 * The prisma client a write runs on. Passing the `tx` of an interactive
 * transaction makes the audit row part of that transaction.
 */
export type AuditTx = Prisma.TransactionClient;

/** Thrown when the audit row could not be written. HTTP 500, generic body. */
export class AuditWriteFailedException extends InternalServerErrorException {
  constructor() {
    super(AUDIT_WRITE_FAILED_MESSAGE);
  }
}

const logger = new Logger('AuditWriter');

const clip = (value: string | null | undefined, max: number): string | null => {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  return value.length > max ? value.slice(0, max) : value;
};

const toJson = (value: object | null): Prisma.InputJsonValue | undefined =>
  value === null ? undefined : value;

/**
 * Writes ONE audit row on `tx`.
 *
 * - Must be called inside the same interactive transaction as the change it
 *   records, so the change and its audit row commit or roll back together.
 * - On ANY failure it throws AuditWriteFailedException; the surrounding
 *   transaction therefore rolls back and the business change does not happen.
 *   It never swallows an error.
 * - Failure reporting carries only the error name — never entry content.
 */
export async function writeAuditEntry(
  tx: AuditTx,
  entry: AuditEntryInput,
): Promise<void> {
  try {
    if (!entry.companyId) {
      throw new Error('audit entry without companyId');
    }

    await tx.auditLog.create({
      data: {
        companyId: entry.companyId,
        actorUserId: entry.actorUserId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        entityLabel: clip(entry.entityLabel, AUDIT_LIMITS.label),
        changes: toJson(capJson(entry.changes, AUDIT_LIMITS.changesBytes)),
        metadata: toJson(capJson(entry.metadata, AUDIT_LIMITS.metadataBytes)),
        correlationId: entry.correlationId,
        ipAddress: clip(entry.ipAddress, AUDIT_LIMITS.ipAddress),
        userAgent: clip(entry.userAgent, AUDIT_LIMITS.userAgent),
      },
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : 'UnknownError';

    logger.error(
      `Failed to write audit entry action=${entry.action} entity=${entry.entityType} (${name})`,
    );

    try {
      Sentry.captureException(error, {
        tags: {
          area: 'audit',
          stage: 'write',
          action: entry.action,
          entityType: entry.entityType,
        },
      });
    } catch {
      // Reporting must never throw either.
    }

    throw new AuditWriteFailedException();
  }
}

interface AuditRecord {
  id: string;
}

interface EntryExtras {
  action?: AuditAction;
  /** Extra change entries (e.g. a role's permissions diff). */
  extraChanges?: AuditChanges;
  /** Extra non-sensitive metadata, merged over the actor's own metadata. */
  metadata?: Record<string, unknown>;
}

function baseEntry(
  entityType: AuditEntityType,
  companyId: string,
  actor: AuditActor,
  action: AuditAction,
  record: AuditRecord,
  changes: AuditChanges | null,
  extras: EntryExtras | undefined,
): AuditEntryInput {
  const metadata = { ...(actor.metadata ?? {}), ...(extras?.metadata ?? {}) };

  return {
    companyId,
    actorUserId: actor.actorUserId,
    action,
    entityType,
    entityId: record.id,
    entityLabel: buildEntityLabel(entityType, record),
    changes,
    metadata: Object.keys(metadata).length > 0 ? metadata : null,
    correlationId: actor.correlationId ?? null,
    ipAddress: actor.ipAddress ?? null,
    userAgent: actor.userAgent ?? null,
  };
}

/** Records the creation of `after` (operational initial values only). */
export async function auditCreate<T extends AuditRecord>(
  tx: AuditTx,
  entityType: AuditEntityType,
  companyId: string,
  actor: AuditActor,
  after: T,
  extras?: EntryExtras,
): Promise<void> {
  await writeAuditEntry(
    tx,
    baseEntry(
      entityType,
      companyId,
      actor,
      extras?.action ?? 'create',
      after,
      mergeChanges(buildCreateChanges(entityType, after), extras),
      extras,
    ),
  );
}

/**
 * Records the update from `before` to `after`.
 * Returns false (and writes nothing) when no allowlisted field changed.
 */
export async function auditUpdate<T extends AuditRecord>(
  tx: AuditTx,
  entityType: AuditEntityType,
  companyId: string,
  actor: AuditActor,
  before: object,
  after: T,
  extras?: EntryExtras,
): Promise<boolean> {
  const changes = mergeChanges(
    buildUpdateChanges(entityType, before, after),
    extras,
  );

  if (changes === null) {
    return false;
  }

  await writeAuditEntry(
    tx,
    baseEntry(
      entityType,
      companyId,
      actor,
      extras?.action ?? 'update',
      after,
      changes,
      extras,
    ),
  );

  return true;
}

/** Records the (soft) deletion of `before`. */
export async function auditDelete<T extends AuditRecord>(
  tx: AuditTx,
  entityType: AuditEntityType,
  companyId: string,
  actor: AuditActor,
  before: T,
  extras?: EntryExtras,
): Promise<void> {
  await writeAuditEntry(
    tx,
    baseEntry(
      entityType,
      companyId,
      actor,
      extras?.action ?? 'delete',
      before,
      null,
      extras,
    ),
  );
}

/**
 * Records a named event on `record` that has no field diff of its own
 * (e.g. `password_changed`). Any detail goes through `extras`; never values.
 */
export async function auditAction<T extends AuditRecord>(
  tx: AuditTx,
  entityType: AuditEntityType,
  companyId: string,
  actor: AuditActor,
  action: AuditAction,
  record: T,
  extras?: Omit<EntryExtras, 'action'>,
): Promise<void> {
  await writeAuditEntry(
    tx,
    baseEntry(
      entityType,
      companyId,
      actor,
      action,
      record,
      mergeChanges(null, extras),
      extras,
    ),
  );
}

function mergeChanges(
  changes: AuditChanges | null,
  extras: EntryExtras | undefined,
): AuditChanges | null {
  if (!extras?.extraChanges) {
    return changes;
  }

  const merged = { ...(changes ?? {}), ...extras.extraChanges };

  return Object.keys(merged).length > 0 ? merged : null;
}
