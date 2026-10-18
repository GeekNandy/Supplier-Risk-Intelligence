import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  autoMap, buildDataset, downloadText, MAX_UPLOAD_BYTES, numericColumns, parseCsv, saveMapping, savedMapping, templateCsv, validate,
  type Dataset, type Mapping, type RawTable,
} from './dataset';
import { Btn, inputClass, secondaryButton, SectionLabel } from './ui';

type Props = {
  templateColumns: string[];
  onLoaded: (dataset: Dataset, usedSavedMapping: boolean) => void;
  onUseDemo: () => void;
  onClose: () => void;
  isDemo: boolean;
};

/** Modal: choose a CSV (parsed only in this browser), map its columns, check it, then load it. */
export default function LoadData({ templateColumns, onLoaded, onUseDemo, onClose, isDemo }: Props) {
  const [table, setTable] = useState<RawTable>();
  const [mapping, setMapping] = useState<Mapping>();
  const [error, setError] = useState('');
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const accept = async (file: File | undefined) => {
    setError('');
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') { setError('Please choose a .csv file.'); return; }
    if (file.size > MAX_UPLOAD_BYTES) { setError(`This file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 10 MB.`); return; }
    const parsed = parseCsv(await file.text(), file.name);
    if (!parsed.columns.length || !parsed.rows.length) { setError('No rows found. Check that the first line holds the column names.'); return; }
    const saved = savedMapping(parsed);
    if (saved && validate(parsed, saved).errors.length === 0) {
      onLoaded(buildDataset(parsed, saved, 'upload'), true);
      return;
    }
    setTable(parsed);
    setMapping(autoMap(parsed));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/40 p-4 sm:p-8" role="dialog" aria-modal="true" aria-labelledby="load-data-title">
      <div className="w-full max-w-4xl rounded-xl border border-gray-200 bg-white">
        <header className="flex items-start justify-between gap-3 border-b border-gray-200 bg-gradient-to-b from-gray-50 to-white px-6 py-4">
          <div>
            <h2 id="load-data-title" className="text-lg font-semibold text-gray-900">{table ? `Map columns · ${table.fileName}` : 'Load your data'}</h2>
            <p className="text-sm text-gray-600">Your file is read in this browser only. It is not uploaded to the server or sent to any model.</p>
          </div>
          <button ref={closeButton} className={secondaryButton} onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="px-6 py-5">
          {!table || !mapping
            ? <Choose onFile={accept} error={error} templateColumns={templateColumns} onUseDemo={onUseDemo} isDemo={isDemo} />
            : <MapColumns table={table} mapping={mapping} setMapping={setMapping} onBack={() => { setTable(undefined); setMapping(undefined); }}
                onConfirm={() => { saveMapping(table, mapping); onLoaded(buildDataset(table, mapping, 'upload'), false); }} />}
        </div>
      </div>
    </div>
  );
}

export function DropZone({ onFile, compact = false }: { onFile: (file: File | undefined) => void; compact?: boolean }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const drop = (event: DragEvent) => { event.preventDefault(); setOver(false); onFile(event.dataTransfer.files[0]); };
  return (
    <div
      onDragOver={event => { event.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={`rounded-xl border-2 border-dashed text-center transition-colors ${over ? 'border-amber-400 bg-accent-soft' : 'border-gray-300 bg-gray-50'} ${compact ? 'px-4 py-6' : 'px-6 py-10'}`}
    >
      <p className="font-semibold text-gray-900">Drop a CSV file here</p>
      <p className="mt-1 text-sm text-gray-600">or</p>
      <Btn variant="primary" className="mt-2" onClick={() => input.current?.click()}>Choose file…</Btn>
      <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" onChange={event => { onFile(event.target.files?.[0]); event.target.value = ''; }} aria-label="Choose CSV file" />
      <p className="mt-2 text-xs text-gray-500">CSV with a header row · up to 10 MB · one row per supplier</p>
    </div>
  );
}

function Choose({ onFile, error, templateColumns, onUseDemo, isDemo }: { onFile: (file: File | undefined) => void; error: string; templateColumns: string[]; onUseDemo: () => void; isDemo: boolean }) {
  return (
    <div className="space-y-4">
      <DropZone onFile={onFile} />
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Btn variant="secondary" onClick={() => downloadText('supplier-risk-template.csv', templateCsv(templateColumns))}>Download template CSV</Btn>
        <Btn variant="secondary" onClick={onUseDemo} disabled={isDemo}>{isDemo ? 'Demo dataset is loaded' : 'Use demo dataset'}</Btn>
      </div>
      <p className="text-xs text-gray-500">Only a supplier ID column is required. Risk level, Total Risk Index, country and category are optional; anything missing is hidden, never calculated.</p>
    </div>
  );
}

const ROLES: { key: keyof Omit<Mapping, 'scores'>; label: string; required?: boolean; numeric?: boolean }[] = [
  { key: 'id', label: 'Supplier ID', required: true },
  { key: 'name', label: 'Supplier name' },
  { key: 'country', label: 'Country' },
  { key: 'category', label: 'Category' },
  { key: 'level', label: 'Risk level' },
  { key: 'total', label: 'Total Risk Index', numeric: true },
];

function MapColumns({ table, mapping, setMapping, onBack, onConfirm }: { table: RawTable; mapping: Mapping; setMapping: (mapping: Mapping) => void; onBack: () => void; onConfirm: () => void }) {
  const numeric = useMemo(() => numericColumns(table), [table]);
  const check = useMemo(() => validate(table, mapping), [table, mapping]);
  const preview = table.rows.slice(0, 10);
  const scoreOptions = numeric.filter(column => column !== mapping.id && column !== mapping.total);

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Preview · first {preview.length} of <span className="font-mono">{table.rows.length.toLocaleString()}</span> rows</SectionLabel>
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-gray-200">
          <table className="text-left text-xs">
            <thead className="sticky top-0 bg-gray-50"><tr>{table.columns.map(column => <th key={column} className="whitespace-nowrap px-2 py-1.5 font-semibold text-gray-700">{column}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-100 font-mono">
              {preview.map((row, index) => <tr key={index}>{table.columns.map(column => <td key={column} className="whitespace-nowrap px-2 py-1 text-gray-800">{row[column]}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionLabel>Which column is which?</SectionLabel>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ROLES.map(role => (
            <label key={role.key} className="flex flex-col gap-1 text-xs font-medium text-gray-600">
              <span>{role.label} {role.required ? <span className="text-red-700">(required)</span> : <span className="font-normal text-gray-500">(optional)</span>}</span>
              <select
                className={inputClass}
                value={(mapping[role.key] as string | undefined) ?? ''}
                onChange={event => {
                  const value = event.target.value || undefined;
                  const next = { ...mapping, [role.key]: value } as Mapping;
                  if (role.key === 'total' && value) next.scores = next.scores.filter(score => score !== value);
                  setMapping(next);
                }}
              >
                {!role.required && <option value="">— Not in this file —</option>}
                {role.required && !mapping.id && <option value="">Choose a column…</option>}
                {(role.numeric ? numeric : table.columns).map(column => <option key={column} value={column}>{column}</option>)}
              </select>
            </label>
          ))}
        </div>
        <fieldset className="mt-4">
          <legend className="text-xs font-medium text-gray-600">Sub-score columns <span className="font-normal text-gray-500">(numeric; shown on the radar and in Compare)</span></legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {scoreOptions.map(column => {
              const on = mapping.scores.includes(column);
              return (
                <label key={column} className={`flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ring-inset ${on ? 'bg-accent-soft ring-amber-400' : 'bg-white ring-gray-300'}`}>
                  <input type="checkbox" className="accent-amber-500" checked={on} onChange={() => setMapping({ ...mapping, scores: on ? mapping.scores.filter(item => item !== column) : [...mapping.scores, column] })} />
                  {column}
                </label>
              );
            })}
            {!scoreOptions.length && <span className="text-sm text-gray-500">No numeric columns found.</span>}
          </div>
        </fieldset>
      </section>

      <section aria-live="polite">
        <SectionLabel>Checks</SectionLabel>
        <ul className="mt-2 space-y-1 text-sm">
          {check.errors.map(message => <li key={message} className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-red-900">✕ {message}</li>)}
          {check.warnings.map(message => <li key={message} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-950">⚠ {message}</li>)}
          {!check.errors.length && !check.warnings.length && <li className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-900">✓ All checks passed.</li>}
        </ul>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4">
        <Btn variant="secondary" onClick={onBack}>← Choose another file</Btn>
        <Btn variant="primary" disabled={check.errors.length > 0} onClick={onConfirm}>
          {check.warnings.length ? 'Continue with warnings' : 'Load data'} · {table.rows.length.toLocaleString()} rows
        </Btn>
      </div>
    </div>
  );
}
