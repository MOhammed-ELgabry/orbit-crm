export class CalendarEventEntity {
  id: string;

  // Tenant
  companyId: string;

  // Core Information
  title: string;
  description: string | null;
  location: string | null;

  // Scheduling
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  status: string;

  // Associations — independent and optional, exactly like Task's own
  // three (see the CalendarEvent model comment in schema.prisma)
  contactId: string | null;
  leadId: string | null;
  dealId: string | null;

  // Ownership / Assignment
  createdById: string;
  assignedToId: string | null;

  // Audit
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;

  constructor(partial: Partial<CalendarEventEntity>) {
    Object.assign(this, partial);
  }
}
