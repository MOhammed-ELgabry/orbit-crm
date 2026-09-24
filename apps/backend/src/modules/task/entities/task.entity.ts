export class TaskEntity {
  id: string;

  // Tenant
  companyId: string;

  // Core Information
  title: string;
  description: string | null;

  // CRM Information
  status: string;
  priority: string;
  dueDate: Date | null;

  // Derived from status — see the Task model comment in schema.prisma
  // for why this is never independently client-writable.
  completedAt: Date | null;

  // Associations
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

  constructor(partial: Partial<TaskEntity>) {
    Object.assign(this, partial);
  }
}
