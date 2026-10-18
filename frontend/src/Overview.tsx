import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import type { Supplier } from './api';
import { MONO, tooltipStyle } from './charts';
import { sortRows, type Dataset } from './dataset';
import { fieldLabel, formatValue, LEVEL_ORDER } from './format';
import { TOTAL_TIP } from './glossary';
import type { Shortlist } from './shortlist';
import { Card, EmptyState, InfoTip, inputClass, LevelBadge, ScoreBar, SectionLabel, ViewHeader } from './ui';
import { levelColor, themeColors } from './theme';
import { useWorkspace } from './workspace';

// Semantic risk colours; each level also gets its own marker shape, and labels are always printed.
const LEVEL_SHAPE: Record<string, 'circle' | 'square' | 'triangle' | 'diamond'> = { Low: 'circle', Medium: 'square', High: 'triangle', Critical: 'diamond' };
const colorFor = (level: string) => levelColor(level);
const SCATTER_LIMIT = 2500;
const tick = () => ({ fontSize: 11, fill: themeColors().softText, fontFamily: MONO });

export default function Overview({ dataset, shortlist }: { dataset: Dataset; shortlist: Shortlist }) {
  const { openSupplier } = useWorkspace();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const activeFilters = Object.entries(filters).filter(([field, value]) => value && dataset.groupFields.includes(field));
  const rows = useMemo(
    () => dataset.rows.filter(row => activeFilters.every(([field, value]) => String(row[field] ?? '') === value)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataset, JSON.stringify(activeFilters)],
  );

  return (
    <>
      <ViewHeader
        title="Overview"
        purpose={`Where the risk sits across ${dataset.kind === 'demo' ? 'the demo dataset' : 'your file'}: risk-level mix, how sub-scores relate, and the highest-risk suppliers.`}
      />
      {dataset.groupFields.length > 0 && (
        <div className="mb-5 flex flex-wrap items-end gap-3">
          {dataset.groupFields.slice(0, 4).map(field => (
            <label key={field} className="flex flex-col gap-1 text-xs font-medium text-gray-600">
              {field}
              <select className={inputClass} value={filters[field] ?? ''} onChange={event => setFilters({ ...filters, [field]: event.target.value })}>
                <option value="">All</option>
                {distinct(dataset.rows, field).map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          ))}
          {activeFilters.length > 0 && <button className="pb-2 text-sm text-gray-600 underline hover:text-gray-900" onClick={() => setFilters({})}>Clear filters</button>}
          <p className="pb-2 text-xs text-gray-500">Filters apply to everything on this page.</p>
        </div>
      )}

      {rows.length === 0 ? <EmptyState title="No suppliers match these filters" action={<button className="text-sm underline" onClick={() => setFilters({})}>Clear filters</button>} /> : (
        <div className="space-y-5">
          <Kpis dataset={dataset} rows={rows} shortlistCount={shortlist.ids.length} />
          <div className="grid gap-5 lg:grid-cols-2">
            <RiskMix dataset={dataset} rows={rows} />
            <ScoreScatter dataset={dataset} rows={rows} shortlist={shortlist} onPick={openSupplier} />
          </div>
          <TopTen dataset={dataset} rows={rows} onPick={openSupplier} />
        </div>
      )}
    </>
  );
}

// Low/Medium/High/Critical and Simple/Moderate/Complex read in their natural order; anything else alphabetically.
const NATURAL_ORDER = [...LEVEL_ORDER, 'Simple', 'Moderate', 'Complex'];
const rank = (value: string) => { const index = NATURAL_ORDER.indexOf(value); return index < 0 ? NATURAL_ORDER.length : index; };

function distinct(rows: Supplier[], field: string): string[] {
  return [...new Set(rows.map(row => row[field]).filter(value => value !== null && value !== '').map(String))]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function Kpis({ dataset, rows, shortlistCount }: { dataset: Dataset; rows: Supplier[]; shortlistCount: number }) {
  const counts = dataset.levels.map(level => [level, rows.filter(row => row.Total_Risk_Index_Level === level).length] as const);
  const count = (field?: string) => (field ? distinct(rows, field).length.toLocaleString() : null);
  const totals = rows.map(row => row.Total_Risk_Index).filter((value): value is number => typeof value === 'number').sort((a, b) => a - b);
  const median = totals.length ? (totals.length % 2 ? totals[(totals.length - 1) / 2] : (totals[totals.length / 2 - 1] + totals[totals.length / 2]) / 2) : null;
  // Country/category tiles when the file has them; otherwise descriptive facts that are always available.
  const tiles: { label: string; value: string | null; note?: string }[] = [
    { label: 'Suppliers', value: rows.length.toLocaleString(), note: dataset.kind === 'demo' ? 'Anonymized demo dataset' : dataset.label },
    dataset.mapping.country
      ? { label: 'Countries', value: count(dataset.mapping.country) }
      : { label: 'Median Total Risk Index', value: median === null ? null : String(median), note: median === null ? 'No Total Risk Index in this file' : 'As supplied · 0 = no risk, 100 = max' },
    dataset.mapping.category
      ? { label: 'Categories', value: count(dataset.mapping.category) }
      : { label: 'Your shortlist', value: `${shortlistCount} / 20`, note: shortlistCount ? 'Ready to compare side by side' : 'Tick suppliers in Explore' },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map(tile => (
        <div key={tile.label} className="rounded border border-gray-200 bg-white px-6 py-5">
          <SectionLabel>{tile.label}</SectionLabel>
          {tile.value !== null && <p className="mt-2 text-[32px] font-bold leading-none tabular-nums text-gray-900">{tile.value}</p>}
          {tile.note && <p className={`text-xs text-gray-500 ${tile.value !== null ? 'mt-2' : 'mt-3'}`}>{tile.note}</p>}
        </div>
      ))}
      <div className="rounded border border-gray-200 bg-white px-6 py-5">
        <SectionLabel>By risk level (as supplied)</SectionLabel>
        {dataset.hasLevel ? (
          <ul className="mt-1.5 space-y-1">
            {counts.map(([level, value]) => (
              <li key={level} className="flex items-center justify-between gap-2 text-sm">
                <LevelBadge level={level} />
                <span className="font-mono tabular-nums">{value.toLocaleString()} <span className="text-gray-500">({rows.length ? Math.round((value / rows.length) * 100) : 0}%)</span></span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-sm text-gray-500">No risk-level column in this file; levels are never derived.</p>}
      </div>
    </div>
  );
}

function RiskMix({ dataset, rows }: { dataset: Dataset; rows: Supplier[] }) {
  const [groupBy, setGroupBy] = useState(dataset.groupFields[0] ?? '');
  const field = dataset.groupFields.includes(groupBy) ? groupBy : dataset.groupFields[0] ?? '';
  const data = useMemo(() => {
    if (!field) return [];
    const groups = distinct(rows, field).map(group => {
      const members = rows.filter(row => String(row[field]) === group);
      return { group, total: members.length, ...Object.fromEntries(dataset.levels.map(level => [level, members.filter(row => row.Total_Risk_Index_Level === level).length])) };
    });
    return groups.sort((a, b) => rank(a.group) - rank(b.group) || b.total - a.total).slice(0, 12);
  }, [rows, field, dataset.levels]);

  const unavailable = !dataset.hasLevel ? 'This file has no risk-level column, so the mix cannot be shown (levels are never derived from scores).'
    : !field ? 'This file has no country, category or other grouping column.' : null;

  return (
    <Card
      title="Risk-level mix"
      subtitle={field ? `Suppliers per ${field}, split by supplied risk level.` : 'Suppliers per group, split by supplied risk level.'}
      actions={dataset.hasLevel && dataset.groupFields.length > 1 && (
        <label className="flex items-center gap-2 text-xs text-gray-600">
          Group by
          <select className={`${inputClass} py-1`} value={field} onChange={event => setGroupBy(event.target.value)}>
            {dataset.groupFields.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
      )}
    >
      {unavailable ? <p className="py-8 text-center text-sm text-gray-600">{unavailable}</p> : (
        <>
          {!dataset.mapping.country && !dataset.mapping.category && <p className="mb-2 text-xs text-gray-500">This dataset has no country or category column, so grouping uses its other descriptive columns.</p>}
          <div style={{ height: 300 }} role="img" aria-label={`Stacked bar chart of risk levels by ${field}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                <CartesianGrid stroke={themeColors().grid} vertical={false} />
                <XAxis dataKey="group" tick={{ fontSize: 12, fill: themeColors().text }} tickLine={false} axisLine={{ stroke: themeColors().grid }} />
                <YAxis tick={tick()} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: themeColors().grid }} contentStyle={tooltipStyle()} />
                <Legend wrapperStyle={{ fontSize: 12 }} formatter={value => <span style={{ color: themeColors().text }}>{value}</span>} />
                {dataset.levels.map((level, index) => <Bar key={level} dataKey={level} stackId="levels" fill={colorFor(level)} isAnimationActive={false} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
}

type Point = { x: number; y: number; id: string; level: string; shortlisted: boolean };

function ScoreScatter({ dataset, rows, shortlist, onPick }: { dataset: Dataset; rows: Supplier[]; shortlist: Shortlist; onPick: (id: string) => void }) {
  const defaults = ['Financial_Health_Score', 'Quality_Risk_Score'].every(field => dataset.scores.includes(field))
    ? ['Financial_Health_Score', 'Quality_Risk_Score'] : [dataset.scores[0] ?? '', dataset.scores[1] ?? dataset.scores[0] ?? ''];
  const [xField, setX] = useState(defaults[0]);
  const [yField, setY] = useState(defaults[1]);
  const x = dataset.scores.includes(xField) ? xField : defaults[0];
  const y = dataset.scores.includes(yField) ? yField : defaults[1];

  const { series, plotted, total } = useMemo(() => {
    const known = rows.filter(row => typeof row[x] === 'number' && typeof row[y] === 'number');
    // Every n-th supplier keeps the chart responsive; shortlisted suppliers are always included.
    const step = Math.max(1, Math.ceil(known.length / SCATTER_LIMIT));
    const sample = known.filter((row, index) => index % step === 0 || shortlist.has(row.supplierID));
    const points: Point[] = sample.map(row => ({ x: row[x] as number, y: row[y] as number, id: row.supplierID, level: row.Total_Risk_Index_Level || 'Unknown', shortlisted: shortlist.has(row.supplierID) }));
    const levels = dataset.hasLevel ? [...dataset.levels, 'Unknown'] : ['All suppliers'];
    return {
      series: levels.map(level => ({ level, points: points.filter(point => !point.shortlisted && (dataset.hasLevel ? point.level === level : true)) })).filter(item => item.points.length),
      shortlisted: points.filter(point => point.shortlisted),
      plotted: points.length,
      total: known.length,
    };
  }, [rows, x, y, shortlist, dataset]);
  const shortlisted = useMemo(() => rows.filter(row => shortlist.has(row.supplierID) && typeof row[x] === 'number' && typeof row[y] === 'number')
    .map(row => ({ x: row[x] as number, y: row[y] as number, id: row.supplierID, level: row.Total_Risk_Index_Level || 'Unknown', shortlisted: true })), [rows, shortlist, x, y]);

  if (dataset.scores.length < 2) {
    return <Card title="Sub-score scatter"><p className="py-8 text-center text-sm text-gray-600">Map at least two sub-score columns to compare them here.</p></Card>;
  }
  const click = (point: unknown) => { const id = (point as { payload?: Point })?.payload?.id; if (id) onPick(id); };

  return (
    <Card title="Sub-score scatter" subtitle="Each dot is a supplier. Click one to open its profile.">
      <div className="mb-2 flex flex-wrap gap-3">
        {[['X axis', x, setX], ['Y axis', y, setY]].map(([label, value, set]) => (
          <label key={label as string} className="flex items-center gap-2 text-xs text-gray-600">
            {label as string}
            <select className={`${inputClass} py-1`} value={value as string} onChange={event => (set as (value: string) => void)(event.target.value)}>
              {dataset.scores.map(field => <option key={field} value={field}>{fieldLabel(field)}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div style={{ height: 300 }} role="img" aria-label={`Scatter plot of ${fieldLabel(x)} against ${fieldLabel(y)}`}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 12, bottom: 20, left: 0 }}>
            <CartesianGrid stroke={themeColors().grid} />
            <XAxis type="number" dataKey="x" name={fieldLabel(x)} domain={dataset.offScale.includes(x) ? ['auto', 'auto'] : [0, 100]} tick={tick()} label={{ value: fieldLabel(x), position: 'insideBottom', offset: -12, fontSize: 12, fill: themeColors().text }} />
            <YAxis type="number" dataKey="y" name={fieldLabel(y)} domain={dataset.offScale.includes(y) ? ['auto', 'auto'] : [0, 100]} tick={tick()} label={{ value: fieldLabel(y), angle: -90, position: 'insideLeft', offset: 12, fontSize: 12, fill: themeColors().text }} />
            <ZAxis range={[18, 18]} />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              contentStyle={tooltipStyle()}
              content={({ payload }) => {
                const point = payload?.[0]?.payload as Point | undefined;
                if (!point) return null;
                return (
                  <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs">
                    <p className="font-mono font-semibold">{point.id}</p>
                    <p>{fieldLabel(x)}: <span className="font-mono">{point.x}</span></p>
                    <p>{fieldLabel(y)}: <span className="font-mono">{point.y}</span></p>
                    {dataset.hasLevel && <p>Risk level: {point.level}</p>}
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} formatter={value => <span style={{ color: themeColors().text }}>{value}</span>} />
            {series.map((item, index) => (
              <Scatter key={item.level} name={item.level} data={item.points} fill={dataset.hasLevel ? colorFor(item.level) : themeColors().neutral} fillOpacity={0.55}
                shape={LEVEL_SHAPE[item.level] ?? 'circle'} onClick={click} cursor="pointer" isAnimationActive={false} />
            ))}
            {shortlisted.length > 0 && (
              <Scatter name="Your shortlist (★)" data={shortlisted} fill={themeColors().primary} stroke={themeColors().text} strokeWidth={1.5} shape="star" legendType="star" onClick={click} cursor="pointer" isAnimationActive={false} />
            )}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        {plotted < total ? <>Showing every {Math.ceil(total / SCATTER_LIMIT)}th supplier (<span className="font-mono">{plotted.toLocaleString()}</span> of <span className="font-mono">{total.toLocaleString()}</span>) to keep the chart fast; your shortlist is always shown. </> : null}
        Many suppliers share the same scores, so dots can overlap.
      </p>
    </Card>
  );
}

function TopTen({ dataset, rows, onPick }: { dataset: Dataset; rows: Supplier[]; onPick: (id: string) => void }) {
  if (!dataset.hasTotal) {
    return <Card title="Top 10 by Total Risk Index"><p className="py-4 text-sm text-gray-600">This file has no Total Risk Index column, so no ranking by total is shown. It is never calculated from sub-scores.</p></Card>;
  }
  const top = sortRows(rows, 'Total_Risk_Index', true).slice(0, 10);
  return (
    <Card title={<>Top 10 by Total Risk Index (as supplied)<InfoTip id="top10-total-tip" text={TOTAL_TIP} /></>} subtitle="The ten highest totals in the current filter. Ties are ordered by supplier ID.">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-gray-500">
            <tr><th className="py-1.5 pr-2 font-semibold">#</th><th className="px-2 py-1.5 font-semibold">Supplier</th><th className="px-2 py-1.5 font-semibold">Total Risk Index</th>{dataset.hasLevel && <th className="px-2 py-1.5 font-semibold">Risk level</th>}<th className="px-2 py-1.5 font-semibold">Highest sub-score</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {top.map((row, index) => {
              const highest = [...dataset.scores].filter(field => typeof row[field] === 'number').sort((a, b) => (row[b] as number) - (row[a] as number))[0];
              return (
                <tr key={row.supplierID}>
                  <td className="py-1.5 pr-2 font-mono text-gray-500">{index + 1}</td>
                  <td className="px-2 py-1.5"><button className="font-mono text-xs font-semibold hover:underline" onClick={() => onPick(row.supplierID)}>{row.supplierID}</button> <span className="text-gray-600">{row['Supplier Name']}</span></td>
                  <td className="px-2 py-1.5"><ScoreBar value={row.Total_Risk_Index} /></td>
                  {dataset.hasLevel && <td className="px-2 py-1.5"><LevelBadge level={row.Total_Risk_Index_Level || null} /></td>}
                  <td className="px-2 py-1.5 text-gray-700">{highest ? <>{fieldLabel(highest)} <span className="font-mono font-semibold">{formatValue(row[highest])}</span></> : 'Unknown'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
