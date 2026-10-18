import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts';
import { fieldLabel, formatValue } from './format';

export type Series = { id: string; values: Record<string, unknown> };

// Gray-900, accent and gray-500; each also has its own dash pattern so colour is never the only signal.
export const SERIES_STYLE = [
  { color: '#111827', dash: undefined, label: 'solid' },
  { color: '#e0a800', dash: '6 3', label: 'dashed' },
  { color: '#6b7280', dash: '2 3', label: 'dotted' },
];
export const MONO = '"IBM Plex Mono", ui-monospace, monospace';

const num = (value: unknown) => (typeof value === 'number' ? value : null);

/** Radar on the supplied 0–100 scale. Axes where a plotted supplier is Unknown are left out, never drawn as 0. */
export function RiskRadar({ fields, series, median, height = 360 }: { fields: string[]; series: Series[]; median?: Record<string, number | null>; height?: number }) {
  const axes = fields.filter(field => series.every(item => num(item.values[field]) !== null));
  const omitted = fields.filter(field => !axes.includes(field));
  const data = axes.map(field => ({
    axis: fieldLabel(field),
    field,
    ...(median ? { median: median[field] } : {}),
    ...Object.fromEntries(series.map(item => [item.id, num(item.values[field])])),
  }));

  if (axes.length < 3) {
    return <p className="rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-600">A radar needs at least three sub-scores with known values. Use the bar view instead.</p>;
  }
  return (
    <div>
      <div style={{ height }} role="img" aria-label={`Radar chart of ${series.map(item => item.id).join(', ')} across ${axes.length} sub-scores, 0 to 100 as supplied`}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="72%">
            <PolarGrid stroke="#e5e7eb" />
            <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: '#4b5563' }} />
            <PolarRadiusAxis domain={[0, 100]} tickCount={5} angle={90} tick={{ fontSize: 10, fill: '#9ca3af', fontFamily: MONO }} axisLine={false} />
            {median && <Radar name="Dataset median" dataKey="median" stroke="#d1d5db" fill="#9ca3af" fillOpacity={0.12} isAnimationActive={false} />}
            {series.map((item, index) => (
              <Radar
                key={item.id}
                name={item.id}
                dataKey={item.id}
                stroke={SERIES_STYLE[index % 3].color}
                strokeWidth={2}
                strokeDasharray={SERIES_STYLE[index % 3].dash}
                fill={SERIES_STYLE[index % 3].color}
                fillOpacity={0.2}
                isAnimationActive={false}
              />
            ))}
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#e5e7eb' }}
              formatter={(value: unknown, name: unknown) => [formatValue(num(value)), String(name)]}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
        {series.map((item, index) => (
          <span key={item.id} className="inline-flex items-center gap-1.5">
            <svg width="22" height="8" aria-hidden><line x1="0" y1="4" x2="22" y2="4" stroke={SERIES_STYLE[index % 3].color} strokeWidth="2.5" strokeDasharray={SERIES_STYLE[index % 3].dash} /></svg>
            <span className="font-mono">{item.id}</span>
          </span>
        ))}
        {median && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-gray-300" aria-hidden />Dataset median (descriptive)</span>}
        <span className="text-gray-500">Axes 0–100, as supplied · lower = less risk</span>
      </div>
      {omitted.length > 0 && <p className="mt-1 text-xs text-gray-500">Not plotted because a value is Unknown: {omitted.map(fieldLabel).join(', ')}.</p>}
    </div>
  );
}

/** Same data as horizontal bars: one group per sub-score. Works on any scale. */
export function ScoreBars({ fields, series, median, maxValue }: { fields: string[]; series: Series[]; median?: Record<string, number | null>; maxValue?: number }) {
  const max = maxValue ?? Math.max(1, ...fields.flatMap(field => series.map(item => num(item.values[field]) ?? 0)), ...fields.map(field => median?.[field] ?? 0));
  return (
    <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {fields.map(field => (
        <div key={field}>
          <p className="text-xs font-medium text-gray-700">{fieldLabel(field)}{median?.[field] !== undefined && median[field] !== null && <span className="ml-1 font-mono font-normal text-gray-500">· median {formatValue(median[field])}</span>}</p>
          <div className="mt-1 space-y-1">
            {series.map((item, index) => {
              const value = num(item.values[field]);
              return (
                <div key={item.id} className="flex items-center gap-2 text-xs">
                  <span className="w-24 shrink-0 truncate font-mono text-gray-600">{item.id}</span>
                  <span className="relative h-2.5 flex-1 rounded-full bg-gray-100">
                    {value !== null && <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`, background: SERIES_STYLE[index % 3].color }} />}
                    {median?.[field] != null && <span className="absolute inset-y-[-2px] w-0.5 bg-gray-400" style={{ left: `${Math.min(100, ((median[field] as number) / max) * 100)}%` }} aria-hidden />}
                  </span>
                  <span className="w-14 shrink-0 text-right font-mono font-semibold tabular-nums">{formatValue(value)}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
