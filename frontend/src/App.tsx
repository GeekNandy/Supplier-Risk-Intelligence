import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type Status } from './api';
import Chat from './Chat';
import Compare from './Compare';
import { loadDemoDataset, type Dataset } from './dataset';
import Explorer from './Explorer';
import { parseCriteria } from './format';
import { GLOSSARY } from './glossary';
import LoadData, { DropZone } from './LoadData';
import Overview from './Overview';
import Research from './Research';
import { MAX_SHORTLIST, useShortlist, type Shortlist } from './shortlist';
import SupplierDetail from './SupplierDetail';
import Train from './Train';
import { Btn, EmptyState, ErrorBox, LevelBadge, Skeleton, SkeletonRows, ViewHeader } from './ui';
import { useWorkspace, WorkspaceContext } from './workspace';

type Tab = 'overview' | 'explore' | 'compare' | 'ask' | 'research';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'explore', label: 'Explore' },
  { id: 'compare', label: 'Compare' },
  { id: 'ask', label: 'Ask' },
  { id: 'research', label: 'Research' },
];
const GUIDE_KEY = 'sri.guide.dismissed.v1';

export default function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [demoTemplate, setDemoTemplate] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<unknown>();
  const [attempt, setAttempt] = useState(0);
  const [definitions, setDefinitions] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [loaderOpen, setLoaderOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [chatDraft, setChatDraft] = useState<{ text: string; nonce: number }>();

  const validIds = useMemo(() => (dataset ? new Set(dataset.rows.map(row => row.supplierID)) : undefined), [dataset]);
  const shortlist = useShortlist(dataset?.key ?? 'none', validIds);

  const loadDemo = useCallback(() => {
    setLoadError(undefined);
    loadDemoDataset()
      .then(demo => { setDataset(demo); setDemoTemplate(demo.columns); })
      .catch(setLoadError);
  }, []);
  useEffect(() => { loadDemo(); }, [loadDemo, attempt]);
  useEffect(() => {
    api.meta().then(meta => setDefinitions(parseCriteria(meta.criteria_markdown))).catch(() => setDefinitions({}));
    api.status().then(setStatus).catch(() => setStatus(null));
  }, []);

  const go = (next: Tab) => { setTab(next); window.scrollTo({ top: 0 }); };
  const closeDetail = useCallback(() => setDetailId(null), []);
  const workspace = useMemo(() => ({ dataset, openSupplier: setDetailId, describe: (field: string) => definitions[field] }), [dataset, definitions]);
  const askAbout = (text: string) => { setChatDraft({ text, nonce: Date.now() }); go('ask'); };
  const addIds = useCallback(async (ids: string[]) => {
    if (!dataset) return;
    const byId = new Map(dataset.rows.map(row => [row.supplierID, row]));
    shortlist.addMany(ids.map(id => byId.get(id)).filter((row): row is NonNullable<typeof row> => !!row));
  }, [dataset, shortlist]);
  const onLoaded = (next: Dataset, usedSavedMapping: boolean) => {
    setDataset(next);
    setLoaderOpen(false);
    setDetailId(null);
    setNotice(`Loaded ${next.label} · ${next.rows.length.toLocaleString()} suppliers${usedSavedMapping ? ' · used your saved column mapping' : ''}. The file stays in this browser.`);
    go('overview');
  };
  const useDemo = () => { setLoaderOpen(false); setNotice(''); loadDemo(); go('overview'); };
  const canAsk = dataset?.kind === 'demo';

  return (
    <WorkspaceContext.Provider value={workspace}>
      <div className="min-h-screen pb-28">
        <header className="sri-hero" data-ix-theme="classic" data-ix-color-schema="dark">
          <div className="mx-auto max-w-[1200px] px-6 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="sri-label !text-accent">Rail procurement · Supplier risk</p>
              <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
                <DataIndicator dataset={dataset} onSwitch={() => setLoaderOpen(true)} />
                <Btn variant="primary" onClick={() => setLoaderOpen(true)}>Load your data</Btn>
                <Glossary />
              </div>
            </div>
            <h1 className="mt-6 text-[32px] font-bold leading-tight text-gray-900 sm:text-[40px]">Supplier Risk Intelligence</h1>
            <p className="mt-2 max-w-2xl text-base text-gray-700">Explore, compare and research rail component suppliers, with every number traceable to its source.</p>
            <p className="mt-1 text-xs text-gray-500">Built for the Siemens Supplier Risk Intelligence challenge</p>
          </div>
          <div className="mt-4">
            <Train />
          </div>
          <RouteNav tab={tab} onGo={go} shortlistCount={shortlist.ids.length} />
        </header>

        <main className="mx-auto max-w-[1200px] px-6 py-8">
          <Guide onStep={go} onLoad={() => setLoaderOpen(true)} />
          {notice && (
            <div className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700" role="status">
              <span>{notice}</span>
              <button className="text-gray-500 hover:text-gray-900" onClick={() => setNotice('')} aria-label="Dismiss">✕</button>
            </div>
          )}
          {loadError ? (
            <ErrorBox error={new Error(`${loadError instanceof Error ? loadError.message : 'The demo dataset could not be loaded.'} You can also load your own CSV with “Load your data”.`)} onRetry={() => setAttempt(value => value + 1)} />
          ) : !dataset ? (
            <LoadingView />
          ) : (
            <>
              {/* Panels stay mounted so filters, answers and reports survive tab switches. */}
              <div hidden={tab !== 'overview'}>
                <Overview dataset={dataset} shortlist={shortlist} />
                {dataset.kind === 'demo' && (
                  <section className="mt-8">
                    <p className="mb-2 text-sm font-semibold text-gray-900">Have your own supplier list?</p>
                    <DropZoneLauncher onOpen={() => setLoaderOpen(true)} />
                  </section>
                )}
              </div>
              <div hidden={tab !== 'explore'}><Explorer dataset={dataset} shortlist={shortlist} /></div>
              <div hidden={tab !== 'compare'}><Compare dataset={dataset} shortlist={shortlist} onExplore={() => go('explore')} onAsk={askAbout} canAsk={canAsk} /></div>
              <div hidden={tab !== 'ask'}>
                {canAsk ? <Chat shortlist={shortlist} status={status} onAddIds={addIds} draft={chatDraft} /> : (
                  <>
                    <ViewHeader title="Ask about the data" purpose="Ask plain-language questions; answers cite the exact supplier, field and value." />
                    <EmptyState title="Ask works on the demo dataset" action={<Btn variant="secondary" onClick={useDemo}>Switch to demo dataset</Btn>}>
                      Your uploaded file stays in this browser and is never sent to the server or a model, so the assistant cannot read it. Use Overview, Explore and Compare for your file.
                    </EmptyState>
                  </>
                )}
              </div>
              <div hidden={tab !== 'research'}><Research status={status} /></div>
              {tab !== 'research' && <HowItWorks status={status} />}
            </>
          )}
        </main>

        {dataset && tab !== 'research' && <ShortlistTray shortlist={shortlist} onCompare={tab === 'compare' ? undefined : () => go('compare')} />}
        {dataset && detailId && <SupplierDetail id={detailId} dataset={dataset} shortlist={shortlist} onClose={closeDetail} />}
        {loaderOpen && <LoadData templateColumns={demoTemplate} onLoaded={onLoaded} onUseDemo={useDemo} onClose={() => setLoaderOpen(false)} isDemo={dataset?.kind === 'demo'} />}
      </div>
    </WorkspaceContext.Provider>
  );
}

const TAB_HINTS: Record<Tab, string> = {
  overview: 'Risk at a glance',
  explore: 'Search & shortlist',
  compare: 'Rank & justify',
  ask: 'Grounded Q&A',
  research: 'Real-company check',
};

/** Tabs drawn as a route line: stations joined by a track, the current station in the primary colour. */
function RouteNav({ tab, onGo, shortlistCount }: { tab: Tab; onGo: (tab: Tab) => void; shortlistCount: number }) {
  return (
    <nav className="mx-auto max-w-[1200px] overflow-x-auto px-6 pb-5 pt-4" aria-label="Workspace">
      <ol className="relative grid min-w-[640px] grid-cols-5">
        <span className="absolute left-[10%] right-[10%] top-[11px] h-0.5 bg-gray-300" aria-hidden />
        {TABS.map(item => {
          const active = tab === item.id;
          return (
            <li key={item.id} className="relative flex justify-center">
              <button
                onClick={() => onGo(item.id)}
                aria-current={active ? 'page' : undefined}
                className="group flex flex-col items-center gap-1.5 rounded px-2 pb-1 text-center"
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${active ? 'border-accent bg-accent' : 'border-gray-400 bg-[var(--sri-hero-bg)] group-hover:border-accent'}`}
                  aria-hidden
                >
                  <span className={`h-2 w-2 rounded-full ${active ? 'bg-on-accent' : 'bg-transparent group-hover:bg-accent'}`} />
                </span>
                <span className={`text-sm ${active ? 'font-bold text-accent' : 'font-semibold text-gray-800 group-hover:text-gray-900'}`}>
                  {item.label}
                  {item.id === 'compare' && shortlistCount > 0 && <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 font-mono text-xs text-gray-700">{shortlistCount}</span>}
                </span>
                <span className="text-xs text-gray-500">{TAB_HINTS[item.id]}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function DropZoneLauncher({ onOpen }: { onOpen: () => void }) {
  // The real drop handling lives in the Load-data dialog; dragging a file here opens it.
  return (
    <div onDragEnter={event => { event.preventDefault(); onOpen(); }}>
      <DropZone compact onFile={() => onOpen()} />
    </div>
  );
}

function LoadingView() {
  return (
    <div className="space-y-5" aria-busy="true">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map(index => <Skeleton key={index} className="h-20" />)}</div>
      <SkeletonRows rows={8} />
      <p className="text-sm text-gray-500" role="status">Loading the demo dataset…</p>
    </div>
  );
}

function DataIndicator({ dataset, onSwitch }: { dataset: Dataset | null; onSwitch: () => void }) {
  return (
    <div className="flex min-h-8 min-w-0 max-w-full items-center gap-2 rounded border border-gray-200 bg-gray-50 px-3 py-1 text-sm">
      <span className="sri-label">Data</span>
      {dataset
        ? <span className="min-w-0 max-w-80 truncate font-medium text-gray-900" title={dataset.label}>{dataset.label} · <span className="font-mono">{dataset.rows.length.toLocaleString()}</span> rows</span>
        : <span className="text-gray-500">loading…</span>}
      <button className="font-bold text-accent underline underline-offset-2 hover:no-underline" onClick={onSwitch}>Switch</button>
    </div>
  );
}

function Glossary() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <div className="relative">
      <Btn variant="secondary" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="glossary-panel">Glossary</Btn>
      {open && (
        <div id="glossary-panel" className="absolute right-0 z-30 mt-2 w-80 rounded border border-gray-300 bg-[var(--theme-color-3)] p-4 shadow-lg">
          <dl className="space-y-3 text-sm">
            {GLOSSARY.map(item => (
              <div key={item.term}><dt className="font-semibold text-gray-900">{item.term}</dt><dd className="text-gray-600">{item.definition}</dd></div>
            ))}
          </dl>
          <button className="mt-3 text-sm text-gray-600 underline" onClick={() => setOpen(false)}>Close</button>
        </div>
      )}
    </div>
  );
}

function Guide({ onStep, onLoad }: { onStep: (tab: Tab) => void; onLoad: () => void }) {
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(GUIDE_KEY) === '1'; } catch { return false; } });
  if (hidden) return null;
  const dismiss = () => { setHidden(true); try { localStorage.setItem(GUIDE_KEY, '1'); } catch { /* storage unavailable */ } };
  const steps: { label: string; action: () => void }[] = [
    { label: 'Load or explore data', action: () => onStep('explore') },
    { label: 'Compare suppliers', action: () => onStep('compare') },
    { label: 'Research a real company', action: () => onStep('research') },
  ];
  return (
    <div className="mb-8 flex flex-wrap items-center gap-x-6 gap-y-2 rounded border border-gray-200 bg-white px-4 py-3 text-sm">
      <span className="font-semibold text-gray-900">How to use this</span>
      <ol className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {steps.map((step, index) => (
          <li key={step.label} className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-accent font-mono text-xs font-semibold text-accent">{index + 1}</span>
            <button className="text-gray-800 underline-offset-2 hover:underline" onClick={step.action}>{step.label}</button>
            {index === 0 && <button className="text-xs text-gray-500 underline" onClick={onLoad}>(upload CSV)</button>}
            {index < steps.length - 1 && <span className="text-gray-300" aria-hidden>→</span>}
          </li>
        ))}
      </ol>
      <button className="ml-auto text-gray-500 hover:text-gray-900" onClick={dismiss} aria-label="Dismiss the guide">Dismiss ✕</button>
    </div>
  );
}

function ShortlistTray({ shortlist, onCompare }: { shortlist: Shortlist; onCompare?: () => void }) {
  const { openSupplier } = useWorkspace();
  return (
    <aside className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-300 bg-white" aria-label="Shortlist">
      <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-6 py-3">
        <div className="shrink-0">
          <p className="text-sm font-semibold text-gray-900">Shortlist</p>
          <p className={`font-mono text-xs ${shortlist.full ? 'font-semibold text-amber-800' : 'text-gray-500'}`}>{shortlist.ids.length} / {MAX_SHORTLIST}{shortlist.full ? ' · full' : ''}</p>
        </div>
        <ul className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-1">
          {shortlist.items.length === 0 && <li className="text-sm text-gray-500">Tick suppliers in Explore to compare up to 20.</li>}
          {shortlist.items.map(item => (
            <li key={item.id} className="flex shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 py-1 pl-3 pr-1 text-xs" title={item.name}>
              <button onClick={() => openSupplier(item.id)} className="font-mono font-semibold hover:underline" title={`View ${item.id} profile`}>{item.id}</button>
              {item.level && <LevelBadge level={item.level} />}
              <button onClick={() => shortlist.remove(item.id)} className="rounded-full px-1.5 text-gray-500 hover:bg-gray-200 hover:text-red-700" aria-label={`Remove ${item.id} from shortlist`}>✕</button>
            </li>
          ))}
        </ul>
        {shortlist.items.length > 0 && <button onClick={shortlist.clear} className="shrink-0 text-sm text-gray-600 underline hover:text-red-700">Clear</button>}
        {onCompare && <Btn variant="primary" className="shrink-0" disabled={!shortlist.items.length} onClick={onCompare}>Compare {shortlist.items.length || ''} →</Btn>}
      </div>
    </aside>
  );
}

function HowItWorks({ status }: { status: Status | null }) {
  const model = status?.model ?? null;
  return (
    <details className="mt-12 rounded border border-gray-200 bg-white px-6 py-4 text-sm text-gray-700">
      <summary className="cursor-pointer font-semibold text-gray-900">How it works</summary>
      <ul className="mt-3 list-disc space-y-1.5 pl-5">
        <li><strong>Overview, Explore & Compare</strong> run in your browser on the loaded dataset. Scores and risk levels are shown as supplied; the Total Risk Index is never recalculated and its weights are not known. Uploaded files never leave the browser.</li>
        <li><strong>Ask</strong> (demo dataset only): {status?.chat_mode === 'live' && model
          ? <>the hosted model <code className="rounded bg-gray-100 px-1 font-mono">{model}</code> calls read-only supplier tools; the server fills every cited value from the returned rows.</>
          : <>without a configured model the server answers a limited set of questions in a labelled data-only mode.</>}</li>
        <li><strong>Research</strong>: {status?.research_ready
          ? <>the model plans searches and reviews public sources retrieved via a search API; every finding must cite a retrieved source.</>
          : <>needs model and search credentials on the server{status ? '; not configured right now' : ''}.</>}</li>
        <li>Real companies researched here are never linked to anonymized SUPP_ suppliers and never get a numerical score.</li>
      </ul>
    </details>
  );
}
