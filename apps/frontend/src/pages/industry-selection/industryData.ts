import { FaClinicMedical, FaHome, FaCogs } from "react-icons/fa";
import type { IconType } from "react-icons";

import type { BusinessType } from "../../services/authService";

export interface IndustryOption {
  /** Sent to POST /auth/business-type — must match the backend's BUSINESS_TYPES exactly. */
  value: BusinessType;
  /** i18n key for the card title. */
  title: string;
  /** i18n key for the card description. */
  description: string;
  icon: IconType;
}

export const industries: IndustryOption[] = [
  {
    value: "medical_clinics",
    title: "medicalClinics",
    description: "medicalClinicsDescription",
    icon: FaClinicMedical,
  },
  {
    value: "real_estate",
    title: "realEstate",
    description: "realEstateDescription",
    icon: FaHome,
  },
  {
    value: "auto_spare_parts",
    title: "autoSpareParts",
    description: "autoSparePartsDescription",
    icon: FaCogs,
  },
];