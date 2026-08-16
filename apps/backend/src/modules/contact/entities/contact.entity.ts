export class ContactEntity {
  id: string;

  // Tenant
  companyId: string;

  // Personal Information
  firstName: string;
  lastName: string;

  // Contact Information
  email: string | null;
  phone: string | null;
  mobile: string | null;

  // Business Information
  jobTitle: string | null;
  organizationName: string | null;
  website: string | null;

  // Address
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;

  // CRM Information
  notes: string | null;
  source: string | null;
  status: string;

  // Ownership / Assignment
  createdById: string;
  assignedToId: string | null;

  // Audit
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;

  constructor(partial: Partial<ContactEntity>) {
    Object.assign(this, partial);
  }
}
