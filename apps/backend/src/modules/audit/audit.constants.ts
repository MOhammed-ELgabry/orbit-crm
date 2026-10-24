import type { AuditEntityType } from './audit.types';

/**
 * Allowlist / redaction policy, one entry per audited entity.
 *
 * - valueFields:  operational fields whose old AND new value are recorded.
 * - maskedFields: personal or free-text fields (names, email, phone, address,
 *                 notes, descriptions…). Only the fact that they changed is
 *                 recorded — `{ changed: true }` — never the values. An
 *                 immutable log must not become a second copy of personal data.
 *
 * Any field that is in neither list is IGNORED. This is an allowlist: adding a
 * column to a model never starts leaking it into the audit trail. Passwords,
 * hashes, tokens and verification codes are deliberately absent everywhere.
 */
export interface AuditEntityConfig {
  valueFields: readonly string[];
  maskedFields: readonly string[];
  /** Human label of the record at the time of the event. */
  label: (record: Record<string, unknown>) => string | null;
}

const text = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const fullName = (record: Record<string, unknown>): string | null => {
  const name = `${text(record.firstName)} ${text(record.lastName)}`.trim();
  return name.length > 0 ? name : null;
};

const titleOf = (record: Record<string, unknown>): string | null =>
  text(record.title) || null;

const nameOf = (record: Record<string, unknown>): string | null =>
  text(record.name) || null;

export const AUDIT_ENTITY_CONFIG: Record<AuditEntityType, AuditEntityConfig> = {
  contact: {
    valueFields: ['status', 'source', 'assignedToId'],
    maskedFields: [
      'firstName',
      'lastName',
      'email',
      'phone',
      'mobile',
      'jobTitle',
      'organizationName',
      'website',
      'address',
      'city',
      'state',
      'country',
      'postalCode',
      'notes',
    ],
    label: fullName,
  },

  lead: {
    valueFields: ['status', 'source', 'assignedToId'],
    maskedFields: [
      'firstName',
      'lastName',
      'email',
      'phone',
      'organizationName',
      'notes',
    ],
    label: fullName,
  },

  deal: {
    valueFields: [
      'stage',
      'amount',
      'expectedCloseDate',
      'contactId',
      'leadId',
      'assignedToId',
    ],
    maskedFields: ['title', 'notes'],
    label: titleOf,
  },

  task: {
    valueFields: [
      'status',
      'priority',
      'dueDate',
      'contactId',
      'leadId',
      'dealId',
      'assignedToId',
    ],
    maskedFields: ['title', 'description'],
    label: titleOf,
  },

  calendarEvent: {
    valueFields: [
      'status',
      'startAt',
      'endAt',
      'allDay',
      'contactId',
      'leadId',
      'dealId',
      'assignedToId',
    ],
    maskedFields: ['title', 'description', 'location'],
    label: titleOf,
  },

  activity: {
    valueFields: [
      'type',
      'occurredAt',
      'contactId',
      'dealId',
      'taskId',
      'calendarEventId',
    ],
    maskedFields: ['title', 'description'],
    label: titleOf,
  },

  user: {
    valueFields: ['isActive', 'roleId'],
    maskedFields: ['firstName', 'lastName', 'phone', 'avatar'],
    label: fullName,
  },

  role: {
    valueFields: ['name', 'description'],
    maskedFields: [],
    label: nameOf,
  },

  company: {
    valueFields: ['name', 'businessType'],
    maskedFields: [
      'contactEmail',
      'phone',
      'address',
      'logo',
      'website',
      'taxNumber',
      'description',
    ],
    label: nameOf,
  },
};

/** Fixed message of the error a failed audit write turns into (HTTP 500). */
export const AUDIT_WRITE_FAILED_MESSAGE = 'Audit record could not be written.';

/** Read API bounds (see AuditQueryService). */
export const AUDIT_QUERY_LIMITS = {
  defaultLimit: 20,
  maxLimit: 50,
  defaultRangeDays: 30,
  maxRangeDays: 90,
  maxActors: 100,
  maxActorSearchMatches: 50,
} as const;
