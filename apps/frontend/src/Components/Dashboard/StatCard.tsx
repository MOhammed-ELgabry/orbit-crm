import type { IconType } from "react-icons";

const COLOR_CLASSES: Record<string, string> = {
  blue: "bg-blue-50 text-blue-600",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  purple: "bg-purple-50 text-purple-600",
};

interface StatCardProps {
  icon: IconType;
  color?: keyof typeof COLOR_CLASSES;
  label: string;
  value: number | string;
  isLoading?: boolean;
}

export default function StatCard({
  icon: Icon,
  color = "blue",
  label,
  value,
  isLoading = false,
}: StatCardProps) {
  return (
    <div className="group rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${COLOR_CLASSES[color]}`}
        >
          <Icon size={18} />
        </div>
      </div>

      <div className="mt-3">
        <p className="text-[12px] font-medium text-slate-500">{label}</p>

        {isLoading ? (
          <div className="mt-2 h-6 w-14 animate-pulse rounded bg-slate-100" />
        ) : (
          <h2 className="mt-1 text-[25px] font-bold tracking-tight text-slate-900">
            {value}
          </h2>
        )}
      </div>
    </div>
  );
}
