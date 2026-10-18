import { useEffect, useRef, useState } from 'react';
import { api, type Comparison, type Metadata } from './api';
import { fieldLabel, formatValue, levelOf, OPERATIONAL_FIELDS } from './format';
import type { Shortlist } from './shortlist';
import { ErrorBox, LevelBadge, primaryButton, ScoreBar, secondaryButton, Spinner } from './ui';
import { useWorkspace } from './workspace';

/** Side panel with one supplier's full supplied profile. Uses /compare for the server's top categories. */
export default function SupplierDetail({ id, meta, shortlist, onClose }: { id: string; meta: Metadata; shortlist: Shortlist; onClose: () => void }) {
  const { describe } = useWorkspace();
  const [result, setResult] = useState<Comparison>();
  const [error, setError] = useState<unknown>();
  const [attempt, setAttempt] = useState(0);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    setResult(undefined);
    setError(undefined);
    api.compare([id])
      .then(value => { if (active) setResult(value); })
      .catch(reason => { if (active) setError(reason); });
    return () => { active = false; };
  }, [id, attempt]);

  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const supplier = result?.suppliers[0];
  const top = result?.highest_risk_categories[id] ?? [];
  const categories = meta.risk_fields
    .filter(field => field !== 'Total_Risk_Index')
    .sort((a, b) => {
      const left = supplier?.[a];
      const right = supplier?.[b];
      if (typeof left !== 'number') return 1;
      if (typeof right !== 'number') return -1;
      return right - left;
    });
  const selected = shortlist.has(id);

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="supplier-detail-title">
      <button className="absolute inset-0 bg-slate-900/30" onClick={onClose} aria-label="Close supplier details" tabIndex={-1} />
      <aside className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Anonymized supplier</p>
            <h2 id="supplier-detail-title" className="font-mono text-lg font-bold text-slate-900">{id}</h2>
            {supplier && <p className="text-sm text-slate-600">{supplier['Supplier Name']}</p>}
          </div>
          <button ref={closeButton} onClick={onClose} className={secondaryButton} aria-label="Close">✕</button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {error ? <ErrorBox error={error} onRetry={() => setAttempt(value => value + 1)} /> : null}
          {!supplier && !error && <Spinner label="Loading supplier profile…" />}
          {supplier && (
            <>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total risk index</p>
                  <p className="mt-1 flex items-center gap-2">
                    <span className="text-4xl font-bold tabular-nums text-slate-900">{formatValue(supplier.Total_Risk_Index)}</span>
                    <span className="text-slate-500">/ 100</span>
                    <LevelBadge level={supplier.Total_Risk_Index_Level || null} />
                  </p>
                </div>
                <button
                  className={selected ? secondaryButton : primaryButton}
                  disabled={!selected && shortlist.full}
                  onClick={() => (selected ? shortlist.remove(id) : shortlist.addMany([supplier]))}
                >
                  {selected ? 'Remove from shortlist' : shortlist.full ? 'Shortlist full (20)' : 'Add to shortlist'}
                </button>
              </div>

              <section>
                <h3 className="text-sm font-semibold text-slate-900">Highest observed risk categories</h3>
                <ul className="mt-2 grid gap-2 sm:grid-cols-3">
                  {top.map(item => (
                    <li key={item.field} className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                      <p className="text-xs text-slate-600">{fieldLabel(item.field)}</p>
                      <p className="font-semibold tabular-nums">{item.value} <span className="text-xs font-normal text-slate-500">{levelOf(supplier, item.field)}</span></p>
                    </li>
                  ))}
                  {!top.length && <li className="text-sm text-slate-500">Unknown</li>}
                </ul>
                <p className="mt-2 text-xs text-slate-500">{meta.total_risk_note} These are the highest scores, not proven causes of the total.</p>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-slate-900">All risk scores <span className="font-normal text-slate-500">· highest first · 0 = no risk, 100 = maximum risk</span></h3>
                <ul className="mt-2 divide-y divide-slate-100">
                  {categories.map(field => {
                    const value = supplier[field];
                    return (
                      <li key={field} className="flex items-start justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm text-slate-900">{fieldLabel(field)}</p>
                          {describe(field) && <p className="text-xs text-slate-500">{describe(field)}</p>}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <ScoreBar value={typeof value === 'number' ? value : null} />
                          <span className="w-16 text-right"><LevelBadge level={typeof value === 'number' ? levelOf(supplier, field) : null} /></span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-slate-900">Operational indicators</h3>
                <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                  {OPERATIONAL_FIELDS.filter(item => item.field in supplier).map(({ field, hint }) => (
                    <div key={field} className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200" title={describe(field)}>
                      <dt className="text-xs text-slate-600">{field}</dt>
                      <dd className="font-semibold tabular-nums text-slate-900">{formatValue(supplier[field], field)}</dd>
                      <dd className="text-[11px] text-slate-500">{hint}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
