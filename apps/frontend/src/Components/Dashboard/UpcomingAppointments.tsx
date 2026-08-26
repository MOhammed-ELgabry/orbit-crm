import { FiMoreHorizontal, FiClock, FiCalendar } from "react-icons/fi";

const appointments = [
  {
    name: "Sarah Ahmed",
    treatment: "Dental Cleaning",
    time: "10:30 AM",
    date: "Today",
    status: "Confirmed",
  },
  {
    name: "Omar Ali",
    treatment: "Root Canal",
    time: "11:00 AM",
    date: "Today",
    status: "Pending",
  },
  {
    name: "Mariam Hassan",
    treatment: "Dental Check-up",
    time: "12:30 PM",
    date: "Today",
    status: "Confirmed",
  },
  {
    name: "Ahmed Khaled",
    treatment: "Teeth Whitening",
    time: "01:30 PM",
    date: "Today",
    status: "Confirmed",
  },
];

export default function UpcomingAppointments() {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-[16px] font-bold text-slate-800">
            Upcoming Appointments
          </h2>

          <p className="mt-0.5 text-[11px] text-slate-400">
            Your next scheduled appointments
          </p>
        </div>

        <button
          type="button"
          aria-label="More options"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
        >
          <FiMoreHorizontal size={18} />
        </button>
      </div>

      {/* Appointments */}
      <div className="space-y-2">
        {appointments.map((appointment) => (
          <div
            key={`${appointment.name}-${appointment.time}`}
            className="flex items-center justify-between rounded-xl px-2.5 py-2.5 transition hover:bg-slate-50"
          >
            {/* Patient */}
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                <FiCalendar size={16} />
              </div>

              <div className="min-w-0">
                <p className="truncate text-[12px] font-semibold text-slate-700">
                  {appointment.name}
                </p>

                <p className="mt-0.5 truncate text-[10px] text-slate-400">
                  {appointment.treatment}
                </p>
              </div>
            </div>

            {/* Time + Status */}
            <div className="ml-2 flex shrink-0 flex-col items-end gap-1">
              <div className="flex items-center gap-1 text-[10px] font-medium text-slate-500">
                <FiClock size={11} />
                {appointment.time}
              </div>

              <span
                className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${
                  appointment.status === "Confirmed"
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-amber-50 text-amber-600"
                }`}
              >
                {appointment.status}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <button
        type="button"
        className="mt-3 w-full rounded-lg py-2 text-[11px] font-semibold text-indigo-600 transition hover:bg-indigo-50"
      >
        View Calendar
      </button>
    </div>
  );
}
