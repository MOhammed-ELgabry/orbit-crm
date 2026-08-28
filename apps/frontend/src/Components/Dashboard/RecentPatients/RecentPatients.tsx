import { FiMoreHorizontal } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import { recentPatients } from "./recentPatientsData";

export default function RecentPatients() {
  const { t } = useTranslation();

  return (
    <div className="w-full rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-slate-800">
            {t("recentPatients")}
          </h2>

          <p className="mt-0.5 truncate text-[11px] text-slate-400">
            {t("recentlyRegisteredPatients")}
          </p>
        </div>

        <button
          type="button"
          aria-label={t("moreOptions")}
          className="
            flex h-8 w-8 shrink-0
            items-center justify-center
            rounded-lg
            text-slate-400
            transition
            hover:bg-slate-50
            hover:text-slate-600
          "
        >
          <FiMoreHorizontal size={18} />
        </button>
      </div>

      {/* Patients */}
      <div className="space-y-2">
        {recentPatients.map((patient) => (
          <div
            key={patient.name}
            className="
              flex flex-col
              gap-1
              rounded-xl
              px-2.5 py-2
              transition
              hover:bg-slate-50
              sm:flex-row
              sm:items-center
              sm:justify-between
              sm:gap-2
            "
          >
            {/* Patient Info */}
            <div className="flex min-w-0 items-start gap-2.5 sm:items-center sm:gap-3">
              {/* Avatar */}
              <div
                className="
                  flex h-9 w-9 shrink-0
                  items-center justify-center
                  rounded-full
                  bg-blue-50
                  text-[11px] font-bold
                  text-blue-600
                "
              >
                {patient.avatar}
              </div>

              {/* Info */}
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-slate-700">
                  {patient.name}
                </p>

                <p className="mt-0.5 text-[10px] text-slate-400">
                  {t(patient.treatment)}
                </p>
              </div>
            </div>

            {/* Time */}
            <span
              className="
                ms-[47px]
                text-[10px] font-medium text-slate-400
                sm:ms-2
                sm:shrink-0
              "
            >
              {patient.time}
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <button
        type="button"
        className="
          mt-3 w-full
          rounded-lg
          py-2
          text-[11px] font-semibold
          text-blue-600
          transition
          hover:bg-blue-50
        "
      >
        {t("viewAllPatients")}
      </button>
    </div>
  );
}
