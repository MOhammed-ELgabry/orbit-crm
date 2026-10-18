import { Prisma } from '@prisma/client';

/**
 * Builds the `where` fragment that selects the activities belonging to one
 * contact's timeline.
 *
 * Why this is not just `{ contactId }`
 * ------------------------------------
 * Activities a user logs by hand carry `contactId` directly. The
 * system-generated lifecycle events written by DealService, TaskService and
 * CalendarService (see ActivityRepository.createDealEvent /
 * createTaskEvent / createCalendarEvent) only carry the id of their source
 * entity (`dealId` / `taskId` / `calendarEventId`) — never a `contactId`.
 * Matching on `Activity.contactId` alone therefore hides every deal, task and
 * calendar event of the contact from its timeline.
 *
 * How the contact is resolved
 * ---------------------------
 * The contact is read from the source entity's own `contactId` relation at
 * query time, never copied onto the activity and never inferred from the
 * activity's title/description or from anything the client sends:
 *
 *   - a manual activity            -> Activity.contactId
 *   - a deal lifecycle event       -> Deal.contactId       (via Activity.dealId)
 *   - a task lifecycle event       -> Task.contactId       (via Activity.taskId)
 *   - a calendar lifecycle event   -> CalendarEvent.contactId (via Activity.calendarEventId)
 *
 * Consequences (intentional):
 *   - No schema change, no migration and no backfill: events written before
 *     this change are resolved exactly like new ones.
 *   - A source's events follow the source's CURRENT contact. If a deal is
 *     re-assigned to another contact, its whole history moves with it.
 *   - Each activity row appears at most once: the branches are OR-ed inside a
 *     single query, so an activity that matches through more than one branch
 *     (e.g. a manual activity whose contactId equals its deal's contactId) is
 *     never duplicated.
 *   - A source that has been soft-deleted still resolves, so the "deleted"
 *     event (logged after the soft delete) and the earlier history stay on
 *     the timeline.
 *
 * Tenant safety
 * -------------
 * Foreign keys are single-column (`contactId`, `dealId`, ... are plain
 * references to a row's `id`), so the database alone guarantees neither that
 * an activity's contact, nor a deal's/task's/event's contact, belongs to the
 * same company as the row that points at it. The services never create such
 * rows (every write validates the reference with the caller's `companyId`),
 * but legacy/imported/hand-edited data or a future bug could. So every
 * branch requires BOTH:
 *   - the row that carries the link to be in the caller's company, and
 *   - the CONTACT it points at to be in the caller's company
 *     (`contact: { is: { companyId } }`).
 * Without the second condition, a company-B deal that (inconsistently) points
 * at a company-A contact would put company B's own rows on the "timeline of a
 * company-A contact" that company B asked for by guessing/knowing its id.
 *
 * The caller always ANDs the result with `Activity.companyId = <tenant from
 * the JWT>` and `deletedAt = null`; that is the primary isolation. The
 * conditions here are a second, independent layer (defence in depth), and
 * they hold for the page query and the `count` alike because both use the
 * same `where`.
 *
 * The contact's own soft-delete flag is intentionally NOT part of the
 * filter: the ownership check is about the company, and a contact deleted
 * later keeps its history readable by its own company (same behaviour as
 * before this filter existed).
 *
 * The result is meant to be AND-ed into the `where`, never spread into it:
 * the shared query builder already uses top-level `OR` for `search`, and
 * spreading this fragment would silently overwrite it.
 */
export function buildContactTimelineFilter(
  companyId: string,
  contactId: string,
): Prisma.ActivityWhereInput {
  const contactInCompany = { contact: { is: { companyId } } };

  return {
    OR: [
      { contactId, ...contactInCompany },
      { deal: { is: { companyId, contactId, ...contactInCompany } } },
      { task: { is: { companyId, contactId, ...contactInCompany } } },
      {
        calendarEvent: { is: { companyId, contactId, ...contactInCompany } },
      },
    ],
  };
}
