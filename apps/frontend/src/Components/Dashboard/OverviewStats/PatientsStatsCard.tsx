import { FiUsers, FiArrowUpRight, FiMoreHorizontal } from "react-icons/fi";
import { useTranslation } from "react-i18next";

export default function PatientsStatsCard() {
  const { t } = useTranslation();

  return (
    <div
      className="
        group w-full
        rounded-2xl
        border border-slate-100
        bg-white
        p-3 sm:p-4
        shadow-sm
        transition-all duration-200
        hover:-translate-y-0.5
        hover:shadow-md
      "
    >
      {/* Top */}
      <div className="flex items-start justify-between gap-2">
        <div
          className="
            flex h-9 w-9 shrink-0
            items-center justify-center
            rounded-xl
            bg-purple-50
            text-purple-600
            transition-transform duration-200
            group-hover:scale-105
            sm:h-10 sm:w-10
          "
        >
          <FiUsers size={18} />
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
          <FiMoreHorizontal size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="mt-2 sm:mt-3">
        <p className="truncate text-[11px] font-medium text-slate-500 sm:text-[12px]">
          {t("newPatients")}
        </p>

        <h2 className="mt-0.5 text-[22px] font-bold tracking-tight text-slate-900 sm:mt-1 sm:text-[25px]">
          24
        </h2>
      </div>

      {/* Growth */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:mt-2">
        <span className="flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 sm:text-[11px]">
          <FiArrowUpRight size={12} />
          12%
        </span>

        <span className="truncate text-[10px] text-slate-400 sm:text-[11px]">
          {t("vsLastMonth")}
        </span>
      </div>
    </div>
  );
}
