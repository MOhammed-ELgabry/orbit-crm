import { FaClinicMedical, FaHome, FaCogs } from "react-icons/fa";
import type { IconType } from "react-icons";

import type { BusinessType } from "../services/authService";

export interface BusinessTypeCopy {
  icon: IconType;
  /** i18n key. */
  dashboardTagline: string;
  /** i18n key — label for the Contacts entity (e.g. "Patients"). */
  contactsLabel: string;
  /** i18n key — singular of contactsLabel, for buttons like "Add Patient". */
  contactSingular: string;
  /** i18n key — label for the Activities entity (e.g. "Appointments"). */
  activitiesLabel: string;
  /** Tailwind color token shared by this vertical's accent elements. */
  accent: "blue" | "emerald" | "amber";
}

/**
 * Keyed by the exact 3 values BUSINESS_TYPES defines on the backend
 * (backend/src/modules/company/constants/business-type.constants.ts).
 * There is no 4th entry, and none should be added here without adding
 * it there first — see that constant's own doc comment.
 */
export const BUSINESS_TYPE_COPY: Record<BusinessType, BusinessTypeCopy> = {
  medical_clinics: {
    icon: FaClinicMedical,
    dashboardTagline: "dashboardTaglineMedical",
    contactsLabel: "patients",
    contactSingular: "patient",
    activitiesLabel: "appointments",
    accent: "blue",
  },
  real_estate: {
    icon: FaHome,
    dashboardTagline: "dashboardTaglineRealEstate",
    contactsLabel: "clients",
    contactSingular: "client",
    activitiesLabel: "propertyActivity",
    accent: "emerald",
  },
  auto_spare_parts: {
    icon: FaCogs,
    dashboardTagline: "dashboardTaglineAutoParts",
    contactsLabel: "customers",
    contactSingular: "customer",
    activitiesLabel: "serviceVisits",
    accent: "amber",
  },
};

export const DEFAULT_BUSINESS_TYPE_COPY: BusinessTypeCopy = {
  icon: FaHome,
  dashboardTagline: "dashboardSubtitle",
  contactsLabel: "contacts",
  contactSingular: "contact",
  activitiesLabel: "activities",
  accent: "blue",
};

/**
 * businessType is nullable (pre-onboarding) and, at the database level,
 * an unconstrained TEXT column (see BUSINESS_TYPES's doc comment on the
 * backend) — so this always has a safe fallback rather than assuming
 * one of exactly 3 values will be present.
 */
export const getBusinessTypeCopy = (
  businessType: string | null | undefined,
): BusinessTypeCopy =>
  (businessType &&
    (BUSINESS_TYPE_COPY as Record<string, BusinessTypeCopy>)[businessType]) ||
  DEFAULT_BUSINESS_TYPE_COPY;
