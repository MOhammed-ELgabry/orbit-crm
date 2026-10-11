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

const DEFAULT_COLOR = "#605BFF";

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
 */
export default function ReportBarChart({
  data,
  ariaLabel,
  height = 220,
}: ReportBarChartProps) {
  return (
    <div dir="ltr" role="img" aria-label={ariaLabel} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
        >
          <CartesianGrid horizontal={false} stroke="#F1F5F9" />
          <XAxis type="number" hide domain={[0, "dataMax"]} />
          <YAxis
            type="category"
            dataKey="label"
            width={110}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "#64748B" }}
          />
          <Tooltip
            cursor={{ fill: "#F8FAFC" }}
            formatter={(_value, _name, item) =>
              (item?.payload as ReportBarDatum | undefined)?.display ?? ""
            }
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} isAnimationActive={false}>
            {data.map((datum) => (
              <Cell key={datum.label} fill={datum.color ?? DEFAULT_COLOR} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
