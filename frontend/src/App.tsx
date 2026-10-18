import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
      <div className="sri-app">
        <a className="sri-skip-link" href="#workspace-content">Skip to workspace</a>
        <aside className="sri-sidebar">
          <div className="sri-brand">
            <span className="sri-brand-mark" aria-hidden><WorkspaceIcon name="overview" /></span>
            <div><h1>Supplier Risk <br />Intelligence</h1><p>Rail procurement</p></div>
          </div>
          <p className="sri-nav-label">Workspace</p>
          <RouteNav tab={tab} onGo={go} shortlistCount={shortlist.ids.length} />
          <div className="sri-sidebar-note">
            <span className="sri-label">Your data, your device</span>
            <p>Uploaded files stay in your browser.</p>
            <div className="sri-model-state"><span aria-hidden />{status?.chat_mode === 'live' ? 'Live AI configured' : status?.chat_mode === 'data_only' ? 'Data-only answers' : status ? 'AI configuration required' : 'Checking AI configuration'}</div>
          </div>
        </aside>
        <div className="sri-workspace">
          <header className="sri-toolbar">
            <p className="sri-breadcrumb"><span>Workspace</span><span aria-hidden>/</span><strong>{TABS.find(item => item.id === tab)?.label}</strong></p>
            <div className="sri-toolbar-actions">
              <DataIndicator dataset={dataset} onSwitch={() => setLoaderOpen(true)} />
              <Btn variant="secondary" onClick={() => setLoaderOpen(true)}>Load your data</Btn>
              <Glossary />
            </div>
          </header>
        <main id="workspace-content" className="sri-main" tabIndex={-1}>
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
                <Guide onStep={go} onLoad={() => setLoaderOpen(true)} />
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
        </div>

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

function WorkspaceIcon({ name }: { name: Tab }) {
  const paths: Record<Tab, string> = {
    overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    explore: 'M4 4h16v16H4z M4 9h16 M9 9v11 M4 14h16',
    compare: 'M6 4v16 M18 4v16 M3 8h6 M15 16h6 M10 5h4 M10 19h4',
    ask: 'M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 3v-3H3V6a2 2 0 0 1 2-2z M8 9h8 M8 13h5',
    research: 'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15z M16 16l5 5 M7 10h7 M10.5 6.5v7',
  };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={paths[name]} /></svg>;
}

function RouteNav({ tab, onGo, shortlistCount }: { tab: Tab; onGo: (tab: Tab) => void; shortlistCount: number }) {
  return (
    <nav className="sri-nav" aria-label="Workspace">
      <ol>
        {TABS.map(item => (
          <li key={item.id}>
            <button onClick={() => onGo(item.id)} aria-current={tab === item.id ? 'page' : undefined} className={`sri-nav-item ${tab === item.id ? 'is-active' : ''}`} title={TAB_HINTS[item.id]}>
              <WorkspaceIcon name={item.id} />
              <span>{item.label}</span>
              {item.id === 'compare' && shortlistCount > 0 && <span className="sri-nav-count">{shortlistCount}</span>}
            </button>
          </li>
        ))}
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
    <div className="sri-data-indicator">
      <span className="sri-data-dot" aria-hidden />
      {dataset
        ? <span className="sri-dataset-name" title={`${dataset.label} · ${dataset.rows.length.toLocaleString()} rows`}>{dataset.label} · <span className="sri-dataset-count">{dataset.rows.length.toLocaleString()} rows</span></span>
        : <span className="text-gray-500">Loading data…</span>}
      <button className="sri-data-switch" onClick={onSwitch}>Switch</button>
    </div>
  );
}

function Glossary() {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    container.current?.querySelector<HTMLElement>('ix-button')?.focus();
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    const onOutside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onOutside);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onOutside); };
  }, [open, close]);
  return (
    <div ref={container} className="relative">
      <Btn variant="tertiary" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="glossary-panel">Glossary</Btn>
      {open && (
        <div id="glossary-panel" className="sri-glossary-panel" role="region" aria-label="Risk glossary">
          <p className="mb-3 font-semibold text-gray-900">Risk glossary</p>
          <dl className="space-y-3 text-sm">
            {GLOSSARY.map(item => (
              <div key={item.term}><dt className="font-semibold text-gray-900">{item.term}</dt><dd className="text-gray-600">{item.definition}</dd></div>
            ))}
          </dl>
          <button className="mt-3 text-sm text-gray-600 underline" onClick={close}>Close</button>
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
    <details className="sri-guide">
      <summary>Quick start <span>Explore, compare and research suppliers</span></summary>
      <div className="sri-guide-content">
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
    </details>
  );
}

function ShortlistTray({ shortlist, onCompare }: { shortlist: Shortlist; onCompare?: () => void }) {
  const { openSupplier } = useWorkspace();
  return (
    <aside className="sri-shortlist" aria-label="Shortlist">
      <div className="sri-shortlist-inner">
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
