import { FiMoreHorizontal } from "react-icons/fi";

const patients = [
  {
    name: "Sarah Ahmed",
    treatment: "Dental Cleaning",
    time: "10:30 AM",
    avatar: "SA",
  },
  {
    name: "Omar Ali",
    treatment: "Root Canal",
    time: "11:00 AM",
    avatar: "OA",
  },
  {
    name: "Mariam Hassan",
    treatment: "Dental Check-up",
    time: "12:00 PM",
    avatar: "MH",
  },
  {
    name: "Ahmed Khaled",
    treatment: "Teeth Whitening",
    time: "01:30 PM",
    avatar: "AK",
  },
];

export default function RecentPatients() {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-[16px] font-bold text-slate-800">
            Recent Patients
          </h2>

          <p className="mt-0.5 text-[11px] text-slate-400">
            Recently registered patients
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

      {/* Patients */}
      <div className="space-y-2">
        {patients.map((patient) => (
          <div
            key={patient.name}
            className="flex items-center justify-between rounded-xl px-2.5 py-2 transition hover:bg-slate-50"
          >
            <div className="flex min-w-0 items-center gap-3">
              {/* Avatar */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-600">
                {patient.avatar}
              </div>

              {/* Info */}
              <div className="min-w-0">
                <p className="truncate text-[12px] font-semibold text-slate-700">
                  {patient.name}
                </p>

                <p className="mt-0.5 truncate text-[10px] text-slate-400">
                  {patient.treatment}
                </p>
              </div>
            </div>

            {/* Time */}
            <span className="ml-2 shrink-0 text-[10px] font-medium text-slate-400">
              {patient.time}
            </span>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="mt-3 w-full rounded-lg py-2 text-[11px] font-semibold text-blue-600 transition hover:bg-blue-50"
      >
        View All Patients
      </button>
    </div>
  );
}
