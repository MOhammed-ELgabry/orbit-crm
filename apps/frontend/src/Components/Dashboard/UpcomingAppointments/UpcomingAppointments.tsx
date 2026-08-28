import { FiMoreHorizontal, FiClock, FiCalendar } from "react-icons/fi";
import { useTranslation } from "react-i18next";

import { appointments } from "./upcomingAppointmentsData";

export default function UpcomingAppointments() {
  const { t } = useTranslation();

  return (
    <div
      className="
        w-full
        rounded-2xl
        border border-slate-100
        bg-white
        p-4
        shadow-sm
        sm:p-5
      "
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-slate-800">
            {t("upcomingAppointments")}
          </h2>

          <p className="mt-0.5 truncate text-[11px] text-slate-400">
            {t("nextScheduledAppointments")}
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

      {/* Appointments */}
      <div className="space-y-2">
        {appointments.map((appointment) => (
          <div
            key={`${appointment.name}-${appointment.time}`}
            className="
              flex flex-col
              gap-2
              rounded-xl
              px-2.5 py-2.5
              transition
              hover:bg-slate-50

              sm:flex-row
              sm:items-center
              sm:justify-between
              sm:gap-3
            "
          >
            {/* Patient */}
            <div
              className="
                flex min-w-0
                items-start
                gap-2.5
                sm:items-center
                sm:gap-3
              "
            >
              <div
                className="
                  flex h-9 w-9 shrink-0
                  items-center justify-center
                  rounded-full
                  bg-indigo-50
                  text-indigo-600
                "
              >
                <FiCalendar size={16} />
              </div>

              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-slate-700">
                  {appointment.name}
                </p>

                <p className="mt-0.5 text-[10px] text-slate-400">
                  {t(appointment.treatment)}
                </p>
              </div>
            </div>

            {/* Time + Status */}
            <div
              className="
                ms-[47px]
                flex items-center gap-2

                sm:ms-2
                sm:shrink-0
                sm:flex-col
                sm:items-end
                sm:gap-1
              "
            >
              <div
                className="
                  flex items-center gap-1
                  text-[10px]
                  font-medium
                  text-slate-500
                "
              >
                <FiClock size={11} />
                <span>{appointment.time}</span>
              </div>

              <span
                className={`
                  rounded-md
                  px-1.5 py-0.5
                  text-[9px]
                  font-semibold
                  ${
                    appointment.status === "Confirmed"
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-amber-50 text-amber-600"
                  }
                `}
              >
                {t(
                  appointment.status === "Confirmed" ? "confirmed" : "pending",
                )}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <button
        type="button"
        className="
          mt-3
          w-full
          rounded-lg
          py-2
          text-[11px]
          font-semibold
          text-indigo-600
          transition
          hover:bg-indigo-50
        "
      >
        {t("viewCalendar")}
      </button>
    </div>
  );
}
