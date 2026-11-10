import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';

import { REGIONAL_HANDOFF_TTL_MS } from './regional.constants';
import type { RegionalHints } from './regional-hints';
import { parseStoredHints } from './regional-hints';
import { RegionalReferenceService } from './regional-reference.service';

/** Opaque, URL-safe, 256-bit random token (base64url of 32 bytes = 43 chars). */
export const HANDOFF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const hash = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/**
 * Carries the (already validated) regional hints across the social-login
 * OAuth redirect WITHOUT putting any hint data into a URL:
 *   1. the SPA POSTs the raw hints, the server validates them and stores the
 *      sanitised document, returning only an opaque random token;
 *   2. the token is turned into a first-party HttpOnly cookie when the popup
 *      reaches /auth/social/:provider/start;
 *   3. the callback consumes it ATOMICALLY inside the user/company creation
 *      transaction, so a rolled-back transaction leaves the token unspent.
 * The token only identifies a server-side row; the client cannot read or
 * alter what it points at, and only a token minted by this server resolves.
 */
@Injectable()
export class RegionalHandoffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reference: RegionalReferenceService,
  ) {}

  async create(hints: RegionalHints, now: Date = new Date()): Promise<string> {
    // Opportunistic cleanup keeps the table tiny without a scheduler.
    await this.prisma.regionalHintHandoff.deleteMany({
      where: { expiresAt: { lt: new Date(now.getTime() - 60_000) } },
    });

    const token = randomBytes(32).toString('base64url');

    await this.prisma.regionalHintHandoff.create({
      data: {
        tokenHash: hash(token),
        hints: hints as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(now.getTime() + REGIONAL_HANDOFF_TTL_MS),
      },
    });

    return token;
  }

  /**
   * Claims the token inside the caller's transaction. Returns the validated
   * hints, or null when the token is unknown / expired / already used (the
   * caller then proceeds exactly like a registration without hints).
   */
  async consume(
    tx: Prisma.TransactionClient,
    token: string | undefined,
    now: Date = new Date(),
  ): Promise<RegionalHints | null> {
    if (!token || !HANDOFF_TOKEN_PATTERN.test(token)) return null;

    const tokenHash = hash(token);

    const row = await tx.regionalHintHandoff.findUnique({
      where: { tokenHash },
    });
    if (!row || row.consumedAt || row.expiresAt <= now) return null;

    const claim = await tx.regionalHintHandoff.updateMany({
      where: { id: row.id, consumedAt: null },
      data: { consumedAt: now },
    });
    if (claim.count !== 1) return null;

    return parseStoredHints(row.hints, async (code) => {
      return (await this.reference.getCountry(code)) !== null;
    });
  }
}
