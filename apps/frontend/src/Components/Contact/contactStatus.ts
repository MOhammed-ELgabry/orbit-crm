import type { ContactStatus } from "../../types/contact";

export const CONTACT_STATUS_LABEL_KEY: Record<string, string> = {
  active: "contactStatusActive",
  inactive: "contactStatusInactive",
  lead: "contactStatusLead",
  customer: "contactStatusCustomer",
  archived: "contactStatusArchived",
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-600",
  inactive: "bg-slate-100 text-slate-500",
  lead: "bg-amber-50 text-amber-600",
  customer: "bg-blue-50 text-blue-600",
  archived: "bg-slate-100 text-slate-400",
};

export function contactStatusBadgeClass(status: string): string {
  return STATUS_STYLES[status as ContactStatus] ?? "bg-slate-100 text-slate-500";
}
