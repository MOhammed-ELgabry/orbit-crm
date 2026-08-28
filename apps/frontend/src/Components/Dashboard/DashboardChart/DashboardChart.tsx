import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useTranslation } from "react-i18next";

import { dashboardChartData } from "./dashboardChartData";

export default function DashboardChart() {
  const { t } = useTranslation();

  const translatedData = dashboardChartData.map((item) => ({
    ...item,
    day: t(item.day),
  }));

  return (
    <div className="w-full rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-slate-800">
            {t("appointmentsOverview")}
          </h2>

          <p className="mt-0.5 truncate text-[11px] text-slate-400">
            {t("appointmentsDuringWeek")}
          </p>
        </div>

        <select
          aria-label={t("selectPeriod")}
          className="
            w-full
            rounded-lg
            border border-slate-200
            bg-slate-50
            px-3 py-1.5
            text-[11px]
            font-medium
            text-slate-600
            outline-none
            transition
            focus:border-blue-300
            sm:w-auto
          "
        >
          <option value="weekly">{t("weekly")}</option>
          <option value="monthly">{t("monthly")}</option>
          <option value="yearly">{t("yearly")}</option>
        </select>
      </div>

      {/* Chart */}
      <div className="h-[220px] w-full sm:h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={translatedData}
            margin={{
              top: 10,
              right: 10,
              left: -20,
              bottom: 0,
            }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="#f1f5f9"
            />

            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{
                fontSize: 11,
                fill: "#94a3b8",
              }}
              dy={8}
            />

            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{
                fontSize: 11,
                fill: "#94a3b8",
              }}
            />

            <Tooltip
              contentStyle={{
                borderRadius: "10px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                fontSize: "12px",
              }}
              cursor={{
                stroke: "#dbeafe",
              }}
            />

            <Line
              type="monotone"
              dataKey="appointments"
              stroke="#4F7DF3"
              strokeWidth={3}
              dot={{
                r: 4,
                fill: "#A5BFFF",
                stroke: "#4F7DF3",
                strokeWidth: 2,
              }}
              activeDot={{
                r: 6,
                fill: "#4F7DF3",
                stroke: "#ffffff",
                strokeWidth: 2,
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
