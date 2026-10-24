import type { Request } from 'express';

import type { IJwtPayload } from '../auth/interfaces/jwt-payload.interface';

import {
  AUDIT_LIMITS,
  type AuditActor,
  type AuditRequestMeta,
} from './audit.types';

/**
 * Best-effort request metadata. The IP depends on the reverse-proxy
 * configuration (see main.ts `trust proxy`) and is never used for any
 * security decision — it is only recorded for investigators.
 */
export function auditRequestMeta(request: Request): AuditRequestMeta {
  const userAgent = request.headers?.['user-agent'];

  return {
    ipAddress:
      typeof request.ip === 'string'
        ? request.ip.slice(0, AUDIT_LIMITS.ipAddress)
        : null,
    userAgent:
      typeof userAgent === 'string'
        ? userAgent.slice(0, AUDIT_LIMITS.userAgent)
        : null,
  };
}

/**
 * Builds the audit actor from the AUTHENTICATED request: the id is the verified
 * JWT subject (JwtAuthGuard has already checked it against the database).
 * Nothing from the request body or query is ever used.
 */
export function auditActorFromRequest(
  request: Request & { user: IJwtPayload },
  extras?: Pick<AuditActor, 'correlationId' | 'metadata'>,
): AuditActor {
  return {
    actorUserId: request.user.sub,
    ...auditRequestMeta(request),
    ...(extras ?? {}),
  };
}
