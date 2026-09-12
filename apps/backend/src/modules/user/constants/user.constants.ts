export const USER_REPOSITORY = 'IUserRepository';

/**
 * Orbit CRM's Basic plan: 6 total users per company, Owner included
 * (1 Owner + 5 staff). Enforced in UserRepository.createWithinCompanyLimit
 * — a per-companyId count, not a global one; see that method for the
 * concurrency-safety mechanism. There is currently only one plan, so
 * this is a plain application constant rather than a Company/Plan
 * schema field — see the approved Phase 1 audit's migration decision
 * for why no schema change was made for this.
 */
export const BASIC_PLAN_USER_LIMIT = 6;
