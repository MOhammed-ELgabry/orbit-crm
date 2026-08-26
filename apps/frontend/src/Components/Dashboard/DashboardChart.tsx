import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const data = [
  { day: "Mon", appointments: 18 },
  { day: "Tue", appointments: 25 },
  { day: "Wed", appointments: 20 },
  { day: "Thu", appointments: 32 },
  { day: "Fri", appointments: 28 },
  { day: "Sat", appointments: 38 },
  { day: "Sun", appointments: 30 },
];

export default function DashboardChart() {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-[16px] font-bold text-slate-800">
            Appointments Overview
          </h2>

          <p className="mt-0.5 text-[11px] text-slate-400">
            Appointments during this week
          </p>
        </div>

        <select
          className="
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
          "
        >
          <option>Weekly</option>
          <option>Monthly</option>
          <option>Yearly</option>
        </select>
      </div>

      {/* Chart */}
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
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
