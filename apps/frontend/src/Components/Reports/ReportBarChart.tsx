import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { prefersReducedMotion } from "../../lib/motionPreference";

export interface ReportBarDatum {
  label: string;
  /** Bar length only. The exact figure is `display`. */
  value: number;
  /** Exact, already-formatted text shown in the tooltip and the data list. */
  display: string;
  color?: string;
}

interface ReportBarChartProps {
  data: ReportBarDatum[];
  ariaLabel: string;
  height?: number;
}

// brand-500: the reference identity's chart green.
const DEFAULT_COLOR = "#2D965E";
const TRACK_COLOR = "#EEF2EF";
const AXIS_COLOR = "#66736C";
const MAX_TICK_CHARS = 18;

interface TickProps {
  x?: number;
  y?: number;
  payload?: { value: string };
}

/** Category label: truncated with an ellipsis, full text kept in <title>. */
function CategoryTick({ x = 0, y = 0, payload }: TickProps) {
  const full = payload?.value ?? "";
  const text =
    full.length > MAX_TICK_CHARS
      ? `${full.slice(0, MAX_TICK_CHARS - 1)}…`
      : full;

  return (
    <text x={x} y={y} dy={4} textAnchor="end" fontSize={12} fill={AXIS_COLOR}>
      <title>{full}</title>
      {text}
    </text>
  );
}

interface TooltipContentProps {
  active?: boolean;
  payload?: { payload?: ReportBarDatum }[];
}

/** Same exact figure the data list shows, in the product's own card style. */
function ChartTooltip({ active, payload }: TooltipContentProps) {
  const datum = payload?.[0]?.payload;

  if (!active || !datum) {
    return null;
  }

  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-pop">
      <p className="flex items-center gap-2 font-semibold text-slate-700">
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: datum.color ?? DEFAULT_COLOR }}
        />
        {datum.label}
      </p>
      <p className="mt-0.5 font-nunito text-sm font-bold tabular-nums text-ink">
        {datum.display}
      </p>
    </div>
  );
}

/**
 * One horizontal bar chart used by all three reports.
 *
 * - `dir="ltr"` on the wrapper: recharts does not mirror its axes, so the
 *   chart stays in a consistent left-to-right frame inside an RTL page
 *   while the surrounding text and legends follow the document direction.
 * - Cells are passed as an ARRAY, never inside a React Fragment: the
 *   installed react-is (16.x) does not recognise React 19 fragments, which
 *   recharts would otherwise need to flatten.
 * - The chart is decorative reinforcement; every value is also rendered as
 *   text next to it by the caller, so nothing depends on seeing the bars.
 * - Bars draw in with a short animation unless the user prefers reduced
 *   motion. The category axis width follows the longest label (bounded), so
 *   small screens are not squeezed by a fixed 110px gutter.
 */
export default function ReportBarChart({
  data,
  ariaLabel,
  height = 220,
}: ReportBarChartProps) {
  const longest = data.reduce(
    (max, datum) => Math.max(max, Math.min(datum.label.length, MAX_TICK_CHARS)),
    0,
  );
  const axisWidth = Math.min(128, Math.max(64, longest * 7 + 12));

  return (
    <div dir="ltr" role="img" aria-label={ariaLabel} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
          barCategoryGap="28%"
        >
          <CartesianGrid horizontal={false} stroke="#EEF2EF" />
          <XAxis type="number" hide domain={[0, "dataMax"]} />
          <YAxis
            type="category"
            dataKey="label"
            width={axisWidth}
            tickLine={false}
            axisLine={false}
            tick={<CategoryTick />}
          />
          <Tooltip cursor={{ fill: "#F4F7F5" }} content={<ChartTooltip />} />
          <Bar
            dataKey="value"
            radius={[0, 8, 8, 0]}
            background={{ fill: TRACK_COLOR, radius: 8 }}
            isAnimationActive={!prefersReducedMotion()}
            animationDuration={650}
            animationEasing="ease-out"
          >
            {data.map((datum) => (
              <Cell key={datum.label} fill={datum.color ?? DEFAULT_COLOR} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
