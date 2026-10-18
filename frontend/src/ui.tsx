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
  if (value === null) return <span className="text-gray-500">Unknown</span>;
  return (
    <span className="flex items-center gap-2">
      <span className="w-7 text-right font-semibold tabular-nums">{value}</span>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-200" aria-hidden>
        <span className="block h-full rounded-full bg-gray-700" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </span>
    </span>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-gray-600">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" aria-hidden />
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
    <div role="status" className="rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-700">
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
    <section className={`rounded-xl border border-gray-200 bg-gradient-to-b from-gray-50 to-white transition-colors hover:border-gray-300 ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div>
            {title && <h2 className="text-lg font-semibold text-gray-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-gray-600">{subtitle}</p>}
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
          className="pointer-events-none fixed z-50 w-64 rounded-md bg-gray-900 px-3 py-2 text-xs leading-snug text-white shadow-lg"
          style={{ left: Math.min(anchor.right + 8, window.innerWidth - 272), top: anchor.top }}
        >
          {text}
        </span>,
        document.body,
      )}
    </div>
  );
}

export const inputClass = 'rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-900/10';
export const primaryButton = 'rounded-md bg-accent px-4 py-2 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-amber-400 hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500 disabled:ring-gray-200';
export const secondaryButton = 'rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-800 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50';

/** Small uppercase section label used in "model-card" layouts. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{children}</p>;
}

export function Pill({ children, tone = 'gray', mono = false }: { children: ReactNode; tone?: 'gray' | 'accent' | 'sample'; mono?: boolean }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-700 ring-gray-200',
    accent: 'bg-accent-soft text-gray-900 ring-amber-300',
    sample: 'bg-amber-100 text-amber-950 ring-amber-400',
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]} ${mono ? 'font-mono' : ''}`}>{children}</span>;
}

/** ⓘ trigger with a definition tooltip; keyboard focusable. */
export function InfoTip({ id, text, label = 'More information' }: { id: string; text: string; label?: string }) {
  return (
    <span className="inline-block align-middle">
      <Tip id={id} text={text}>
        <button type="button" className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-[11px] font-semibold text-gray-500 ring-1 ring-gray-300 hover:text-gray-900" aria-label={label} aria-describedby={id}>i</button>
      </Tip>
    </span>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-gray-200/70 ${className}`} aria-hidden />;
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => <Skeleton key={index} className="h-9 w-full" />)}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 px-6 py-10 text-center">
      <p className="font-semibold text-gray-900">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-xl text-sm text-gray-600">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Amber warning: what is missing and what to do. */
export function WarningBox({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <div>
        <p className="font-semibold">⚠ {title}</p>
        {children && <div className="mt-0.5">{children}</div>}
      </div>
      {action}
    </div>
  );
}

/** Title + one-sentence purpose line used at the top of each view. */
export function ViewHeader({ title, purpose, actions }: { title: string; purpose: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-gray-900">{title}</h2>
        <p className="mt-1 text-gray-600">{purpose}</p>
      </div>
      {actions}
    </div>
  );
}
