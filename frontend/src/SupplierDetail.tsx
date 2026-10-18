import { useEffect, useMemo, useRef, useState } from 'react';
import { RiskRadar, ScoreBars } from './charts';
import { compareRows, type Dataset } from './dataset';
import { fieldLabel, formatValue, levelOf, OPERATIONAL_FIELDS } from './format';
import { TOTAL_TIP } from './glossary';
import type { Shortlist } from './shortlist';
import { Btn, InfoTip, LevelBadge, Pill, ScoreBar, secondaryButton, SectionLabel } from './ui';
import { useWorkspace } from './workspace';

/** Side panel ("model card") with one supplier's full supplied profile, read from the loaded dataset. */
export default function SupplierDetail({ id, dataset, shortlist, onClose }: { id: string; dataset: Dataset; shortlist: Shortlist; onClose: () => void }) {
  const { describe } = useWorkspace();
  const closeButton = useRef<HTMLButtonElement>(null);
  const [view, setView] = useState<'radar' | 'bars'>('radar');
  const result = useMemo(() => compareRows(dataset, [id], dataset.riskFields[0] ?? ''), [dataset, id]);
  const supplier = result.suppliers[0];

  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const top = result.highest_risk_categories[id] ?? [];
  const categories = [...dataset.scores].sort((a, b) => {
    const left = supplier?.[a];
    const right = supplier?.[b];
    if (typeof left !== 'number') return 1;
    if (typeof right !== 'number') return -1;
    return right - left;
  });
  const selected = shortlist.has(id);
  const offScale = dataset.offScale.length > 0;
  const tags = [dataset.mapping.country, dataset.mapping.category, ...dataset.groupFields.filter(field => field !== dataset.mapping.country && field !== dataset.mapping.category)]
    .filter((field): field is string => !!field && supplier?.[field] != null);

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="supplier-detail-title">
      <button className="absolute inset-0 bg-[var(--theme-color-backdrop)]" onClick={onClose} aria-label="Close supplier profile" tabIndex={-1} />
      <aside className="relative flex h-full w-full max-w-xl flex-col border-l border-gray-200 bg-white">
        <header className="flex items-start justify-between gap-3 border-b border-gray-200 bg-gradient-to-b from-gray-50 to-white px-5 py-4">
          <div className="min-w-0">
            <SectionLabel>Anonymized supplier · {dataset.label}</SectionLabel>
            <h2 id="supplier-detail-title" className="mt-0.5 font-mono text-xl font-semibold text-gray-900">{id}</h2>
            {supplier?.['Supplier Name'] && <p className="text-sm text-gray-600">{supplier['Supplier Name']}</p>}
            {supplier && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {dataset.hasLevel && <LevelBadge level={supplier.Total_Risk_Index_Level || null} />}
                {tags.map(field => <Pill key={field}>{field}: {formatValue(supplier[field])}</Pill>)}
              </div>
            )}
          </div>
          <button ref={closeButton} onClick={onClose} className={secondaryButton} aria-label="Close">✕</button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {!supplier && <p className="text-sm text-gray-600">This supplier is not in the loaded dataset. It may belong to a different file.</p>}
          {supplier && (
            <>
              <div className="flex flex-wrap items-end justify-between gap-4">
                {dataset.hasTotal ? (
                  <div>
                    <SectionLabel>Total Risk Index (as supplied)<InfoTip id="detail-total-tip" text={TOTAL_TIP} /></SectionLabel>
                    <p className="mt-1 flex items-baseline gap-1.5">
                      <span className="font-mono text-4xl font-semibold tabular-nums text-gray-900">{formatValue(supplier.Total_Risk_Index)}</span>
                      <span className="font-mono text-gray-500">/ 100</span>
                    </p>
                  </div>
                ) : <p className="text-sm text-gray-600">This file has no Total Risk Index column, so none is shown (it is never calculated).</p>}
                <Btn
                  variant={selected ? 'secondary' : 'primary'}
                  disabled={!selected && shortlist.full}
                  onClick={() => (selected ? shortlist.remove(id) : shortlist.addMany([supplier]))}
                >
                  {selected ? 'Remove from shortlist' : shortlist.full ? 'Shortlist full (20)' : 'Add to shortlist'}
                </Btn>
              </div>

              {top.length > 0 && (
                <section>
                  <SectionLabel>Highest observed sub-scores</SectionLabel>
                  <ul className="mt-2 grid gap-2 sm:grid-cols-3">
                    {top.map(item => (
                      <li key={item.field} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                        <p className="text-xs text-gray-600">{fieldLabel(item.field)}</p>
                        <p className="font-mono font-semibold tabular-nums">{item.value} <span className="font-sans text-xs font-normal text-gray-500">{levelOf(supplier, item.field)}</span></p>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-gray-500">These are the highest scores, not proven causes of the total; the weights behind the total are not supplied.</p>
                </section>
              )}

              {dataset.scores.length >= 3 && (
                <section>
                  <div className="flex items-center justify-between gap-2">
                    <SectionLabel>Profile vs dataset median</SectionLabel>
                    {!offScale && (
                      <button className="text-xs text-gray-600 underline hover:text-gray-900" onClick={() => setView(view === 'radar' ? 'bars' : 'radar')}>
                        {view === 'radar' ? 'Show as bars' : 'Show as radar'}
                      </button>
                    )}
                  </div>
                  <div className="mt-2">
                    {view === 'bars' || offScale
                      ? <ScoreBars fields={dataset.scores} series={[{ id, values: supplier }]} median={dataset.medians} maxValue={offScale ? undefined : 100} />
                      : <RiskRadar fields={dataset.scores} series={[{ id, values: supplier }]} median={dataset.medians} height={300} />}
                  </div>
                </section>
              )}

              <section>
                <SectionLabel>All sub-scores · highest first · 0 = no risk, 100 = maximum risk</SectionLabel>
                <ul className="mt-2 divide-y divide-gray-100">
                  {categories.map(field => {
                    const value = supplier[field];
                    return (
                      <li key={field} className="flex items-start justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm text-gray-900">{fieldLabel(field)}</p>
                          {describe(field) && <p className="text-xs text-gray-500">{describe(field)}</p>}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <ScoreBar value={typeof value === 'number' ? value : null} />
                          {levelOf(supplier, field) && <span className="w-16 text-right"><LevelBadge level={typeof value === 'number' ? levelOf(supplier, field) : null} /></span>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>

              {OPERATIONAL_FIELDS.some(item => item.field in supplier) && (
                <section>
                  <SectionLabel>Operational indicators</SectionLabel>
                  <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                    {OPERATIONAL_FIELDS.filter(item => item.field in supplier).map(({ field, hint }) => (
                      <div key={field} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2" title={describe(field)}>
                        <dt className="text-xs text-gray-600">{field}</dt>
                        <dd className="font-mono font-semibold tabular-nums text-gray-900">{formatValue(supplier[field], field)}</dd>
                        <dd className="text-[11px] text-gray-500">{hint}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
