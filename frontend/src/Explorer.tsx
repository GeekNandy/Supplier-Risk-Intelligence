import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Supplier } from './api';
import { sortRows, type Dataset } from './dataset';
import { fieldLabel, formatValue, levelOf, OPERATIONAL_FIELDS } from './format';
import { TOTAL_TIP } from './glossary';
import type { Shortlist } from './shortlist';
import { Card, EmptyState, InfoTip, inputClass, LevelBadge, ScoreBar, secondaryButton, ViewHeader } from './ui';
import { useWorkspace } from './workspace';

const PAGE_SIZE = 25;

export default function Explorer({ dataset, shortlist }: { dataset: Dataset; shortlist: Shortlist }) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const [riskLevel, setRiskLevel] = useState('');
  const defaultSort = dataset.hasTotal ? 'Total_Risk_Index' : dataset.scores[0] ?? '';
  const [sortBy, setSortBy] = useState(defaultSort);
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [offset, setOffset] = useState(0);
  const top = useRef<HTMLDivElement>(null);

  // A different dataset resets the view.
  useEffect(() => { setQuery(''); setRiskLevel(''); setSortBy(defaultSort); setOffset(0); }, [dataset.key, defaultSort]);
  useEffect(() => setOffset(0), [deferredQuery, riskLevel, sortBy, order]);

  const operational = OPERATIONAL_FIELDS.map(item => item.field).filter(field => dataset.rows.some(row => typeof row[field] === 'number'));
  const filtered = useMemo(() => {
    const rows = dataset.rows.filter(row =>
      (!deferredQuery || row.supplierID.toLowerCase().includes(deferredQuery) || String(row['Supplier Name'] ?? '').toLowerCase().includes(deferredQuery))
      && (!riskLevel || row.Total_Risk_Index_Level === riskLevel));
    return sortBy ? sortRows(rows, sortBy, order === 'desc') : rows;
  }, [dataset, deferredQuery, riskLevel, sortBy, order]);

  const total = filtered.length;
  const pageItems = filtered.slice(offset, offset + PAGE_SIZE);
  const to = Math.min(offset + PAGE_SIZE, total);
  const selectableOnPage = pageItems.filter(item => !shortlist.has(item.supplierID));
  const extraColumn = sortBy && sortBy !== 'Total_Risk_Index' ? sortBy : null;
  const groupColumn = dataset.groupFields[0] ?? null;
  const delivery = dataset.columns.includes('Supplier Delivery Rating') ? 'Supplier Delivery Rating' : null;
  const goToOffset = (next: number) => { setOffset(next); top.current?.scrollIntoView({ block: 'start' }); };

  return (
    <>
      <ViewHeader title="Explore suppliers" purpose="Search, filter and sort every supplier, then tick the ones you want to compare (up to 20)." />
      <Card>
        <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Search ID or name
            <input className={inputClass} value={query} onChange={event => setQuery(event.target.value)} placeholder="e.g. SUPP_00012" type="search" maxLength={300} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Risk level (as supplied)
            <select className={inputClass} value={riskLevel} onChange={event => setRiskLevel(event.target.value)} disabled={!dataset.hasLevel}>
              <option value="">{dataset.hasLevel ? 'All levels' : 'Not in this file'}</option>
              {dataset.levels.map(level => <option key={level} value={level}>{level}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Sort by
            <select className={inputClass} value={sortBy} onChange={event => setSortBy(event.target.value)}>
              <optgroup label="Risk scores">
                {dataset.riskFields.map(field => <option key={field} value={field}>{field === 'Total_Risk_Index' ? 'Total Risk Index (as supplied)' : fieldLabel(field)}</option>)}
              </optgroup>
              {operational.length > 0 && (
                <optgroup label="Operational indicators">
                  {operational.map(field => <option key={field} value={field}>{field}</option>)}
                </optgroup>
              )}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Order
            <select className={inputClass} value={order} onChange={event => setOrder(event.target.value as 'asc' | 'desc')}>
              <option value="asc">Lowest first</option>
              <option value="desc">Highest first</option>
            </select>
          </label>
        </div>

        <div ref={top} className="mt-4 flex scroll-mt-4 flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-gray-700" aria-live="polite">
            <strong className="font-mono">{total.toLocaleString()}</strong> suppliers match{total > 0 && <> · showing <span className="font-mono">{offset + 1}–{to}</span></>}
          </p>
          <button className={secondaryButton} disabled={!selectableOnPage.length || shortlist.full} onClick={() => shortlist.addMany(selectableOnPage)} title="Adds unselected suppliers on this page until the 20-supplier limit">
            Add page to shortlist
          </button>
        </div>

        {total === 0 ? (
          <div className="mt-3">
            <EmptyState title="No suppliers match these filters" action={<button className={secondaryButton} onClick={() => { setQuery(''); setRiskLevel(''); }}>Clear search and level</button>}>
              Try a shorter ID, or show all risk levels.
            </EmptyState>
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-gray-50 text-xs text-gray-600">
                <tr>
                  <th className="w-10 px-3 py-2"><span className="sr-only">Shortlist</span></th>
                  <th className="px-3 py-2 font-semibold">Supplier</th>
                  {dataset.hasTotal && <th className="px-3 py-2 font-semibold">Total Risk Index (as supplied)<InfoTip id="explore-total-tip" text={TOTAL_TIP} /></th>}
                  {dataset.hasLevel && <th className="px-3 py-2 font-semibold">Risk level</th>}
                  {extraColumn && <th className="px-3 py-2 font-semibold"><HeaderTip field={extraColumn}>{fieldLabel(extraColumn)}</HeaderTip></th>}
                  {groupColumn && <th className="px-3 py-2 font-semibold">{groupColumn}</th>}
                  {delivery && <th className="px-3 py-2 font-semibold"><HeaderTip field={delivery}>Delivery rating</HeaderTip></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pageItems.map(supplier => (
                  <SupplierRow key={supplier.supplierID} supplier={supplier} dataset={dataset} extraColumn={extraColumn} groupColumn={groupColumn} delivery={delivery} shortlist={shortlist} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > PAGE_SIZE && (
          <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
            <button className={secondaryButton} disabled={offset === 0} onClick={() => goToOffset(Math.max(0, offset - PAGE_SIZE))}>← Previous</button>
            <span className="text-gray-600">Page <span className="font-mono">{Math.floor(offset / PAGE_SIZE) + 1}</span> of <span className="font-mono">{Math.ceil(total / PAGE_SIZE).toLocaleString()}</span></span>
            <button className={secondaryButton} disabled={to >= total} onClick={() => goToOffset(offset + PAGE_SIZE)}>Next →</button>
          </nav>
        )}
      </Card>
    </>
  );
}

/** Column label with the supplied criteria definition as a hover hint. */
function HeaderTip({ field, children }: { field: string; children: ReactNode }) {
  const definition = useWorkspace().describe(field);
  return definition ? <abbr className="cursor-help no-underline decoration-dotted underline-offset-2 hover:underline" title={definition}>{children}</abbr> : <>{children}</>;
}

function SupplierRow({ supplier, dataset, extraColumn, groupColumn, delivery, shortlist }: { supplier: Supplier; dataset: Dataset; extraColumn: string | null; groupColumn: string | null; delivery: string | null; shortlist: Shortlist }) {
  const selected = shortlist.has(supplier.supplierID);
  const disabled = !selected && shortlist.full;
  const toggle = () => { if (!disabled) shortlist.toggle(supplier); };
  const { openSupplier } = useWorkspace();
  return (
    <tr className={`cursor-pointer ${selected ? 'bg-accent-soft' : 'hover:bg-gray-50'} ${disabled ? 'cursor-not-allowed' : ''}`} onClick={toggle}>
      <td className="px-3 py-2">
        <input
          type="checkbox"
          className="h-4 w-4 accent-amber-500"
          checked={selected}
          disabled={disabled}
          onChange={toggle}
          onClick={event => event.stopPropagation()}
          aria-label={`${selected ? 'Remove' : 'Add'} ${supplier.supplierID} ${selected ? 'from' : 'to'} shortlist`}
          title={disabled ? 'Shortlist is full (20 suppliers)' : undefined}
        />
      </td>
      <td className="px-3 py-2">
        <button className="group text-left" onClick={event => { event.stopPropagation(); openSupplier(supplier.supplierID); }} title={`View ${supplier.supplierID} profile`}>
          <span className="block font-mono text-xs font-semibold text-gray-900 group-hover:underline">{supplier.supplierID} <span className="font-sans font-normal text-gray-500 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">Profile ›</span></span>
          {supplier['Supplier Name'] && <span className="block text-gray-600">{supplier['Supplier Name']}</span>}
        </button>
      </td>
      {dataset.hasTotal && <td className="px-3 py-2"><ScoreBar value={supplier.Total_Risk_Index} /></td>}
      {dataset.hasLevel && <td className="px-3 py-2"><LevelBadge level={supplier.Total_Risk_Index_Level || null} /></td>}
      {extraColumn && (
        <td className="px-3 py-2 font-mono font-semibold tabular-nums">
          {formatValue(supplier[extraColumn], extraColumn)} <span className="font-sans text-xs font-normal text-gray-500">{levelOf(supplier, extraColumn) ?? ''}</span>
        </td>
      )}
      {groupColumn && <td className="px-3 py-2 text-gray-700">{formatValue(supplier[groupColumn])}</td>}
      {delivery && <td className="px-3 py-2 font-mono tabular-nums">{formatValue(supplier[delivery], delivery)}</td>}
    </tr>
  );
}
