export class DealEntity {
  id: string;

  // Tenant
  companyId: string;

  // Core Information
  title: string;
  // Prisma.Decimal on the wire out of the database — DealRepository
  // converts it to a string here (.toString()) at the boundary where
  // the raw Prisma result is turned into this entity, rather than
  // relying on JSON serialization to do it implicitly later. A JS
  // `number` would silently lose precision on large amounts; Decimal's
  // own string form does not.
  amount: string;

  // CRM Information
  stage: string;
  notes: string | null;
  expectedCloseDate: Date | null;

  // Associations
  contactId: string | null;
  leadId: string | null;

  // Ownership / Assignment
  createdById: string;
  assignedToId: string | null;

  // Audit
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;

  constructor(partial: Partial<DealEntity>) {
    Object.assign(this, partial);
  }
}