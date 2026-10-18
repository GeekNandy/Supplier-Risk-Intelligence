import { useEffect, useRef, useState } from 'react';
import { api, type Metadata, type Supplier, type SupplierPage } from './api';
import { fieldLabel, formatValue, levelOf, OPERATIONAL_FIELDS } from './format';
import type { Shortlist } from './shortlist';
import { Card, ErrorBox, inputClass, LevelBadge, ScoreBar, secondaryButton, Spinner } from './ui';

const PAGE_SIZE = 25;

export default function Explorer({ meta, shortlist }: { meta: Metadata; shortlist: Shortlist }) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [riskLevel, setRiskLevel] = useState('');
  const [sortBy, setSortBy] = useState('Total_Risk_Index');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<SupplierPage>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>();
  const [attempt, setAttempt] = useState(0);
  const top = useRef<HTMLDivElement>(null);
  const goToOffset = (next: number) => {
    setOffset(next);
    top.current?.scrollIntoView({ block: 'start' });
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Any filter change restarts at the first page.
  useEffect(() => setOffset(0), [debouncedQuery, riskLevel, sortBy, order]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ sort_by: sortBy, order, offset: String(offset), limit: String(PAGE_SIZE) });
    if (debouncedQuery) params.set('q', debouncedQuery);
    if (riskLevel) params.set('risk_level', riskLevel);
    setLoading(true);
    setError(undefined);
    api.suppliers(params, controller.signal)
      .then(result => { setPage(result); setLoading(false); })
      .catch(reason => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason);
        setLoading(false);
      });
    return () => controller.abort();
  }, [debouncedQuery, riskLevel, sortBy, order, offset, attempt]);

  const operationalSortable = OPERATIONAL_FIELDS.map(item => item.field).filter(field => meta.numeric_fields.includes(field));
  const extraColumn = sortBy !== 'Total_Risk_Index' && sortBy !== 'Financial_Health_Score' ? sortBy : null;
  const total = page?.total ?? 0;
  const from = total ? offset + 1 : 0;
  const to = Math.min(offset + PAGE_SIZE, total);
  const pageItems = page?.items ?? [];
  const selectableOnPage = pageItems.filter(item => !shortlist.has(item.supplierID));

  return (
    <Card
      title="Find suppliers"
      subtitle={`${meta.row_count.toLocaleString()} anonymized suppliers. Risk scores: 0 = no risk, 100 = maximum risk.`}
    >
      <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Search ID or name
          <input className={inputClass} value={query} onChange={event => setQuery(event.target.value)} placeholder="e.g. SUPP_00012 or Apex" type="search" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Overall risk level
          <select className={inputClass} value={riskLevel} onChange={event => setRiskLevel(event.target.value)}>
            <option value="">All levels</option>
            {meta.risk_levels.map(level => <option key={level} value={level}>{level}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Sort by
          <select className={inputClass} value={sortBy} onChange={event => setSortBy(event.target.value)}>
            <optgroup label="Risk scores (0–100)">
              {meta.risk_fields.map(field => <option key={field} value={field}>{fieldLabel(field)}</option>)}
            </optgroup>
            {operationalSortable.length > 0 && (
              <optgroup label="Operational indicators">
                {operationalSortable.map(field => <option key={field} value={field}>{field}</option>)}
              </optgroup>
            )}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Order
          <select className={inputClass} value={order} onChange={event => setOrder(event.target.value as 'asc' | 'desc')}>
            <option value="asc">Lowest first</option>
            <option value="desc">Highest first</option>
          </select>
        </label>
      </div>

      <div ref={top} className="mt-4 flex scroll-mt-4 flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-slate-700" aria-live="polite">
          {loading ? <Spinner label="Loading suppliers…" /> : page && <><strong>{total.toLocaleString()}</strong> suppliers match{total > 0 && <> · showing {from}–{to}</>}</>}
        </p>
        <button
          className={secondaryButton}
          disabled={!selectableOnPage.length || shortlist.full}
          onClick={() => shortlist.addMany(selectableOnPage)}
          title="Adds unselected suppliers on this page until the 20-supplier limit"
        >
          Add page to shortlist
        </button>
      </div>

      {error ? <div className="mt-4"><ErrorBox error={error} onRetry={() => setAttempt(value => value + 1)} /></div> : (
        <div className={`mt-3 overflow-x-auto rounded-lg border border-slate-200 ${loading ? 'opacity-60' : ''}`}>
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="w-10 px-3 py-2.5"><span className="sr-only">Shortlist</span></th>
                <th className="px-3 py-2.5">Supplier</th>
                <th className="px-3 py-2.5">Total risk</th>
                <th className="px-3 py-2.5">Level</th>
                <th className="px-3 py-2.5">Financial</th>
                {extraColumn && <th className="px-3 py-2.5">{fieldLabel(extraColumn)}</th>}
                <th className="px-3 py-2.5">Delivery rating</th>
                <th className="px-3 py-2.5">Sourcing risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageItems.map(supplier => (
                <SupplierRow key={supplier.supplierID} supplier={supplier} extraColumn={extraColumn} shortlist={shortlist} />
              ))}
            </tbody>
          </table>
          {!loading && page && pageItems.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-slate-600">
              No suppliers match these filters.{' '}
              <button className="font-medium text-blue-700 underline" onClick={() => { setQuery(''); setRiskLevel(''); }}>Clear search and level</button>
            </div>
          )}
        </div>
      )}

      {page && total > PAGE_SIZE && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
          <button className={secondaryButton} disabled={offset === 0 || loading} onClick={() => goToOffset(Math.max(0, offset - PAGE_SIZE))}>← Previous</button>
          <span className="text-slate-600">Page {Math.floor(offset / PAGE_SIZE) + 1} of {Math.ceil(total / PAGE_SIZE).toLocaleString()}</span>
          <button className={secondaryButton} disabled={to >= total || loading} onClick={() => goToOffset(offset + PAGE_SIZE)}>Next →</button>
        </nav>
      )}
    </Card>
  );
}

function SupplierRow({ supplier, extraColumn, shortlist }: { supplier: Supplier; extraColumn: string | null; shortlist: Shortlist }) {
  const selected = shortlist.has(supplier.supplierID);
  const disabled = !selected && shortlist.full;
  const toggle = () => { if (!disabled) shortlist.toggle(supplier); };
  return (
    <tr
      className={`cursor-pointer ${selected ? 'bg-blue-50' : 'hover:bg-slate-50'} ${disabled ? 'cursor-not-allowed' : ''}`}
      onClick={toggle}
    >
      <td className="px-3 py-2.5">
        <input
          type="checkbox"
          className="h-4 w-4 accent-blue-700"
          checked={selected}
          disabled={disabled}
          onChange={toggle}
          onClick={event => event.stopPropagation()}
          aria-label={`${selected ? 'Remove' : 'Add'} ${supplier.supplierID} ${selected ? 'from' : 'to'} shortlist`}
          title={disabled ? 'Shortlist is full (20 suppliers)' : undefined}
        />
      </td>
      <td className="px-3 py-2.5">
        <div className="font-mono text-xs font-semibold text-slate-900">{supplier.supplierID}</div>
        <div className="text-slate-600">{supplier['Supplier Name']}</div>
      </td>
      <td className="px-3 py-2.5"><ScoreBar value={supplier.Total_Risk_Index} /></td>
      <td className="px-3 py-2.5"><LevelBadge level={supplier.Total_Risk_Index_Level || null} /></td>
      <td className="px-3 py-2.5 tabular-nums">
        {formatValue(supplier.Financial_Health_Score)} <span className="text-xs text-slate-500">{levelOf(supplier, 'Financial_Health_Score') ?? ''}</span>
      </td>
      {extraColumn && (
        <td className="px-3 py-2.5 font-semibold tabular-nums">
          {formatValue(supplier[extraColumn], extraColumn)} <span className="text-xs font-normal text-slate-500">{levelOf(supplier, extraColumn) ?? ''}</span>
        </td>
      )}
      <td className="px-3 py-2.5 tabular-nums">{formatValue(supplier['Supplier Delivery Rating'], 'Supplier Delivery Rating')}</td>
      <td className="px-3 py-2.5">{formatValue(supplier['Sourcing Risk Level'])}</td>
    </tr>
  );
}
