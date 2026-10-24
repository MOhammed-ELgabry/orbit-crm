import { useTranslation } from "react-i18next";

import type { AuditActor } from "../../types/audit";

interface AuditActorNameProps {
  actor: AuditActor | null;
}

export default function AuditActorName({ actor }: AuditActorNameProps) {
  const { t } = useTranslation();

  if (!actor) {
    return <span className="text-slate-500">{t("auditSystemActor")}</span>;
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span dir="auto" className="font-medium text-slate-800">
        {actor.name ?? t("auditUnknownActor")}
      </span>

      {actor.status !== "active" && (
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
          {t(
            `auditActorStatus${actor.status[0].toUpperCase()}${actor.status.slice(1)}`,
          )}
        </span>
      )}
    </span>
  );
}
