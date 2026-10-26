import type { ReactNode } from "react";
import Button from "../ui/Button";
import { cardClass } from "../ui/styles";
import { useTranslation } from "react-i18next";

interface ReportSectionProps {
  title: string;
  /** One line saying exactly what the figures measure (e.g. "current, not period-limited"). */
  basis?: string;
  state: "loading" | "error" | "ready";
  /** True when the report loaded fine but there is nothing to show for the period. */
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRetry?: () => void;
  children?: ReactNode;
}

/**
 * Shared shell for a report card: owns the loading skeleton, the error
 * state (with an explicit Retry — nothing retries automatically) and the
 * empty state, so each report only renders its own data. Logical spacing
 * (text-start, ms-/me-) keeps it correct in both RTL and LTR.
 */
export default function ReportSection({
  title,
  basis,
  state,
  isEmpty = false,
  emptyTitle,
  emptyDescription,
  onRetry,
  children,
}: ReportSectionProps) {
  const { t } = useTranslation();

  return (
    <section className={`p-5 ${cardClass}`} aria-busy={state === "loading"}>
      <header className="mb-4 text-start">
        <h2 className="font-nunito text-base font-semibold text-slate-800">
          {title}
        </h2>
        {basis && <p className="mt-0.5 text-xs text-slate-400">{basis}</p>}
      </header>

      {state === "loading" && (
        <div className="space-y-3" role="status" aria-label={t("loading")}>
          <div className="grid grid-cols-2 gap-3">
            <div className="h-20 animate-pulse rounded-xl bg-slate-50" />
            <div className="h-20 animate-pulse rounded-xl bg-slate-50" />
          </div>
          <div className="h-48 animate-pulse rounded-xl bg-slate-50" />
        </div>
      )}

      {state === "error" && (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <p className="text-sm text-slate-500">{t("somethingWentWrong")}</p>
          {onRetry && (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              {t("retry")}
            </Button>
          )}
        </div>
      )}

      {state === "ready" && isEmpty && (
        <div className="flex flex-col items-center gap-1 py-10 text-center">
          <p className="text-sm font-medium text-slate-600">
            {emptyTitle ?? t("reportsEmptyTitle")}
          </p>
          <p className="text-xs text-slate-400">
            {emptyDescription ?? t("reportsEmptyDescription")}
          </p>
        </div>
      )}

      {state === "ready" && !isEmpty && children}
    </section>
  );
}
