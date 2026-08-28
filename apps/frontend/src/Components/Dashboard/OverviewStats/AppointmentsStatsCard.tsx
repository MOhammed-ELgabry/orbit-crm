import { FiCalendar, FiArrowUpRight, FiMoreHorizontal } from "react-icons/fi";
import { useTranslation } from "react-i18next";

export default function AppointmentsStatsCard() {
  const { t } = useTranslation();

  return (
    <div
      className="
        group w-full
        rounded-2xl
        border border-slate-100
        bg-white
        p-3
        shadow-sm
        transition-all duration-200
        hover:-translate-y-0.5
        hover:shadow-md
      "
    >
      {/* Top */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <FiCalendar size={17} />
        </div>

        <button
          type="button"
          aria-label={t("moreOptions")}
          className="
            flex h-7 w-7 shrink-0
            items-center justify-center
            rounded-lg
            text-slate-400
            transition-colors
            hover:bg-slate-50
            hover:text-slate-600
          "
        >
          <FiMoreHorizontal size={17} />
        </button>
      </div>

      {/* Content */}
      <div className="mt-2">
        <p className="truncate text-[11px] font-medium text-slate-500">
          {t("todaysAppointments")}
        </p>

        <h2 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900 sm:text-[22px]">
          12
        </h2>
      </div>

      {/* Growth */}
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <span className="flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
          <FiArrowUpRight size={11} />
          8%
        </span>

        <span className="truncate text-[10px] text-slate-400">
          {t("vsYesterday")}
        </span>
      </div>
    </div>
  );
}
