import type { ReactNode } from "react";

interface StatTileProps {
  label: string;
  value: ReactNode;
  hint?: string;
}

export default function StatTile({ label, value, hint }: StatTileProps) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3 text-start">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 font-nunito text-2xl font-bold text-slate-800 tabular-nums">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
