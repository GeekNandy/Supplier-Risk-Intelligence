import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ApiError } from './api';
import { levelStyle } from './format';

export function LevelBadge({ level }: { level: string | null }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${levelStyle(level).badge}`}>
      {level ?? 'Unknown'}
    </span>
  );
}

/** 0–100 risk score as a number plus a bar; the bar is decorative, the number is the data. */
export function ScoreBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-slate-500">Unknown</span>;
  return (
    <span className="flex items-center gap-2">
      <span className="w-7 text-right font-semibold tabular-nums">{value}</span>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200" aria-hidden>
        <span className="block h-full rounded-full bg-slate-700" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </span>
    </span>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-slate-600">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" aria-hidden />
      {label}
    </span>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
      <span>{message}</span>
      {onRetry && <button onClick={onRetry} className="rounded-md bg-white px-3 py-1 font-medium ring-1 ring-red-300 hover:bg-red-100">Retry</button>}
    </div>
  );
}

/** Shown when a contracted AI route returns 501/404 because the backend has not shipped it. */
export function Unavailable({ feature }: { feature: string }) {
  return (
    <div role="status" className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
      <strong className="font-semibold">{feature} is temporarily unavailable.</strong> The server has not enabled this route yet. Supplier search and comparison keep working.
    </div>
  );
}

export function AiError({ error, feature, onRetry }: { error: unknown; feature: string; onRetry?: () => void }) {
  if (error instanceof ApiError && error.notImplemented) return <Unavailable feature={feature} />;
  return <ErrorBox error={error} onRetry={onRetry} />;
}

export function Card({ title, subtitle, actions, children, className = '' }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            {title && <h2 className="text-base font-semibold text-slate-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-slate-600">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export const defId = (field: string) => `def-${field.replace(/\W+/g, '-')}`;

/**
 * Hover/focus tooltip for a short definition. Rendered in a fixed-position portal so table
 * cells and scroll containers can't cover or clip it; a hidden copy backs aria-describedby.
 */
export function Tip({ id, text, children }: { id: string; text?: string; children: ReactNode }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!anchor) return;
    const hide = () => setAnchor(null);
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [anchor]);
  if (!text) return <>{children}</>;
  const show = (event: { currentTarget: HTMLElement }) => setAnchor(event.currentTarget.getBoundingClientRect());
  const hide = () => setAnchor(null);
  return (
    <div onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      <span id={id} className="sr-only">{text}</span>
      {anchor && createPortal(
        <span
          aria-hidden
          className="pointer-events-none fixed z-50 w-64 rounded-md bg-slate-900 px-3 py-2 text-xs leading-snug text-white shadow-lg"
          style={{ left: Math.min(anchor.right + 8, window.innerWidth - 272), top: anchor.top }}
        >
          {text}
        </span>,
        document.body,
      )}
    </div>
  );
}

export const inputClass = 'rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20';
export const primaryButton = 'rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600';
export const secondaryButton = 'rounded-md bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
