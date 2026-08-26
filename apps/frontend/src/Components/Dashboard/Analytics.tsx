import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

const data = [
  { name: "Appointments", value: 40 },
  { name: "Treatments", value: 25 },
  { name: "Patients", value: 35 },
];

const COLORS = ["#FF8F6B", "#FFD66B", "#5B93FF"];

export default function Analytics() {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="mb-3">
        <h2 className="text-[16px] font-bold text-slate-800">Analytics</h2>

        <p className="mt-0.5 text-[11px] text-slate-400">
          Overall clinic performance
        </p>
      </div>

      {/* Donut */}
      <div className="relative h-[230px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={72}
              outerRadius={90}
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
          <span className="text-[28px] font-bold tracking-tight text-slate-800">
            80%
          </span>

          <span className="text-[10px] font-medium text-slate-400">
            Performance
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-5">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#FF8F6B]" />
          <span className="text-[11px] text-slate-500">Completed</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#FFD66B]" />
          <span className="text-[11px] text-slate-500">Remaining</span>
        </div>
      </div>
    </div>
  );
}
