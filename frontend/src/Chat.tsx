import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, type ChatResponse, type Status } from './api';
import { fieldLabel, formatValue } from './format';
import type { Shortlist } from './shortlist';
import { AiError, Btn, Card, inputClass, primaryButton, Spinner } from './ui';
import { useWorkspace } from './workspace';

const EXAMPLES = [
  'Which of SUPP_00012, SUPP_00450 and SUPP_00731 has the lowest financial risk?',
  'Why is the Total Risk Index of SUPP_00018 so high?',
  'Which of my shortlisted suppliers has the lowest quality risk?',
];

type Turn = { id: number; question: string; contextIds: string[]; response?: ChatResponse; error?: unknown };

export default function Chat({ shortlist, status, onAddIds, draft }: { shortlist: Shortlist; status: Status | null; onAddIds: (ids: string[]) => Promise<void>; draft?: { text: string; nonce: number } }) {
  const [message, setMessage] = useState('');
  const [useContext, setUseContext] = useState(true);
  const input = useRef<HTMLTextAreaElement>(null);

  // A question prefilled from Compare: shown for the buyer to review and send, never sent automatically.
  useEffect(() => {
    if (!draft) return;
    setMessage(draft.text);
    setUseContext(true);
    requestAnimationFrame(() => input.current?.focus());
  }, [draft]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || pending) return;
    const contextIds = useContext ? shortlist.ids : [];
    const id = Date.now();
    setTurns(current => [{ id, question: text, contextIds }, ...current]);
    setMessage('');
    setPending(true);
    try {
      const response = await api.chat(text, contextIds);
      setTurns(current => current.map(turn => (turn.id === id ? { ...turn, response } : turn)));
    } catch (error) {
      setTurns(current => current.map(turn => (turn.id === id ? { ...turn, error } : turn)));
    } finally {
      setPending(false);
    }
  };

  const submit = (event: FormEvent) => { event.preventDefault(); void ask(message); };

  return (
    <div className="space-y-5">
      <Card
        title="Ask about the supplier data"
        subtitle="Answers are grounded in the anonymized dataset and cite the exact supplier, field and value. Each question is answered on its own; earlier questions are not remembered."
        actions={<ModeBadge status={status} />}
      >
        <form onSubmit={submit} className="space-y-3">
          <textarea
            ref={input}
            className={`${inputClass} w-full`}
            rows={2}
            maxLength={4000}
            value={message}
            onChange={event => setMessage(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void ask(message); } }}
            placeholder="e.g. Which of my shortlisted suppliers has the lowest cyber risk?"
            aria-label="Question"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" className="h-4 w-4 accent-amber-500" checked={useContext} onChange={event => setUseContext(event.target.checked)} disabled={!shortlist.ids.length} />
              Use my shortlist as context ({shortlist.ids.length} supplier{shortlist.ids.length === 1 ? '' : 's'})
            </label>
            <button type="submit" className={primaryButton} disabled={pending || !message.trim()}>{pending ? 'Asking…' : 'Ask'}</button>
          </div>
        </form>
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Try</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {EXAMPLES.map(example => (
              <button key={example} disabled={pending} onClick={() => void ask(example)} className="rounded-full bg-accent-soft px-3 py-1 text-left text-sm text-gray-900 ring-1 ring-amber-400 hover:bg-accent-soft disabled:opacity-50">
                {example}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {turns.map(turn => (
        <TurnView key={turn.id} turn={turn} shortlist={shortlist} onAddIds={onAddIds} onRetry={() => void ask(turn.question)} retryDisabled={pending} />
      ))}
    </div>
  );
}

function ModeBadge({ status }: { status: Status | null }) {
  if (!status) return null;
  if (status.chat_mode === 'live' && status.model) return <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900 ring-1 ring-emerald-200">Live model · {status.model}</span>;
  if (status.chat_mode === 'data_only') return <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-200">Data-only mode · limited questions</span>;
  return <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-300">Model configuration incomplete</span>;
}

function TurnView({ turn, shortlist, onAddIds, onRetry, retryDisabled }: { turn: Turn; shortlist: Shortlist; onAddIds: (ids: string[]) => Promise<void>; onRetry: () => void; retryDisabled: boolean }) {
  const { response, error } = turn;
  const [addError, setAddError] = useState('');
  const { openSupplier } = useWorkspace();
  const newSuggestions = response?.suggested_supplier_ids.filter(id => !shortlist.has(id)) ?? [];

  return (
    <article className="rounded border border-gray-200 bg-white shadow-sm">
      <header className="border-b border-gray-100 px-5 py-3">
        <p className="font-medium text-gray-900">{turn.question}</p>
        {turn.contextIds.length > 0 && <p className="mt-0.5 text-xs text-gray-500">Context: {turn.contextIds.length} shortlisted supplier{turn.contextIds.length === 1 ? '' : 's'}</p>}
      </header>
      <div className="space-y-4 px-5 py-4">
        {!response && !error && <Spinner label="Looking up supplier data…" />}
        {error ? <AiError error={error} feature="The chat assistant" onRetry={retryDisabled ? undefined : onRetry} /> : null}
        {response && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {response.mode === 'live'
                ? <span className="rounded bg-emerald-50 px-2 py-0.5 font-medium text-emerald-900 ring-1 ring-emerald-200">Live · {response.model}</span>
                : <span className="rounded bg-amber-50 px-2 py-0.5 font-medium text-amber-900 ring-1 ring-amber-200">Data-only answer (no AI model)</span>}
            </div>
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-gray-900">{response.answer}</p>

            {response.warnings.length > 0 && (
              <ul className="space-y-1 rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-900 ring-1 ring-amber-200">
                {response.warnings.map(warning => <li key={warning}>⚠ {warning}</li>)}
              </ul>
            )}

            {response.evidence.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Evidence from the dataset</p>
                <div className="mt-1.5 overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-600"><tr><th className="px-3 py-2">Supplier</th><th className="px-3 py-2">Field</th><th className="px-3 py-2 text-right">Value</th></tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {response.evidence.map(item => (
                        <tr key={`${item.supplier_id}:${item.field}`}>
                          <td className="px-3 py-1.5"><button onClick={() => openSupplier(item.supplier_id)} className="font-mono text-xs font-semibold hover:text-gray-900 hover:underline" title={`View ${item.supplier_id} profile`}>{item.supplier_id}</button></td>
                          <td className="px-3 py-1.5"><span className="text-gray-900">{fieldLabel(item.field)}</span> <code className="ml-1 text-[11px] text-gray-500">{item.field}</code></td>
                          <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{formatValue(item.value, item.field)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {response.suggested_supplier_ids.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-gray-600">Suggested:</span>
                {response.suggested_supplier_ids.map(id => (
                  <span key={id} className={`rounded px-2 py-0.5 font-mono text-xs font-semibold ring-1 ${shortlist.has(id) ? 'bg-accent-soft text-gray-900 ring-amber-400' : 'bg-gray-50 ring-gray-200'}`}>{id}{shortlist.has(id) && ' ✓'}</span>
                ))}
                {newSuggestions.length > 0 && (
                  <Btn
                    variant="secondary"
                    disabled={shortlist.items.length + newSuggestions.length > 20}
                    onClick={() => onAddIds(newSuggestions).catch(reason => setAddError(reason instanceof Error ? reason.message : String(reason)))}
                  >
                    Add {newSuggestions.length} to shortlist
                  </Btn>
                )}
                {addError && <span className="text-red-700">{addError}</span>}
              </div>
            )}

            {response.tool_calls.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-gray-600">Data used ({response.tool_calls.length} lookup{response.tool_calls.length === 1 ? '' : 's'})</summary>
                <ul className="mt-2 space-y-1">
                  {response.tool_calls.map((call, index) => (
                    <li key={index} className="rounded bg-gray-50 px-3 py-1.5 font-mono text-xs text-gray-700">
                      <span className={call.status === 'completed' ? 'text-emerald-700' : 'text-red-700'}>{call.status === 'completed' ? '✓' : '✕'}</span> {call.name}({JSON.stringify(call.arguments)})
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>
    </article>
  );
}
