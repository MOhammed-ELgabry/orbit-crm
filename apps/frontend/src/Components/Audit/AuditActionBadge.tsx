import { useTranslation } from "react-i18next";

import { auditActionKey } from "../../lib/auditFormat";

const TONES: Record<string, string> = {
  create: "bg-emerald-50 text-emerald-700",
  update: "bg-sky-50 text-sky-700",
  delete: "bg-rose-50 text-rose-700",
  status_change: "bg-amber-50 text-amber-700",
  role_assign: "bg-violet-50 text-violet-700",
  password_changed: "bg-orange-50 text-orange-700",
  import: "bg-indigo-50 text-indigo-700",
};

export default function AuditActionBadge({ action }: { action: string }) {
  const { t } = useTranslation();

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        TONES[action] ?? "bg-slate-100 text-slate-700"
      }`}
    >
      {t(auditActionKey(action), { defaultValue: action })}
    </span>
  );
}
