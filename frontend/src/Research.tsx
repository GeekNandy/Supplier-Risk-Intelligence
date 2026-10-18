import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type ResearchResponse, type Severity, type Source, type Status } from './api';
import { AiError, Card, inputClass, Pill, primaryButton, secondaryButton, Spinner, ViewHeader, WarningBox } from './ui';

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'unknown'];
const SEVERITY_STYLE: Record<Severity, string> = {
  critical: 'bg-red-600 text-white',
  high: 'bg-orange-100 text-orange-900 ring-1 ring-orange-300',
  medium: 'bg-amber-100 text-amber-900 ring-1 ring-amber-300',
  low: 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300',
  unknown: 'bg-gray-100 text-gray-700 ring-1 ring-gray-300',
};
const STATUS_LABEL: Record<ResearchResponse['status'], string> = { complete: 'Complete report', partial: 'Partial report', needs_clarification: 'Needs clarification' };
/** A real report saved from a live run; the UI offers it only if the file exists. */
const SAMPLE_URL = '/demo/sample-research.json';

const formatDate = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
};

function missingParts(status: Status | null) {
  if (!status) return [];
  return [!status.model_configured && 'a language model (LLM_API_KEY, LLM_BASE_URL, LLM_MODEL)', !status.search_configured && 'web search (TAVILY_API_KEY)'].filter(Boolean) as string[];
}

export default function Research({ status }: { status: Status | null }) {
  const [companyName, setCompanyName] = useState('');
  const [country, setCountry] = useState('');
  const [website, setWebsite] = useState('');
  const [pending, setPending] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [report, setReport] = useState<{ data: ResearchResponse; sample: boolean }>();
  const [error, setError] = useState<unknown>();
  const [sample, setSample] = useState<ResearchResponse | null>(null);

  useEffect(() => {
    fetch(SAMPLE_URL)
      .then(response => (response.ok ? response.json() : null))
      .then(data => setSample(data && typeof data === 'object' && 'company' in data ? data as ResearchResponse : null))
      .catch(() => setSample(null));
  }, []);

  useEffect(() => {
    if (!pending) return;
    const started = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [pending]);

  const run = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!companyName.trim() || pending) return;
    setPending(true);
    setError(undefined);
    setReport(undefined);
    try {
      const data = await api.research({
        company_name: companyName.trim(),
        ...(country.trim() ? { country: country.trim() } : {}),
        ...(website.trim() ? { website: website.trim() } : {}),
      });
      setReport({ data, sample: false });
    } catch (reason) {
      setError(reason);
    } finally {
      setPending(false);
    }
  };

  const missing = missingParts(status);
  const notConfigured = status !== null && !status.research_ready;
  const configError = error instanceof ApiError && error.status === 503;
  const openSample = sample ? () => { setError(undefined); setReport({ data: sample, sample: true }); } : undefined;

  return (
    <div className="space-y-5">
      <ViewHeader title="Research a real company" purpose="Name a real supplier; the agent searches public sources and news, follows up on red flags and returns a report with source links." />
      <div className="text-sm text-gray-600">
        Real companies only, kept separate from the anonymized SUPP_ data: no risk score is assigned and no match to a SUPP_ supplier is made.{' '}
        <details className="inline">
          <summary className="inline cursor-pointer font-medium text-gray-900 underline">Learn more</summary>
          <span className="mt-1 block text-gray-600">The report contains labels, counts and cited sources only. Severity words are the model's reading of the cited sources; open each source to verify it. Absence of negative news does not mean low risk.</span>
        </details>
      </div>

      {(notConfigured || configError) && (
        <WarningBox
          title="Live research is not available on this server"
          action={openSample && <button className={secondaryButton} onClick={openSample}>Open the sample report</button>}
        >
          {missing.length ? <>Missing: {missing.join(' and ')}.</> : <>The server could not start research{error instanceof Error ? `: ${error.message}` : '.'}</>}{' '}
          Ask your admin to add these on the server{sample ? ', or open the cached sample report.' : '. No cached sample report is available in this build.'}
        </WarningBox>
      )}

      <Card title="Company">
        <form onSubmit={run} className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)_auto] md:items-end">
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Company name (required)
            <input className={inputClass} required minLength={2} maxLength={200} value={companyName} onChange={event => setCompanyName(event.target.value)} placeholder="e.g. Knorr-Bremse AG" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Country (optional)
            <input className={inputClass} maxLength={100} value={country} onChange={event => setCountry(event.target.value)} placeholder="Germany" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Official website (optional)
            <input className={inputClass} type="url" maxLength={500} value={website} onChange={event => setWebsite(event.target.value)} placeholder="https://www.knorr-bremse.com" />
          </label>
          <button type="submit" disabled={pending || companyName.trim().length < 2} className={primaryButton}>
            {pending ? 'Researching…' : 'Research'}
          </button>
        </form>
        {pending && (
          <div className="mt-4 rounded-lg bg-gray-50 px-4 py-3">
            <Spinner label={`Researching ${companyName.trim()}… ${elapsed}s elapsed`} />
            <p className="mt-1 text-xs text-gray-500">This can take up to two minutes. The steps the agent actually took are shown when the report returns.</p>
          </div>
        )}
        {error && !configError ? <div className="mt-4"><AiError error={error} feature="Company research" onRetry={() => void run()} /></div> : null}
      </Card>

      {report && <Report report={report.data} sample={report.sample} />}
    </div>
  );
}

function Report({ report, sample }: { report: ResearchResponse; sample: boolean }) {
  const sourcesById = new Map(report.sources.map(source => [source.id, source]));
  const findings = [...report.findings].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
  const counts = SEVERITY_ORDER.map(severity => [severity, report.findings.filter(item => item.severity === severity).length] as const).filter(([, count]) => count);
  const website = report.company.website;

  return (
    <div className="space-y-5">
      {report.company.identity_confidence === 'low' && (
        <WarningBox title="The company's identity is uncertain">Check that the sources below are about the company you meant; add the country or official website and run again if not.</WarningBox>
      )}
      <Card
        title={<span className="flex flex-wrap items-center gap-2"><span className="font-mono">{report.company.name}</span><span className={`rounded px-2 py-0.5 text-xs font-semibold ${report.status === 'complete' ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}>{STATUS_LABEL[report.status]}</span>{sample && <Pill tone="sample">Sample (cached, not live)</Pill>}</span>}
        subtitle={<>
          {[report.company.country, website && <a key="w" className="text-gray-900 underline" href={website} target="_blank" rel="noopener noreferrer">{website}</a>].filter(Boolean).map((part, index) => <span key={index}>{index > 0 && ' · '}{part}</span>)}
          {' '}· Identity confidence: <strong>{report.company.identity_confidence}</strong>
          {report.company.identity_source_ids.length > 0 && <> (<SourceRefs ids={report.company.identity_source_ids} sources={sourcesById} />)</>}
        </>}
        actions={<p className="text-right text-xs text-gray-500">{sample ? 'Cached from a live run on ' : 'Researched '}{new Date(report.researched_at).toLocaleString('en-GB')}<br />Model: <span className="font-mono">{report.model}</span></p>}
      >
        {report.status === 'needs_clarification' && report.clarification_question && (
          <div className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-200">
            <strong>Which company did you mean?</strong> {report.clarification_question} Refine the country or official website above and run the research again.
          </div>
        )}
        {report.summary && <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-gray-900">{report.summary}</p>}
        {counts.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
            {counts.map(([severity, count]) => <span key={severity} className={`rounded px-2 py-0.5 font-semibold capitalize ${SEVERITY_STYLE[severity]}`}>{count} {severity}</span>)}
          </div>
        )}
      </Card>

      {findings.length > 0 && (
        <Card title="Findings" subtitle="Ordered by severity. Each finding links to the sources it cites.">
          <ul className="divide-y divide-gray-100">
            {findings.map((finding, index) => (
              <li key={index} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <span className={`h-fit shrink-0 rounded px-2 py-0.5 text-xs font-semibold capitalize ${SEVERITY_STYLE[finding.severity]}`}>{finding.severity}</span>
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{finding.category}</p>
                  <p className="text-sm text-gray-900">{finding.claim}</p>
                  <p className="mt-1 text-xs text-gray-600">Sources: <SourceRefs ids={finding.source_ids} sources={sourcesById} /></p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {report.limitations.length > 0 && (
        <Card title="Limitations" subtitle="Gaps in this report. Absence of negative coverage does not mean low risk.">
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-800">{report.limitations.map(item => <li key={item}>{item}</li>)}</ul>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Research plan">
          {report.plan.length ? <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-800">{report.plan.map(item => <li key={item}>{item}</li>)}</ol> : <p className="text-sm text-gray-500">No plan returned.</p>}
        </Card>
        <Card title="Steps taken" subtitle="Actual workflow actions reported by the server.">
          {report.steps.length ? (
            <ul className="space-y-1.5 text-sm">
              {report.steps.map((step, index) => (
                <li key={index} className="flex gap-2">
                  <span className={step.status === 'completed' ? 'text-emerald-700' : step.status === 'failed' ? 'text-red-700' : 'text-gray-400'} aria-label={step.status}>{step.status === 'completed' ? '✓' : step.status === 'failed' ? '✕' : '–'}</span>
                  <span><span className="font-medium text-gray-900">{step.name}</span> <span className="text-gray-600">{step.detail}</span></span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-gray-500">No steps returned.</p>}
        </Card>
      </div>

      {report.sources.length > 0 && (
        <Card title={`Sources (${report.sources.length})`} subtitle="Source text is untrusted evidence. Open each link to verify claims.">
          <ol className="space-y-3">
            {report.sources.map(source => <SourceItem key={source.id} source={source} />)}
          </ol>
        </Card>
      )}
    </div>
  );
}

function SourceRefs({ ids, sources }: { ids: string[]; sources: Map<string, Source> }) {
  return (
    <>
      {ids.map((id, index) => {
        const source = sources.get(id);
        return (
          <span key={id}>
            {index > 0 && ', '}
            {source ? <a href={`#source-${id}`} className="text-gray-900 underline" title={source.title}>[{id}]</a> : <span className="text-gray-500">[{id}]</span>}
          </span>
        );
      })}
    </>
  );
}

function SourceItem({ source }: { source: Source }) {
  const host = (() => { try { return new URL(source.url).hostname; } catch { return source.url; } })();
  const safeUrl = /^https?:\/\//i.test(source.url) ? source.url : undefined;
  return (
    <li id={`source-${source.id}`} className="scroll-mt-24 rounded-lg border border-gray-200 px-4 py-3 target:ring-2 target:ring-amber-400">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono text-xs text-gray-500">[{source.id}]</span>
        {safeUrl ? <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-gray-900 underline">{source.title || host}</a> : <span className="font-medium">{source.title || source.url}</span>}
        <span className="text-xs text-gray-500">{host}</span>
      </div>
      <p className="mt-1 text-xs text-gray-600">
        Published: {formatDate(source.published_at) ?? 'date not provided'} · Retrieved: {formatDate(source.retrieved_at)} · {source.content_type === 'page_content' ? 'Page content' : 'Search snippet'}
      </p>
      {source.excerpt && <p className="mt-1.5 line-clamp-3 text-sm text-gray-700">{source.excerpt}</p>}
    </li>
  );
}
