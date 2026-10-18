import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type Metadata, type Status } from './api';
import Chat from './Chat';
import Compare from './Compare';
import Explorer from './Explorer';
import Research from './Research';
import SupplierDetail from './SupplierDetail';
import { parseCriteria } from './format';
import { useWorkspace, WorkspaceContext } from './workspace';
import { MAX_SHORTLIST, useShortlist, type Shortlist } from './shortlist';
import { ErrorBox, LevelBadge, primaryButton, Spinner } from './ui';

type Tab = 'explore' | 'compare' | 'ask' | 'research';
const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'explore', label: 'Explore', hint: 'Search & shortlist' },
  { id: 'compare', label: 'Compare', hint: 'Rank & justify' },
  { id: 'ask', label: 'Ask', hint: 'Grounded Q&A' },
  { id: 'research', label: 'Research', hint: 'Real company' },
];

export default function App() {
  const [meta, setMeta] = useState<Metadata>();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<unknown>();
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<Tab>('explore');
  const shortlist = useShortlist();
  const go = (next: Tab) => { setTab(next); window.scrollTo({ top: 0 }); };
  const [detailId, setDetailId] = useState<string | null>(null);
  const [chatDraft, setChatDraft] = useState<{ text: string; nonce: number }>();
  const closeDetail = useCallback(() => setDetailId(null), []);
  const workspace = useMemo(() => {
    const definitions = parseCriteria(meta?.criteria_markdown ?? '');
    return { openSupplier: setDetailId, describe: (field: string) => definitions[field] };
  }, [meta]);
  const askAbout = (text: string) => { setChatDraft({ text, nonce: Date.now() }); go('ask'); };

  useEffect(() => {
    setError(undefined);
    api.meta().then(setMeta).catch(setError);
    api.status().then(setStatus).catch(() => setStatus(null));
  }, [attempt]);

  const addIds = useCallback(async (ids: string[]) => {
    const rows = await Promise.all(ids.filter(id => !shortlist.has(id)).map(id => api.supplier(id)));
    shortlist.addMany(rows);
  }, [shortlist]);

  return (
    <WorkspaceContext.Provider value={workspace}>
    <div className="min-h-screen pb-28">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-700">Rail procurement · Supplier risk</p>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">Supplier Risk Intelligence</h1>
          </div>
          <nav className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1" aria-label="Workspace">
            {TABS.map((item, index) => (
              <button
                key={item.id}
                onClick={() => go(item.id)}
                aria-current={tab === item.id ? 'page' : undefined}
                className={`rounded-md px-3 py-1.5 text-left text-sm transition-colors ${tab === item.id ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                <span className="text-slate-400">{index + 1}</span> {item.label}
                {item.id === 'compare' && shortlist.ids.length > 0 && <span className="ml-1.5 rounded-full bg-blue-700 px-1.5 text-xs font-semibold text-white">{shortlist.ids.length}</span>}
                <span className="hidden text-[11px] font-normal text-slate-500 lg:block">{item.hint}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {error ? <ErrorBox error={error} onRetry={() => setAttempt(value => value + 1)} /> : !meta ? (
          <div className="py-20 text-center"><Spinner label="Loading supplier data…" /></div>
        ) : (
          <>
            {/* Panels stay mounted so filters, answers and reports survive tab switches. */}
            <div hidden={tab !== 'explore'}><Explorer meta={meta} shortlist={shortlist} /></div>
            <div hidden={tab !== 'compare'}><Compare meta={meta} shortlist={shortlist} onExplore={() => go('explore')} onAsk={askAbout} /></div>
            <div hidden={tab !== 'ask'}><Chat shortlist={shortlist} status={status} onAddIds={addIds} draft={chatDraft} /></div>
            <div hidden={tab !== 'research'}><Research status={status} /></div>
            <HowItWorks status={status} />
          </>
        )}
      </main>

      {meta && tab !== 'research' && <ShortlistTray shortlist={shortlist} onCompare={tab === 'compare' ? undefined : () => go('compare')} />}
      {meta && detailId && <SupplierDetail id={detailId} meta={meta} shortlist={shortlist} onClose={closeDetail} />}
    </div>
    </WorkspaceContext.Provider>
  );
}

function ShortlistTray({ shortlist, onCompare }: { shortlist: Shortlist; onCompare?: () => void }) {
  const { openSupplier } = useWorkspace();
  return (
    <aside className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-300 bg-white/95 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] backdrop-blur" aria-label="Shortlist">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
        <div className="shrink-0">
          <p className="text-sm font-semibold text-slate-900">Shortlist</p>
          <p className={`text-xs ${shortlist.full ? 'font-semibold text-amber-700' : 'text-slate-500'}`}>{shortlist.ids.length} / {MAX_SHORTLIST}{shortlist.full ? ' · full' : ''}</p>
        </div>
        <ul className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-1">
          {shortlist.items.length === 0 && <li className="text-sm text-slate-500">Tick suppliers in the table to compare up to 20.</li>}
          {shortlist.items.map(item => (
            <li key={item.id} className="flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-xs ring-1 ring-slate-200" title={item.name}>
              <button onClick={() => openSupplier(item.id)} className="font-mono font-semibold hover:text-blue-700 hover:underline" title={`View ${item.id} details`}>{item.id}</button>
              <LevelBadge level={item.level} />
              <button onClick={() => shortlist.remove(item.id)} className="rounded-full px-1.5 text-slate-500 hover:bg-slate-200 hover:text-red-700" aria-label={`Remove ${item.id} from shortlist`}>✕</button>
            </li>
          ))}
        </ul>
        {shortlist.items.length > 0 && <button onClick={shortlist.clear} className="shrink-0 text-sm text-slate-600 underline hover:text-red-700">Clear</button>}
        {onCompare && <button className={`${primaryButton} shrink-0`} disabled={!shortlist.items.length} onClick={onCompare}>Compare {shortlist.items.length || ''} →</button>}
      </div>
    </aside>
  );
}

function HowItWorks({ status }: { status: Status | null }) {
  const model = status?.model ?? null;
  return (
    <details className="mt-8 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm text-slate-700">
      <summary className="cursor-pointer font-semibold text-slate-900">How it works</summary>
      <ul className="mt-3 list-disc space-y-1.5 pl-5">
        <li><strong>Explore & compare</strong> run on the supplied anonymized dataset in Python. Scores and level labels are shown as supplied; the Total Risk Index is not recalculated and its weights are not known.</li>
        <li><strong>Ask</strong>: {status?.chat_mode === 'live' && model
          ? <>the hosted model <code className="rounded bg-slate-100 px-1">{model}</code> calls read-only supplier tools; the server fills every cited value from the returned rows.</>
          : <>without a configured model the server answers a limited set of questions in a labelled data-only mode.</>}</li>
        <li><strong>Research</strong>: {status?.research_ready
          ? <>the model plans searches and reviews public sources retrieved via a search API; every finding must cite a retrieved source.</>
          : <>needs model and search credentials on the server{status ? '; not configured right now' : ''}.</>}</li>
        <li>Real companies researched here are never linked to anonymized SUPP_ suppliers.</li>
      </ul>
    </details>
  );
}
