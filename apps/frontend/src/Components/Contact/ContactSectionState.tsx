import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { ResourceStatus } from "../../hooks/useKeyedResource";

interface ContactSectionStateProps {
  status: ResourceStatus;
  onRetry: () => void;
  /** Only consulted when `status === "ready"`. */
  isEmpty: boolean;
  emptyMessage: string;
  children: ReactNode;
}

/**
 * The loading / forbidden / error / empty / ready frame shared by every
 * section of the Customer 360 page. Each section owns its own instance, so
 * one failing or forbidden source never takes the rest of the page down.
 */
export default function ContactSectionState({
  status,
  onRetry,
  isEmpty,
  emptyMessage,
  children,
}: ContactSectionStateProps) {
  const { t } = useTranslation();

  if (status === "idle" || status === "loading") {
    return (
      <div className="space-y-3 py-2" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-50" />
        ))}
      </div>
    );
  }

  if (status === "forbidden") {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-1 py-10 text-center"
      >
        <p className="text-sm font-medium text-slate-600">
          {t("contact360NoAccessTitle")}
        </p>
        <p className="text-xs text-slate-400">
          {t("contact360NoAccessDescription")}
        </p>
      </div>
    );
  }

  if (status === "error" || status === "not-found") {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-2 py-10 text-center"
      >
        <p className="text-sm text-slate-500">{t("somethingWentWrong")}</p>
        <button
          type="button"
          onClick={onRetry}
          className="text-xs font-semibold text-blue-600 hover:underline"
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <p className="py-10 text-center text-sm text-slate-500">{emptyMessage}</p>
    );
  }

  return <>{children}</>;
}
