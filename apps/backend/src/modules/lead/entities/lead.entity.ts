export class LeadEntity {
  id: string;

  // Tenant
  companyId: string;

  // Personal Information
  firstName: string;
  lastName: string;

  // Contact Information
  email: string | null;
  phone: string | null;

  // Business Information
  organizationName: string | null;

  // CRM Information
  source: string | null;
  status: string;
  notes: string | null;

  // Ownership / Assignment
  createdById: string;
  assignedToId: string | null;

  // Audit
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;

  constructor(partial: Partial<LeadEntity>) {
    Object.assign(this, partial);
  }
}
