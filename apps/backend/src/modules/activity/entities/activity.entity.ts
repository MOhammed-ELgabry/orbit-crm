export class ActivityEntity {
  id: string;

  // Tenant
  companyId: string;

  // Classification
  type: string;

  // Content
  title: string;
  description: string | null;

  occurredAt: Date;

  // Actor
  createdById: string;

  // Association
  contactId: string | null;

  // Audit
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;

  constructor(partial: Partial<ActivityEntity>) {
    Object.assign(this, partial);
  }
}
