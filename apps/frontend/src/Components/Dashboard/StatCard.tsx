import type { IconType } from "react-icons";

const COLOR_CLASSES: Record<string, string> = {
  blue: "bg-brand-50 text-brand-600",
  brand: "bg-brand-50 text-brand-600",
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
    <div className="rounded-2xl border border-line bg-white p-4 shadow-card">
      <div className="flex items-start justify-between">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${COLOR_CLASSES[color]}`}
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
