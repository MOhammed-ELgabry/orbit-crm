import {
  FiCheckCircle,
  FiArrowUpRight,
  FiMoreHorizontal,
} from "react-icons/fi";

export default function TreatmentsStatsCard() {
  return (
    <div className="group rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      {/* Top */}
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 transition-transform duration-200 group-hover:scale-105">
          <FiCheckCircle size={18} />
        </div>

        <button
          type="button"
          aria-label="More options"
          className="
            flex h-7 w-7 items-center justify-center
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
      <div className="mt-3">
        <p className="text-[12px] font-medium text-slate-500">
          Completed Treatments
        </p>

        <h2 className="mt-1 text-[25px] font-bold tracking-tight text-slate-900">
          18
        </h2>
      </div>

      {/* Growth */}
      <div className="mt-2 flex items-center gap-1.5">
        <span className="flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-600">
          <FiArrowUpRight size={12} />
          5%
        </span>

        <span className="text-[11px] text-slate-400">vs last month</span>
      </div>
    </div>
  );
}
