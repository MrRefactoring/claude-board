import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from 'recharts';

interface DailyBarChartProps<T extends { day: string }> {
  data: T[];
  getValue: (d: T) => number;
  formatTooltip: (d: T) => string;
  /** Bar fill color (hex). */
  color: string;
  height?: number;
  emptyText: string;
}

const formatDay = (day: string) => new Date(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** Day-bucketed bar chart (cost / completions timelines) with a hover tooltip. */
export default function DailyBarChart<T extends { day: string }>({
  data,
  getValue,
  formatTooltip,
  color,
  height = 112,
  emptyText,
}: DailyBarChartProps<T>) {
  if (data.length === 0) return <div className="text-[10px] text-surface-600 text-center py-4">{emptyText}</div>;
  const chartData = data.map((d) => ({ ...d, __value: getValue(d) }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <XAxis
          dataKey="day"
          tickFormatter={formatDay}
          interval="preserveStartEnd"
          tick={{ fill: '#918678', fontSize: 9 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          content={({ active, payload }) =>
            active && payload?.[0] ? (
              <div className="bg-surface-800 border border-surface-700 rounded-lg px-2.5 py-1.5 text-[10px] text-surface-200 shadow-xl">
                {formatTooltip(payload[0].payload as T)}
              </div>
            ) : null
          }
        />
        <Bar dataKey="__value" fill={color} radius={[3, 3, 0, 0]} minPointSize={2} />
      </BarChart>
    </ResponsiveContainer>
  );
}
