import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';

import { writeAuditEntry } from './audit.writer';
import type { AuditEntryInput } from './audit.types';

/**
 * Standalone (single-row) audit write.
 *
 * Domain changes are NOT recorded through this service: they use the writer
 * functions on the SAME transaction as the change (see audit.writer.ts). This
 * service exists only for derived summary events that are not part of one
 * data change (e.g. the "import finished" summary), whose rows are already
 * individually audited. It still throws on failure; the caller decides what a
 * failed summary means.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntryInput): Promise<void> {
    await writeAuditEntry(this.prisma, entry);
  }
}
