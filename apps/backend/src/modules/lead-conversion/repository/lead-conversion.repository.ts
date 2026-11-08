import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaExceptionMapper } from '../../../common/exceptions/prisma-exception.mapper';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

import { auditCreate, auditUpdate } from '../../audit/audit.writer';
import type { AuditActor } from '../../audit/audit.types';
import { LEAD_CONVERTED_STATUS } from '../../lead/constants/lead.constants';

import {
  LEAD_CONVERSION_CANDIDATE_LIMIT,
  LEAD_CONVERSION_MAX_RELATED,
  LEAD_CONVERSION_TX_OPTIONS,
} from '../constants/lead-conversion.constants';
import {
  buildProposedContact,
  duplicateFlags,
  ineligibleReason,
  leadDisplayName,
  mergeCandidates,
  type CandidateRow,
} from '../lead-conversion.policy';
import type {
  ConvertLeadInput,
  LeadConversionPreview,
  LeadConversionResult,
} from '../lead-conversion.types';

import type { ILeadConversionRepository } from './lead-conversion.repository.interface';

type Client = Prisma.TransactionClient;

const CANDIDATE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  mobile: true,
  organizationName: true,
  status: true,
} as const;

const TOO_MANY_RELATED_MESSAGE =
  'This lead has too many related deals, tasks or calendar events to convert in one step. Clean them up and try again.';

/**
 * The first of `ids` that is an active user of THIS company (the Lead's
 * assignee, else the Deal's). A deactivated or foreign user is skipped, so
 * the new Contact never points at someone who cannot own it.
 */
async function findAssigneeId(
  client: Client,
  companyId: string,
  ids: ReadonlyArray<string | null>,
): Promise<string | null> {
  for (const id of ids) {
    if (!id) {
      continue;
    }

    const user = await client.user.findFirst({
      where: { id, companyId, isActive: true },
      select: { id: true },
    });

    if (user) {
      return user.id;
    }
  }

  return null;
}

/**
 * Duplicate candidates, always scoped to the caller's company and to
 * non-deleted Contacts (a soft-deleted Contact does not count, exactly like
 * the Contact unique-email index).
 */
async function findCandidateRows(
  client: Client,
  companyId: string,
  lead: { email: string | null; phone: string | null },
  dealContactId: string | null,
): Promise<{
  dealContact: CandidateRow | null;
  emailMatches: CandidateRow[];
  phoneMatches: CandidateRow[];
}> {
  const dealContact = dealContactId
    ? await client.contact.findFirst({
        where: { id: dealContactId, companyId, deletedAt: null },
        select: CANDIDATE_SELECT,
      })
    : null;

  // Case-insensitive on purpose: new emails are stored lowercase, but a
  // legacy row with capitals must still be recognised as the same person.
  const emailMatches = lead.email
    ? await client.contact.findMany({
        where: {
          companyId,
          deletedAt: null,
          email: { equals: lead.email, mode: 'insensitive' },
        },
        select: CANDIDATE_SELECT,
        orderBy: { createdAt: 'asc' },
        take: LEAD_CONVERSION_CANDIDATE_LIMIT,
      })
    : [];

  // Exact match (after trim) — Orbit has no phone normalisation anywhere, so
  // this deliberately does not pretend to be smarter than the rest of the app.
  const phoneMatches = lead.phone
    ? await client.contact.findMany({
        where: {
          companyId,
          deletedAt: null,
          OR: [{ phone: lead.phone }, { mobile: lead.phone }],
        },
        select: CANDIDATE_SELECT,
        orderBy: { createdAt: 'asc' },
        take: LEAD_CONVERSION_CANDIDATE_LIMIT,
      })
    : [];

  return { dealContact, emailMatches, phoneMatches };
}

@Injectable()
export class LeadConversionRepository implements ILeadConversionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async preview(
    companyId: string,
    dealId: string,
  ): Promise<LeadConversionPreview> {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, companyId, deletedAt: null },
    });

    if (!deal) {
      throw new NotFoundException(`Deal with ID "${dealId}" not found.`);
    }

    const lead = deal.leadId
      ? await this.prisma.lead.findFirst({
          where: { id: deal.leadId, companyId, deletedAt: null },
        })
      : null;

    const reason = ineligibleReason(deal, lead !== null);

    const alreadyConverted =
      reason === null && lead && lead.convertedAt
        ? { contactId: lead.convertedContactId, convertedAt: lead.convertedAt }
        : null;

    const base = {
      reason,
      alreadyConverted,
      deal: {
        id: deal.id,
        title: deal.title,
        stage: deal.stage,
        contactId: deal.contactId,
        leadId: deal.leadId,
      },
      lead: lead
        ? {
            id: lead.id,
            firstName: lead.firstName,
            lastName: lead.lastName,
            email: lead.email,
            phone: lead.phone,
            organizationName: lead.organizationName,
            source: lead.source,
            status: lead.status,
            notes: lead.notes,
          }
        : null,
    };

    if (reason !== null || !lead || alreadyConverted) {
      return {
        eligible: false,
        ...base,
        proposedContact: null,
        candidates: [],
        duplicate: { blocksCreate: false, requiresAcknowledgement: false },
      };
    }

    const candidates = mergeCandidates(
      await findCandidateRows(this.prisma, companyId, lead, deal.contactId),
    );

    const assigneeId = await findAssigneeId(this.prisma, companyId, [
      lead.assignedToId,
      deal.assignedToId,
    ]);

    return {
      eligible: true,
      ...base,
      proposedContact: buildProposedContact(lead, assigneeId),
      candidates,
      duplicate: duplicateFlags(candidates),
    };
  }

  async convert(
    companyId: string,
    dealId: string,
    actorId: string,
    input: ConvertLeadInput,
    audit: AuditActor,
  ): Promise<LeadConversionResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // One conversion at a time per company. It serialises "look for a
        // duplicate -> create the Contact" between two conversions, so they
        // cannot both decide "no duplicate" and both create. The lock is
        // transaction-scoped (released on commit/rollback, never leaks).
        // A plain POST /contacts does NOT take this lock; against that the
        // unique email index is the guard (P2002 -> 409, whole tx rolls back).
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`lead-conversion:${companyId}`})::bigint)`;

        const deal = await tx.deal.findFirst({
          where: { id: dealId, companyId, deletedAt: null },
        });

        if (!deal) {
          throw new NotFoundException(`Deal with ID "${dealId}" not found.`);
        }

        if (deal.stage !== 'closed_won') {
          throw new BadRequestException(
            'Only a deal in the closed_won stage can convert its lead.',
          );
        }

        if (!deal.leadId) {
          throw new BadRequestException('This deal is not linked to a lead.');
        }

        const lead = await tx.lead.findFirst({
          where: { id: deal.leadId, companyId, deletedAt: null },
        });

        if (!lead) {
          throw new NotFoundException('The lead of this deal was not found.');
        }

        // Idempotent replay: the Lead is already converted. Nothing new is
        // created; the only thing that may still be missing is this Deal's
        // own link (a second won Deal of the same Lead).
        if (lead.convertedAt) {
          return this.replayAlreadyConverted(tx, companyId, audit, deal, lead);
        }

        const candidates = mergeCandidates(
          await findCandidateRows(tx, companyId, lead, deal.contactId),
        );
        const flags = duplicateFlags(candidates);

        const dealContact =
          candidates.find((c) => c.matchedOn.includes('deal')) ?? null;

        let contactId: string;
        let outcome: 'created' | 'linked';

        if (input.resolution === 'link') {
          const chosen = await tx.contact.findFirst({
            where: { id: input.contactId, companyId, deletedAt: null },
            select: { id: true },
          });

          // A Contact of another company is indistinguishable from one that
          // does not exist.
          if (!chosen) {
            throw new NotFoundException('Contact not found.');
          }

          if (dealContact && dealContact.contactId !== chosen.id) {
            throw new ConflictException(
              'This deal is already linked to another contact. Link the lead to that contact instead.',
            );
          }

          contactId = chosen.id;
          outcome = 'linked';
        } else {
          if (dealContact) {
            throw new ConflictException(
              'This deal is already linked to a contact. Link the lead to that contact instead of creating a new one.',
            );
          }

          if (flags.blocksCreate) {
            throw new ConflictException(
              'A contact with the same email already exists. Link the lead to it instead of creating a duplicate.',
            );
          }

          if (flags.requiresAcknowledgement && !input.acknowledgeDuplicate) {
            throw new ConflictException(
              'A contact with the same phone number already exists. Link the lead to it, or confirm that you want to create a new contact anyway.',
            );
          }

          const assigneeId = await findAssigneeId(tx, companyId, [
            lead.assignedToId,
            deal.assignedToId,
          ]);

          const proposed = buildProposedContact(lead, assigneeId);

          const contact = await tx.contact.create({
            data: {
              companyId,
              createdById: actorId,
              firstName: proposed.firstName,
              lastName: proposed.lastName,
              email: proposed.email,
              phone: proposed.phone,
              organizationName: proposed.organizationName,
              source: proposed.source,
              notes: proposed.notes,
              status: proposed.status,
              assignedToId: proposed.assignedToId,
            },
          });

          await auditCreate(tx, 'contact', companyId, audit, contact, {
            metadata: {
              convertedFromLeadId: lead.id,
              convertedByDealId: deal.id,
            },
          });

          contactId = contact.id;
          outcome = 'created';
        }

        // The idempotency gate: only a Lead that is still unconverted (and
        // not deleted) can be claimed. Under the company lock this always
        // succeeds; if it ever does not, the transaction rolls back
        // everything done above, including a just-created Contact.
        const claimed = await tx.lead.updateMany({
          where: {
            id: lead.id,
            companyId,
            deletedAt: null,
            convertedAt: null,
          },
          data: {
            status: LEAD_CONVERTED_STATUS,
            convertedAt: new Date(),
            convertedContactId: contactId,
            convertedByDealId: deal.id,
          },
        });

        if (claimed.count !== 1) {
          throw new ConflictException(
            'This lead was converted by another request. Reload and try again.',
          );
        }

        const leadAfter = await tx.lead.findFirstOrThrow({
          where: { id: lead.id, companyId },
        });

        await auditUpdate(tx, 'lead', companyId, audit, lead, leadAfter, {
          action: 'status_change',
          metadata: {
            convertedContactId: contactId,
            convertedByDealId: deal.id,
            outcome,
          },
        });

        // The won Deal now belongs to the Contact. Its leadId is kept, so the
        // Deal still answers "which lead did this come from".
        if (deal.contactId !== contactId) {
          const dealAfter = await tx.deal.update({
            where: { id: deal.id, companyId, deletedAt: null },
            data: { contactId },
          });

          await auditUpdate(tx, 'deal', companyId, audit, deal, dealAfter);
        }

        const relinked = await this.relinkRelatedRecords(
          tx,
          companyId,
          audit,
          lead.id,
          deal.id,
          contactId,
        );

        const name = leadDisplayName(lead);

        await tx.activity.create({
          data: {
            companyId,
            createdById: actorId,
            type: 'SYSTEM',
            title: 'Lead converted to contact',
            description:
              outcome === 'created'
                ? `Lead "${name}" was converted into a new contact after deal "${deal.title}" was won.`
                : `Lead "${name}" was linked to this existing contact after deal "${deal.title}" was won.`,
            contactId,
            dealId: deal.id,
          },
        });

        // Linking to an existing Contact must not overwrite its notes, and the
        // Lead's notes must not be lost: they become a note on its timeline.
        // (When a Contact is created the notes are copied into it instead, so
        // they are never recorded twice.)
        if (outcome === 'linked' && lead.notes) {
          await tx.activity.create({
            data: {
              companyId,
              createdById: actorId,
              type: 'NOTE',
              title: 'Notes from converted lead',
              description: lead.notes,
              contactId,
            },
          });
        }

        return {
          outcome,
          contactId,
          leadId: lead.id,
          dealId: deal.id,
          relinked,
        };
      }, LEAD_CONVERSION_TX_OPTIONS);
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }

  /**
   * The Lead was converted earlier. Returns `already_converted` with the same
   * Contact. The one write it may still do is attaching THIS Deal to that
   * Contact when the Deal has none (a Deal never overwritten, and never
   * attached to a Contact that has since been deleted).
   */
  private async replayAlreadyConverted(
    tx: Client,
    companyId: string,
    audit: AuditActor,
    deal: { id: string; contactId: string | null },
    lead: { id: string; convertedContactId: string | null },
  ): Promise<LeadConversionResult> {
    if (!lead.convertedContactId) {
      throw new ConflictException(
        'This lead was converted, but its contact no longer exists.',
      );
    }

    const relinked = { deals: 0, tasks: 0, calendarEvents: 0 };

    if (!deal.contactId) {
      const contact = await tx.contact.findFirst({
        where: { id: lead.convertedContactId, companyId, deletedAt: null },
        select: { id: true },
      });

      if (contact) {
        const before = await tx.deal.findFirstOrThrow({
          where: { id: deal.id, companyId },
        });
        const after = await tx.deal.update({
          where: { id: deal.id, companyId, deletedAt: null },
          data: { contactId: contact.id },
        });

        await auditUpdate(tx, 'deal', companyId, audit, before, after);
        relinked.deals = 1;
      }
    }

    return {
      outcome: 'already_converted',
      contactId: lead.convertedContactId,
      leadId: lead.id,
      dealId: deal.id,
      relinked,
    };
  }

  /**
   * Points the Lead's OTHER open work at the new Contact so the Contact's
   * timeline and tabs (which resolve through contactId) show it. Only rows
   * whose contactId is empty are touched — an existing contactId is never
   * overwritten — and leadId is never cleared. Each change is audited with
   * the conversion's correlationId.
   */
  private async relinkRelatedRecords(
    tx: Client,
    companyId: string,
    audit: AuditActor,
    leadId: string,
    wonDealId: string,
    contactId: string,
  ): Promise<LeadConversionResult['relinked']> {
    const limit = LEAD_CONVERSION_MAX_RELATED + 1;

    const deals = await tx.deal.findMany({
      where: {
        companyId,
        leadId,
        deletedAt: null,
        contactId: null,
        id: { not: wonDealId },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    const tasks = await tx.task.findMany({
      where: { companyId, leadId, deletedAt: null, contactId: null },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    const events = await tx.calendarEvent.findMany({
      where: { companyId, leadId, deletedAt: null, contactId: null },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    if (
      deals.length > LEAD_CONVERSION_MAX_RELATED ||
      tasks.length > LEAD_CONVERSION_MAX_RELATED ||
      events.length > LEAD_CONVERSION_MAX_RELATED
    ) {
      throw new ConflictException(TOO_MANY_RELATED_MESSAGE);
    }

    for (const before of deals) {
      const after = await tx.deal.update({
        where: { id: before.id, companyId },
        data: { contactId },
      });
      await auditUpdate(tx, 'deal', companyId, audit, before, after);
    }

    for (const before of tasks) {
      const after = await tx.task.update({
        where: { id: before.id, companyId },
        data: { contactId },
      });
      await auditUpdate(tx, 'task', companyId, audit, before, after);
    }

    for (const before of events) {
      const after = await tx.calendarEvent.update({
        where: { id: before.id, companyId },
        data: { contactId },
      });
      await auditUpdate(tx, 'calendarEvent', companyId, audit, before, after);
    }

    return {
      deals: deals.length,
      tasks: tasks.length,
      calendarEvents: events.length,
    };
  }
}
