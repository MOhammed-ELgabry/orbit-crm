import type { LeadStatus } from "../../types/lead";

export const LEAD_STATUS_LABEL_KEY: Record<string, string> = {
  new: "leadStatusNew",
  contacted: "leadStatusContacted",
  qualified: "leadStatusQualified",
  unqualified: "leadStatusUnqualified",
  lost: "leadStatusLost",
};

const STATUS_STYLES: Record<string, string> = {
  new: "bg-blue-50 text-blue-600",
  contacted: "bg-amber-50 text-amber-600",
  qualified: "bg-emerald-50 text-emerald-600",
  unqualified: "bg-slate-100 text-slate-500",
  lost: "bg-red-50 text-red-500",
};

export function leadStatusBadgeClass(status: string): string {
  return STATUS_STYLES[status as LeadStatus] ?? "bg-slate-100 text-slate-500";
}