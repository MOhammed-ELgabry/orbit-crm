import {
  createParamDecorator,
  ForbiddenException,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

declare const verifiedScope: unique symbol;

/**
 * The ONLY identity the audit read API may use.
 *
 * It is produced exclusively by AuditOwnerGuard from the DATABASE (never from
 * JWT claims or request input) and attached to the request. Controllers and
 * AuditQueryService take this type instead of a raw companyId string, so a
 * value from a query/body/JWT cannot be passed by accident.
 */
export interface AuditScope {
  readonly userId: string;
  readonly companyId: string;
  readonly [verifiedScope]: true;
}

export const AUDIT_SCOPE_REQUEST_KEY = 'auditScope';

/** Called by AuditOwnerGuard only, after verifying the database row. */
export function createVerifiedAuditScope(
  userId: string,
  companyId: string,
): AuditScope {
  return { userId, companyId } as AuditScope;
}

/** Injects the verified scope; refuses if the guard did not run. */
export const VerifiedAuditScope = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuditScope => {
    const request = context
      .switchToHttp()
      .getRequest<Request & { [AUDIT_SCOPE_REQUEST_KEY]?: AuditScope }>();

    const scope = request[AUDIT_SCOPE_REQUEST_KEY];

    if (!scope) {
      throw new ForbiddenException(
        'Owner privileges are required for this operation.',
      );
    }

    return scope;
  },
);
