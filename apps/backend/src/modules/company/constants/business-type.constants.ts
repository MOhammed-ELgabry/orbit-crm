/**
 * The fixed set of business types offered on the "Business Type
 * Selection" onboarding step. A plain validated string column (see
 * Company.businessType in schema.prisma) rather than a Prisma enum, so
 * adding a future option is a one-line change here instead of a schema
 * migration — same tradeoff already used for User.provider.
 */
export const BUSINESS_TYPES = [
  'medical_clinics',
  'real_estate',
  'auto_spare_parts',
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];