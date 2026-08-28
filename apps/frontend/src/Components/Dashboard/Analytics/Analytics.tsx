import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { useTranslation } from "react-i18next";

const data = [
  { name: "Appointments", value: 40 },
  { name: "Treatments", value: 25 },
  { name: "Patients", value: 35 },
];

const COLORS = ["#FF8F6B", "#FFD66B", "#5B93FF"];

export default function Analytics() {
  const { t } = useTranslation();

  return (
    <div className="w-full rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
      {/* Header */}
      <div className="mb-3">
        <h2 className="text-base font-bold text-slate-800">{t("analytics")}</h2>

        <p className="mt-0.5 text-[11px] text-slate-400">
          {t("overallClinicPerformance")}
        </p>
      </div>

      {/* Donut */}
      <div className="relative mx-auto h-[260px] w-full max-w-[320px] sm:h-[300px] sm:max-w-[360px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="58%"
              outerRadius="76%"
              paddingAngle={3}
              dataKey="value"
              stroke="none"
              startAngle={90}
              endAngle={-270}
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Center Percentage */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[34px] font-bold tracking-tight text-slate-800 sm:text-[38px]">
            80%
          </span>

          <span className="mt-0.5 text-[10px] font-medium text-slate-400 sm:text-[11px]">
            {t("performance")}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#FF8F6B]" />
          <span className="text-[11px] text-slate-500">{t("completed")}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#FFD66B]" />
          <span className="text-[11px] text-slate-500">{t("remaining")}</span>
        </div>
      </div>
    </div>
  );
}
