import { useEffect, useMemo, useState } from 'react';
import type { Comparison, Scalar, Supplier } from './api';
import { RiskRadar, ScoreBars } from './charts';
import { compareRows, downloadText, toCsv, type Dataset } from './dataset';
import { fieldLabel, formatValue, levelOf, levelStyle, OPERATIONAL_FIELDS } from './format';
import type { Shortlist } from './shortlist';
import { Card, EmptyState, inputClass, LevelBadge, primaryButton, secondaryButton, Tip, defId, ViewHeader, WarningBox } from './ui';
import { useWorkspace } from './workspace';

/** Shortlist question for the chosen metric; keywords match the data-only mode's supported criteria. */
export function shortlistQuestion(field: string): string {
  if (field === 'Total_Risk_Index') return 'Which of my shortlisted suppliers has the lowest overall risk?';
  if (field === 'Digital_Security_Score') return 'Which of my shortlisted suppliers has the lowest cyber (digital security) risk?';
  return `Which of my shortlisted suppliers has the lowest ${fieldLabel(field).toLowerCase()} risk?`;
}

const numberOrNull = (value: unknown) => (typeof value === 'number' ? value : null);

export default function Compare({ dataset, shortlist, onExplore, onAsk, canAsk }: { dataset: Dataset; shortlist: Shortlist; onExplore: () => void; onAsk: (question: string) => void; canAsk: boolean }) {
  const defaultRank = dataset.riskFields[0] ?? '';
  const [rankBy, setRankBy] = useState(defaultRank);
  useEffect(() => { if (!dataset.riskFields.includes(rankBy)) setRankBy(defaultRank); }, [dataset, rankBy, defaultRank]);
  const key = shortlist.ids.join(',');
  // Computed in the browser from the loaded rows, with the same rules as the backend's /compare.
  const comparison = useMemo(
    () => (shortlist.ids.length && dataset.riskFields.includes(rankBy) ? compareRows(dataset, shortlist.ids, rankBy) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataset, key, rankBy],
  );

  const download = () => {
    const operational = OPERATIONAL_FIELDS.map(item => item.field).filter(field => dataset.columns.includes(field));
    const columns = ['supplierID', ...(dataset.mapping.name ? ['Supplier Name'] : []), ...(dataset.hasTotal ? ['Total_Risk_Index'] : []), ...(dataset.hasLevel ? ['Total_Risk_Index_Level'] : []), ...dataset.scores, ...operational, ...dataset.groupFields];
    downloadText('supplier-shortlist.csv', toCsv([...new Set(columns)], comparison?.suppliers ?? []));
  };

  if (!shortlist.ids.length || !comparison) {
    return (
      <>
        <ViewHeader title="Compare suppliers" purpose="See your shortlist side by side, pick the metric that matters and get a lowest-risk answer with its trade-offs." />
        <EmptyState title="Your shortlist is empty" action={<button className={primaryButton} onClick={onExplore}>Go to Explore</button>}>
          Tick 2–20 suppliers in Explore (or open a supplier profile and click “Add to shortlist”), then come back here.
        </EmptyState>
      </>
    );
  }

  return (
    <div className="space-y-5">
      <ViewHeader
        title="Compare suppliers"
        purpose="See your shortlist side by side, pick the metric that matters and get a lowest-risk answer with its trade-offs."
        actions={<button className={secondaryButton} onClick={download}>Download shortlist (CSV)</button>}
      />
      <label className="flex w-fit flex-col gap-1 text-xs font-medium text-gray-600">
        Rank shortlist by
        <select className={`${inputClass} min-w-64`} value={rankBy} onChange={event => setRankBy(event.target.value)}>
          {dataset.riskFields.map(field => <option key={field} value={field}>{fieldLabel(field)}</option>)}
        </select>
      </label>
      <DecisionView comparison={comparison} onAsk={canAsk ? onAsk : undefined} />
      <RadarSection dataset={dataset} comparison={comparison} />
      <Heatmap comparison={comparison} rankBy={rankBy} onRankBy={setRankBy} onRemove={shortlist.remove} />
    </div>
  );
}

/** Up to three shortlisted suppliers overlaid on the supplied sub-scores, with the dataset median behind them. */
function RadarSection({ dataset, comparison }: { dataset: Dataset; comparison: Comparison }) {
  const ordered = orderByMetric(comparison.suppliers, comparison.rank_by);
  const [picked, setPicked] = useState<string[]>([]);
  const valid = picked.filter(id => ordered.some(row => row.supplierID === id));
  const chosen = (valid.length ? valid : ordered.slice(0, 3).map(row => row.supplierID)).slice(0, 3);
  const [view, setView] = useState<'radar' | 'bars'>('radar');
  const offScale = dataset.offScale.length > 0;
  const showBars = view === 'bars' || offScale;
  const series = chosen.map(id => ({ id, values: ordered.find(row => row.supplierID === id)! as Record<string, unknown> }));
  const toggle = (id: string) => setPicked(current => {
    const base = current.length ? current.filter(item => ordered.some(row => row.supplierID === item)) : chosen;
    return base.includes(id) ? base.filter(item => item !== id) : base.length >= 3 ? base : [...base, id];
  });

  if (!dataset.scores.length) return null;
  return (
    <Card
      title="Risk profile"
      subtitle="Up to three suppliers on the supplied sub-scores. The grey shape is the dataset median, for reference."
      actions={!offScale && (
        <div className="flex rounded-md ring-1 ring-gray-300" role="group" aria-label="Chart type">
          {(['radar', 'bars'] as const).map(option => (
            <button key={option} onClick={() => setView(option)} aria-pressed={view === option} className={`px-3 py-1.5 text-sm first:rounded-l-md last:rounded-r-md ${view === option ? 'bg-accent font-semibold text-gray-900' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
              {option === 'radar' ? 'Radar' : 'Show as bars'}
            </button>
          ))}
        </div>
      )}
    >
      {offScale && (
        <div className="mb-4">
          <WarningBox title="Sub-scores are on different scales">
            {dataset.offScale.map(fieldLabel).join(', ')} contain values outside 0–100, so a shared radar would mislead. Showing bars instead; values are not rescaled.
          </WarningBox>
        </div>
      )}
      {ordered.length > 3 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5 text-sm">
          <span className="mr-1 text-gray-600">Show (max 3):</span>
          {ordered.map(row => {
            const on = chosen.includes(row.supplierID);
            return (
              <button key={row.supplierID} onClick={() => toggle(row.supplierID)} aria-pressed={on} disabled={!on && chosen.length >= 3}
                className={`rounded-full px-2.5 py-0.5 font-mono text-xs ring-1 ring-inset disabled:opacity-40 ${on ? 'bg-accent-soft font-semibold ring-amber-400' : 'bg-white ring-gray-300 hover:bg-gray-50'}`}>
                {on ? '✓ ' : ''}{row.supplierID}
              </button>
            );
          })}
        </div>
      )}
      {showBars
        ? <ScoreBars fields={dataset.scores} series={series} median={dataset.medians} maxValue={offScale ? undefined : 100} />
        : <RiskRadar fields={dataset.scores} series={series} median={dataset.medians} />}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium text-gray-700">Exact values</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-gray-500"><tr><th className="py-1.5 pr-3 font-semibold">Sub-score</th>{chosen.map(id => <th key={id} className="px-2 py-1.5 text-right font-mono font-semibold">{id}</th>)}<th className="px-2 py-1.5 text-right font-semibold">Dataset median</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {dataset.scores.map(field => (
                <tr key={field}>
                  <td className="py-1.5 pr-3">{fieldLabel(field)}</td>
                  {series.map(item => <td key={item.id} className="px-2 py-1.5 text-right font-mono tabular-nums">{formatValue(item.values[field] as Scalar)}</td>)}
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums text-gray-500">{formatValue(dataset.medians[field])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}

function orderByMetric(suppliers: Supplier[], field: string) {
  return [...suppliers].sort((a, b) => {
    const left = numberOrNull(a[field]);
    const right = numberOrNull(b[field]);
    if (left === null && right === null) return a.supplierID.localeCompare(b.supplierID);
    if (left === null) return 1;
    if (right === null) return -1;
    return left - right || a.supplierID.localeCompare(b.supplierID);
  });
}

type TradeOff = { field: string; own: number; best: number; bestIds: string[] };

/** Risk categories where another shortlisted supplier has a clearly lower score than this one. */
function tradeOffs(supplier: Supplier, others: Supplier[], fields: string[]): TradeOff[] {
  return fields
    .filter(field => field !== 'Total_Risk_Index')
    .flatMap(field => {
      const own = numberOrNull(supplier[field]);
      const values = others.map(other => numberOrNull(other[field])).filter((value): value is number => value !== null);
      if (own === null || !values.length) return [];
      const best = Math.min(...values);
      if (own - best < 10) return [];
      return [{ field, own, best, bestIds: others.filter(other => other[field] === best).map(other => other.supplierID) }];
    })
    .sort((a, b) => (b.own - b.best) - (a.own - a.best))
    .slice(0, 3);
}

const pointsHigher = (gap: number) => (gap === 0 ? 'tied' : `${gap} point${gap === 1 ? '' : 's'} higher`);

function DecisionView({ comparison, onAsk }: { comparison: Comparison; onAsk?: (question: string) => void }) {
  const { openSupplier } = useWorkspace();
  const { rank_by: field, suppliers, lowest_risk_supplier_ids: winners } = comparison;
  const ordered = orderByMetric(suppliers, field);
  const winnerRows = ordered.filter(row => winners.includes(row.supplierID));
  const runnerUp = ordered.find(row => !winners.includes(row.supplierID) && numberOrNull(row[field]) !== null);
  const best = winnerRows.length ? numberOrNull(winnerRows[0][field]) : null;
  const unknownCount = suppliers.filter(row => numberOrNull(row[field]) === null).length;
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  const memo = useMemo(() => buildMemo(comparison), [comparison]);
  const copy = async () => {
    setCopyError(false);
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(memo);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError(true);
    }
  };

  return (
    <Card
      title="Decision view"
      subtitle={`${suppliers.length} supplier${suppliers.length === 1 ? '' : 's'} ranked by ${fieldLabel(field)} · lower score = lower risk`}
      actions={
        <div className="flex gap-2">
          <button className={secondaryButton} onClick={copy}>{copied ? 'Copied ✓' : 'Copy summary'}</button>
          {onAsk && <button className={secondaryButton} onClick={() => onAsk(shortlistQuestion(field))} title={shortlistQuestion(field)}>Ask about this ranking →</button>}
        </div>
      }
    >
      {copyError && <div className="mb-4 space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="alert">
        <p>Clipboard access is unavailable. Copy the justification below.</p>
        <textarea className={`${inputClass} w-full`} aria-label="Shortlist justification" readOnly rows={6} value={memo} onFocus={event => event.currentTarget.select()} />
      </div>}
      {winnerRows.length === 0 ? (
        <p className="text-gray-700">{fieldLabel(field)} is <strong>Unknown</strong> for every shortlisted supplier, so no lowest-risk supplier can be named for this metric.</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="rounded-lg bg-emerald-50 p-4 ring-1 ring-emerald-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
              Lowest {fieldLabel(field).toLowerCase()}{winnerRows.length > 1 ? ` · ${winnerRows.length}-way tie` : ''}
            </p>
            <ul className="mt-2 space-y-1.5">
              {winnerRows.map(row => (
                <li key={row.supplierID}>
                  <button onClick={() => openSupplier(row.supplierID)} className="font-mono text-lg font-bold text-gray-900 hover:text-gray-900 hover:underline">{row.supplierID}</button>
                  <span className="ml-2 text-sm text-gray-600">{row['Supplier Name']}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-3xl font-bold tabular-nums text-gray-900">{best}<span className="ml-1 text-base font-medium text-gray-600">/ 100</span></p>
            <p className="mt-1 text-sm text-gray-700">
              {runnerUp
                ? <>Next: <span className="font-mono">{runnerUp.supplierID}</span> at {formatValue(runnerUp[field])} ({pointsHigher(numberOrNull(runnerUp[field])! - best!)})</>
                : winnerRows.length > 1 ? 'All suppliers with known scores are tied.' : suppliers.length > 1 ? 'No other supplier has a known value.' : 'Only one supplier shortlisted.'}
            </p>
            {unknownCount > 0 && <p className="mt-1 text-sm text-gray-600">{unknownCount} supplier{unknownCount === 1 ? '' : 's'} Unknown for this metric (excluded).</p>}
          </div>
          <div className="space-y-4">
            {winnerRows.slice(0, 3).map(row => {
              const offs = tradeOffs(row, suppliers.filter(other => other.supplierID !== row.supplierID), comparison.risk_fields);
              const top = comparison.highest_risk_categories[row.supplierID] ?? [];
              return (
                <div key={row.supplierID}>
                  <p className="text-sm font-semibold text-gray-900">
                    Trade-offs for <span className="font-mono">{row.supplierID}</span>
                    <span className="ml-2 font-normal text-gray-600">Total risk index {formatValue(row.Total_Risk_Index)}</span>{' '}
                    <LevelBadge level={row.Total_Risk_Index_Level || null} />
                  </p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Highest observed categories</p>
                      <ul className="mt-1 space-y-0.5 text-sm">
                        {top.length ? top.map(item => (
                          <li key={item.field} className="flex justify-between gap-2"><span>{fieldLabel(item.field)}</span><span className="font-semibold tabular-nums">{item.value} <span className="font-normal text-gray-500">{levelOf(row, item.field)}</span></span></li>
                        )) : <li className="text-gray-500">Unknown</li>}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Where others in the shortlist score lower</p>
                      <ul className="mt-1 space-y-0.5 text-sm">
                        {offs.length ? offs.map(item => (
                          <li key={item.field} className="flex justify-between gap-2">
                            <span>{fieldLabel(item.field)}</span>
                            <span className="tabular-nums"><strong>{item.own}</strong> vs {item.best} <span className="font-mono text-xs text-gray-500">{item.bestIds.slice(0, 2).join(', ')}{item.bestIds.length > 2 ? '…' : ''}</span></span>
                          </li>
                        )) : <li className="text-gray-500">No category where another supplier is 10+ points lower.</li>}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <ul className="mt-4 space-y-0.5 border-t border-gray-100 pt-3 text-xs text-gray-500">
        {comparison.notes.map(note => <li key={note}>{note}</li>)}
      </ul>
    </Card>
  );
}

function buildMemo(comparison: Comparison): string {
  const { rank_by: field, suppliers, lowest_risk_supplier_ids: winners } = comparison;
  const ordered = orderByMetric(suppliers, field);
  const lines = [
    `Supplier shortlist comparison — ranked by ${field} (0 = no risk, 100 = maximum risk)`,
    `Compared: ${suppliers.map(row => row.supplierID).join(', ')}`,
    winners.length ? `Lowest ${field}: ${winners.join(', ')} (${formatValue(ordered[0][field])})` : `${field} is Unknown for all shortlisted suppliers.`,
    '',
    'Ranking:',
    ...ordered.map((row, index) => `${index + 1}. ${row.supplierID} — ${field}: ${formatValue(row[field])}; Total_Risk_Index: ${formatValue(row.Total_Risk_Index)} (${row.Total_Risk_Index_Level || 'Unknown'}); highest observed: ${(comparison.highest_risk_categories[row.supplierID] ?? []).map(item => `${item.field} ${item.value}`).join(', ') || 'Unknown'}`),
    '',
    ...comparison.notes,
  ];
  return lines.join('\n');
}

function Heatmap({ comparison, rankBy, onRankBy, onRemove }: { comparison: Comparison; rankBy: string; onRankBy: (field: string) => void; onRemove: (id: string) => void }) {
  const { openSupplier, describe } = useWorkspace();
  const ordered = orderByMetric(comparison.suppliers, rankBy);
  const winners = new Set(comparison.lowest_risk_supplier_ids);
  const fields = ['Total_Risk_Index', ...comparison.risk_fields.filter(field => field !== 'Total_Risk_Index')];
  const rowMin = (field: string) => {
    const values = ordered.map(row => numberOrNull(row[field])).filter((value): value is number => value !== null);
    return values.length ? Math.min(...values) : null;
  };
  const operational = OPERATIONAL_FIELDS.filter(item => comparison.suppliers.some(row => item.field in row));
  const stickyHead = 'sticky left-0 z-10 bg-white';

  return (
    <Card
      title="Side-by-side risk heatmap"
      subtitle="Columns ordered by the ranking metric (lowest first). Hover a metric for its definition; click it to rank by it. Click a supplier ID for its full profile."
      actions={<Legend />}
    >
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="border-separate border-spacing-0.5 text-sm">
          <thead>
            <tr>
              <th className={`${stickyHead} min-w-52 text-left align-bottom text-xs font-medium text-gray-500`}>Metric</th>
              {ordered.map((row, index) => (
                <th key={row.supplierID} className={`min-w-[5.5rem] rounded-t-md px-1.5 pb-2 pt-1.5 text-center align-bottom font-normal ${winners.has(row.supplierID) ? 'bg-emerald-50 ring-2 ring-emerald-500' : ''}`}>
                  <div className="text-[11px] text-gray-500">#{index + 1}{winners.has(row.supplierID) && <span className="ml-1 font-semibold text-emerald-700">Lowest</span>}</div>
                  <button onClick={() => openSupplier(row.supplierID)} className="font-mono text-xs font-semibold text-gray-900 hover:text-gray-900 hover:underline" title={`View ${row.supplierID} details`}>{row.supplierID}</button>
                  <div className="mx-auto max-w-24 truncate text-[11px] text-gray-500" title={row['Supplier Name']}>{row['Supplier Name']}</div>
                  <button className="mt-1 text-[11px] text-gray-500 underline hover:text-red-700" onClick={() => onRemove(row.supplierID)} aria-label={`Remove ${row.supplierID}`}>Remove</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fields.map(field => {
              const min = rowMin(field);
              const active = field === rankBy;
              return (
                <tr key={field}>
                  <th className={`${stickyHead} pr-3 text-left font-normal`}>
                    <Tip id={defId(field)} text={describe(field)}>
                      <button
                        onClick={() => onRankBy(field)}
                        className={`w-full rounded px-2 py-1 text-left hover:bg-gray-100 ${active ? 'bg-accent-soft font-semibold text-gray-900 ring-1 ring-amber-400' : 'text-gray-800'} ${field === 'Total_Risk_Index' ? 'font-semibold' : ''}`}
                        aria-pressed={active}
                        aria-describedby={describe(field) ? defId(field) : undefined}
                      >
                        {fieldLabel(field)}{active && <span className="ml-1 text-xs">▲ ranking</span>}
                      </button>
                    </Tip>
                  </th>
                  {ordered.map(row => {
                    const value = numberOrNull(row[field]);
                    const level = levelOf(row, field);
                    const isMin = value !== null && value === min && ordered.length > 1;
                    return (
                      <td
                        key={row.supplierID}
                        className={`rounded px-1.5 py-1 text-center tabular-nums ${levelStyle(value === null ? null : level).cell} ${isMin ? 'outline-2 -outline-offset-2 outline-gray-900' : ''}`}
                        title={`${row.supplierID} · ${field}: ${formatValue(value)}${level ? ` (${level})` : ''}${isMin ? ' · lowest in shortlist' : ''}`}
                      >
                        <span className="font-semibold">{value ?? 'Unknown'}</span>
                        {level && value !== null && <span className="block text-[10px] leading-tight opacity-80">{level}</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr><td colSpan={ordered.length + 1} className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Operational indicators · own direction, not 0–100 risk scores</td></tr>
            {operational.map(({ field, hint }) => (
              <tr key={field}>
                <th className={`${stickyHead} pr-3 text-left font-normal`}>
                  <Tip id={defId(field)} text={describe(field)}><div className="px-2 py-1" tabIndex={describe(field) ? 0 : undefined} aria-describedby={describe(field) ? defId(field) : undefined}><div className="text-gray-800">{field}</div><div className="text-[11px] text-gray-500">{hint}</div></div></Tip>
                </th>
                {ordered.map(row => (
                  <td key={row.supplierID} className="rounded bg-gray-50 px-1.5 py-1 text-center text-xs tabular-nums text-gray-800">
                    {formatValue(row[field], field)}
                  </td>
                ))}
              </tr>
            ))}
            <tr><td colSpan={ordered.length + 1} className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Three highest observed risk categories (not proven causes)</td></tr>
            <tr>
              <th className={`${stickyHead} pr-3 text-left align-top font-normal`}><div className="px-2 py-1 text-gray-800">Top categories</div></th>
              {ordered.map(row => (
                <td key={row.supplierID} className="rounded bg-gray-50 px-1.5 py-1 align-top text-[11px] leading-snug text-gray-800">
                  {(comparison.highest_risk_categories[row.supplierID] ?? []).map(item => (
                    <div key={item.field}>{fieldLabel(item.field)} <strong className="tabular-nums">{item.value}</strong></div>
                  ))}
                  {!(comparison.highest_risk_categories[row.supplierID] ?? []).length && 'Unknown'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]" aria-label="Colour legend: dataset risk level labels">
      {['Low', 'Medium', 'High', 'Critical'].map(level => (
        <span key={level} className={`rounded px-2 py-0.5 font-medium ${levelStyle(level).cell}`}>{level}</span>
      ))}
      <span className={`rounded px-2 py-0.5 ${levelStyle(null).cell}`}>Unknown</span>
      <span className="rounded px-2 py-0.5 text-gray-700 outline-2 -outline-offset-2 outline-gray-900">Lowest in row</span>
    </div>
  );
}
