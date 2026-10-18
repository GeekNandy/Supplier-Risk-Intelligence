import { useEffect, useMemo, useState } from 'react';
import { api, type Comparison, type Metadata, type Supplier } from './api';
import { fieldLabel, formatValue, levelOf, levelStyle, OPERATIONAL_FIELDS } from './format';
import type { Shortlist } from './shortlist';
import { Card, ErrorBox, inputClass, LevelBadge, primaryButton, secondaryButton, Spinner, Tip, defId } from './ui';
import { useWorkspace } from './workspace';

/** Shortlist question for the chosen metric; keywords match the data-only mode's supported criteria. */
export function shortlistQuestion(field: string): string {
  if (field === 'Total_Risk_Index') return 'Which of my shortlisted suppliers has the lowest overall risk?';
  if (field === 'Digital_Security_Score') return 'Which of my shortlisted suppliers has the lowest cyber (digital security) risk?';
  return `Which of my shortlisted suppliers has the lowest ${fieldLabel(field).toLowerCase()} risk?`;
}

const numberOrNull = (value: unknown) => (typeof value === 'number' ? value : null);

export default function Compare({ meta, shortlist, onExplore, onAsk }: { meta: Metadata; shortlist: Shortlist; onExplore: () => void; onAsk: (question: string) => void }) {
  const [rankBy, setRankBy] = useState('Total_Risk_Index');
  const [comparison, setComparison] = useState<Comparison>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>();
  const [attempt, setAttempt] = useState(0);
  const key = shortlist.ids.join(',');
  const currentComparison = comparison?.rank_by === rankBy
    && comparison.suppliers.length === shortlist.ids.length
    && comparison.suppliers.every(supplier => shortlist.ids.includes(supplier.supplierID));

  useEffect(() => {
    if (!shortlist.ids.length) { setComparison(undefined); setError(undefined); setLoading(false); return; }
    let active = true;
    setComparison(undefined);
    setLoading(true);
    setError(undefined);
    api.compare(shortlist.ids, rankBy)
      .then(result => { if (active) setComparison(result); })
      .catch(reason => { if (active) setError(reason); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, rankBy, attempt]);

  if (!shortlist.ids.length) {
    return (
      <Card title="Compare shortlist">
        <div className="py-10 text-center">
          <p className="text-slate-700">Your shortlist is empty. Select 2–20 suppliers in the explorer to compare them side by side.</p>
          <button className={`${primaryButton} mt-4`} onClick={onExplore}>Go to supplier explorer</button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Rank shortlist by
          <select className={`${inputClass} min-w-64`} value={rankBy} onChange={event => setRankBy(event.target.value)}>
            {meta.risk_fields.map(field => <option key={field} value={field}>{fieldLabel(field)}</option>)}
          </select>
        </label>
        {loading && <Spinner label="Comparing…" />}
      </div>
      {error ? <ErrorBox error={error} onRetry={() => setAttempt(value => value + 1)} /> : null}
      {comparison && currentComparison && !loading && !error && (
        <>
          <DecisionView comparison={comparison} onAsk={onAsk} />
          <Heatmap comparison={comparison} rankBy={rankBy} onRankBy={setRankBy} onRemove={shortlist.remove} />
        </>
      )}
    </div>
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

function DecisionView({ comparison, onAsk }: { comparison: Comparison; onAsk: (question: string) => void }) {
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
          <button className={secondaryButton} onClick={copy}>{copied ? 'Copied ✓' : 'Copy justification'}</button>
          <button className={secondaryButton} onClick={() => onAsk(shortlistQuestion(field))} title={shortlistQuestion(field)}>Ask about this ranking →</button>
        </div>
      }
    >
      {copyError && <div className="mb-4 space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="alert">
        <p>Clipboard access is unavailable. Copy the justification below.</p>
        <textarea className={`${inputClass} w-full`} aria-label="Shortlist justification" readOnly rows={6} value={memo} onFocus={event => event.currentTarget.select()} />
      </div>}
      {winnerRows.length === 0 ? (
        <p className="text-slate-700">{fieldLabel(field)} is <strong>Unknown</strong> for every shortlisted supplier, so no lowest-risk supplier can be named for this metric.</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="rounded-lg bg-emerald-50 p-4 ring-1 ring-emerald-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
              Lowest {fieldLabel(field).toLowerCase()}{winnerRows.length > 1 ? ` · ${winnerRows.length}-way tie` : ''}
            </p>
            <ul className="mt-2 space-y-1.5">
              {winnerRows.map(row => (
                <li key={row.supplierID}>
                  <button onClick={() => openSupplier(row.supplierID)} className="font-mono text-lg font-bold text-slate-900 hover:text-blue-700 hover:underline">{row.supplierID}</button>
                  <span className="ml-2 text-sm text-slate-600">{row['Supplier Name']}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{best}<span className="ml-1 text-base font-medium text-slate-600">/ 100</span></p>
            <p className="mt-1 text-sm text-slate-700">
              {runnerUp
                ? <>Next: <span className="font-mono">{runnerUp.supplierID}</span> at {formatValue(runnerUp[field])} ({pointsHigher(numberOrNull(runnerUp[field])! - best!)})</>
                : winnerRows.length > 1 ? 'All suppliers with known scores are tied.' : suppliers.length > 1 ? 'No other supplier has a known value.' : 'Only one supplier shortlisted.'}
            </p>
            {unknownCount > 0 && <p className="mt-1 text-sm text-slate-600">{unknownCount} supplier{unknownCount === 1 ? '' : 's'} Unknown for this metric (excluded).</p>}
          </div>
          <div className="space-y-4">
            {winnerRows.slice(0, 3).map(row => {
              const offs = tradeOffs(row, suppliers.filter(other => other.supplierID !== row.supplierID), comparison.risk_fields);
              const top = comparison.highest_risk_categories[row.supplierID] ?? [];
              return (
                <div key={row.supplierID}>
                  <p className="text-sm font-semibold text-slate-900">
                    Trade-offs for <span className="font-mono">{row.supplierID}</span>
                    <span className="ml-2 font-normal text-slate-600">Total risk index {formatValue(row.Total_Risk_Index)}</span>{' '}
                    <LevelBadge level={row.Total_Risk_Index_Level || null} />
                  </p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Highest observed categories</p>
                      <ul className="mt-1 space-y-0.5 text-sm">
                        {top.length ? top.map(item => (
                          <li key={item.field} className="flex justify-between gap-2"><span>{fieldLabel(item.field)}</span><span className="font-semibold tabular-nums">{item.value} <span className="font-normal text-slate-500">{levelOf(row, item.field)}</span></span></li>
                        )) : <li className="text-slate-500">Unknown</li>}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Where others in the shortlist score lower</p>
                      <ul className="mt-1 space-y-0.5 text-sm">
                        {offs.length ? offs.map(item => (
                          <li key={item.field} className="flex justify-between gap-2">
                            <span>{fieldLabel(item.field)}</span>
                            <span className="tabular-nums"><strong>{item.own}</strong> vs {item.best} <span className="font-mono text-xs text-slate-500">{item.bestIds.slice(0, 2).join(', ')}{item.bestIds.length > 2 ? '…' : ''}</span></span>
                          </li>
                        )) : <li className="text-slate-500">No category where another supplier is 10+ points lower.</li>}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <ul className="mt-4 space-y-0.5 border-t border-slate-100 pt-3 text-xs text-slate-500">
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
              <th className={`${stickyHead} min-w-52 text-left align-bottom text-xs font-medium text-slate-500`}>Metric</th>
              {ordered.map((row, index) => (
                <th key={row.supplierID} className={`min-w-[5.5rem] rounded-t-md px-1.5 pb-2 pt-1.5 text-center align-bottom font-normal ${winners.has(row.supplierID) ? 'bg-emerald-50 ring-2 ring-emerald-500' : ''}`}>
                  <div className="text-[11px] text-slate-500">#{index + 1}{winners.has(row.supplierID) && <span className="ml-1 font-semibold text-emerald-700">Lowest</span>}</div>
                  <button onClick={() => openSupplier(row.supplierID)} className="font-mono text-xs font-semibold text-slate-900 hover:text-blue-700 hover:underline" title={`View ${row.supplierID} details`}>{row.supplierID}</button>
                  <div className="mx-auto max-w-24 truncate text-[11px] text-slate-500" title={row['Supplier Name']}>{row['Supplier Name']}</div>
                  <button className="mt-1 text-[11px] text-slate-500 underline hover:text-red-700" onClick={() => onRemove(row.supplierID)} aria-label={`Remove ${row.supplierID}`}>Remove</button>
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
                        className={`w-full rounded px-2 py-1 text-left hover:bg-slate-100 ${active ? 'bg-blue-50 font-semibold text-blue-800 ring-1 ring-blue-300' : 'text-slate-800'} ${field === 'Total_Risk_Index' ? 'font-semibold' : ''}`}
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
                        className={`rounded px-1.5 py-1 text-center tabular-nums ${levelStyle(value === null ? null : level).cell} ${isMin ? 'outline-2 -outline-offset-2 outline-slate-900' : ''}`}
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
            <tr><td colSpan={ordered.length + 1} className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Operational indicators · own direction, not 0–100 risk scores</td></tr>
            {operational.map(({ field, hint }) => (
              <tr key={field}>
                <th className={`${stickyHead} pr-3 text-left font-normal`}>
                  <Tip id={defId(field)} text={describe(field)}><div className="px-2 py-1" tabIndex={describe(field) ? 0 : undefined} aria-describedby={describe(field) ? defId(field) : undefined}><div className="text-slate-800">{field}</div><div className="text-[11px] text-slate-500">{hint}</div></div></Tip>
                </th>
                {ordered.map(row => (
                  <td key={row.supplierID} className="rounded bg-slate-50 px-1.5 py-1 text-center text-xs tabular-nums text-slate-800">
                    {formatValue(row[field], field)}
                  </td>
                ))}
              </tr>
            ))}
            <tr><td colSpan={ordered.length + 1} className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Three highest observed risk categories (not proven causes)</td></tr>
            <tr>
              <th className={`${stickyHead} pr-3 text-left align-top font-normal`}><div className="px-2 py-1 text-slate-800">Top categories</div></th>
              {ordered.map(row => (
                <td key={row.supplierID} className="rounded bg-slate-50 px-1.5 py-1 align-top text-[11px] leading-snug text-slate-800">
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
      <span className="rounded px-2 py-0.5 text-slate-700 outline-2 -outline-offset-2 outline-slate-900">Lowest in row</span>
    </div>
  );
}
