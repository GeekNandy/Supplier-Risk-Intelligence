import { IxButton, IxMessageBar, IxPill } from '@siemens/ix-react';
import { iconError, iconSuccess, iconWarning, iconWarningRhomb } from '@siemens/ix-icons/icons';
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ApiError } from './api';

// Dataset level -> iX status variant + icon, so a level is never shown by colour alone.
const LEVEL_PILL: Record<string, { variant: 'success' | 'warning' | 'critical' | 'alarm'; icon: string }> = {
  Low: { variant: 'success', icon: iconSuccess },
  Medium: { variant: 'warning', icon: iconWarning },
  High: { variant: 'critical', icon: iconWarningRhomb },
  Critical: { variant: 'alarm', icon: iconError },
};

export function LevelBadge({ level }: { level: string | null }) {
  const style = level ? LEVEL_PILL[level] : undefined;
  return (
    <IxPill variant={style?.variant ?? 'neutral'} icon={style?.icon} outline={!style} className="align-middle">
      {level ?? 'Unknown'}
    </IxPill>
  );
}

type BtnProps = Omit<ComponentProps<typeof IxButton>, 'variant'> & { variant?: 'primary' | 'secondary' | 'tertiary'; title?: string };

/** iX button. A title is shown on a wrapper so the tooltip also works while the button is disabled. */
export function Btn({ variant = 'secondary', title, children, ...props }: BtnProps) {
  const button = <IxButton variant={variant} {...props}>{children}</IxButton>;
  return title ? <span title={title} className="inline-flex">{button}</span> : button;
}

/** 0–100 risk score as a number plus a bar; the bar is decorative, the number is the data. */
export function ScoreBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-500">Unknown</span>;
  return (
    <span className="flex items-center gap-2">
      <span className="w-7 text-right font-mono font-semibold tabular-nums">{value}</span>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100" aria-hidden>
        <span className="block h-full rounded-full bg-gray-500" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </span>
    </span>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-gray-600">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-accent" aria-hidden />
      {label}
    </span>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div>
    <IxMessageBar type="alarm" persistent>
      <span className="flex flex-wrap items-center justify-between gap-3">
        <span>{message}</span>
        {onRetry && <Btn variant="secondary" onClick={onRetry}>Retry</Btn>}
      </span>
    </IxMessageBar>
    </div>
  );
}

/** Shown when a contracted AI route returns 501/404 because the backend has not shipped it. */
export function Unavailable({ feature }: { feature: string }) {
  return (
    <div>
    <IxMessageBar type="info" persistent>
      <strong className="font-semibold">{feature} is temporarily unavailable.</strong> The server has not enabled this route yet. Supplier search and comparison keep working.
    </IxMessageBar>
    </div>
  );
}

export function AiError({ error, feature, onRetry }: { error: unknown; feature: string; onRetry?: () => void }) {
  if (error instanceof ApiError && error.notImplemented) return <Unavailable feature={feature} />;
  return <ErrorBox error={error} onRetry={onRetry} />;
}

export function Card({ title, subtitle, actions, children, className = '' }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`sri-card ${className}`}>
      {(title || actions) && (
        <header className="sri-card-header">
          <div>
            {title && <h2 className="text-base font-semibold text-gray-900">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-gray-600">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="sri-card-body">{children}</div>
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
    <span className="block" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      <span id={id} className="sr-only">{text}</span>
      {anchor && createPortal(
        <span
          aria-hidden
          className="pointer-events-none fixed z-50 w-64 rounded border border-gray-300 bg-[var(--theme-color-4)] px-3 py-2 text-xs leading-snug text-gray-900 shadow-lg"
          style={{ left: Math.min(anchor.right + 8, window.innerWidth - 272), top: anchor.top }}
        >
          {text}
        </span>,
        document.body,
      )}
    </span>
  );
}

export const inputClass = 'sri-field text-sm';
// Native buttons kept for form submission, styled to match ix-button.
export const primaryButton = 'inline-flex min-h-9 items-center justify-center rounded bg-accent px-4 py-1.5 text-sm font-semibold text-on-accent hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-[var(--theme-color-primary--disabled)] disabled:text-gray-500';
export const secondaryButton = 'inline-flex min-h-9 items-center justify-center rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50';

/** Small uppercase section label used in "model-card" layouts. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="sri-label">{children}</p>;
}

export function Pill({ children, tone = 'gray', mono = false }: { children: ReactNode; tone?: 'gray' | 'accent' | 'sample'; mono?: boolean }) {
  const variant = tone === 'accent' ? 'primary' : tone === 'sample' ? 'warning' : 'neutral';
  return <IxPill variant={variant} outline={tone === 'gray'} className={mono ? 'font-mono' : ''}>{children}</IxPill>;
}

/** ⓘ trigger with a definition tooltip; keyboard focusable. */
export function InfoTip({ id, text, label = 'More information' }: { id: string; text: string; label?: string }) {
  return (
    <span className="inline-block align-middle [&>span]:inline-block">
      <Tip id={id} text={text}>
        <button type="button" className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-[11px] font-semibold normal-case text-gray-500 ring-1 ring-gray-300 hover:text-accent" aria-label={label} aria-describedby={id}>i</button>
      </Tip>
    </span>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-100 ${className}`} aria-hidden />;
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
    <div className="rounded border border-dashed border-gray-300 px-6 py-12 text-center">
      <p className="font-semibold text-gray-900">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-xl text-sm text-gray-600">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** iX warning message: what is missing and what to do. */
export function WarningBox({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div>
    <IxMessageBar type="warning" persistent>
      <span className="flex flex-wrap items-start justify-between gap-4">
        <span>
          <strong className="block font-bold">{title}</strong>
          {children && <span className="mt-1 block">{children}</span>}
        </span>
        {action}
      </span>
    </IxMessageBar>
    </div>
  );
}

/** Slim one-line iX info message with an expandable "Learn more". */
export function InfoLine({ children, more }: { children: ReactNode; more?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
    <IxMessageBar type="info" persistent>
      <span>
        {children}
        {more && <> <button type="button" className="font-bold text-accent underline underline-offset-2" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Show less' : 'Learn more'}</button></>}
      </span>
      {open && more && <span className="mt-1 block text-gray-600">{more}</span>}
    </IxMessageBar>
    </div>
  );
}

/** Title + one-sentence purpose line used at the top of each view. */
export function ViewHeader({ title, purpose, actions }: { title: string; purpose: string; actions?: ReactNode }) {
  return (
    <div className="sri-view-header">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">{title}</h2>
        <p className="mt-1 text-sm text-gray-600">{purpose}</p>
      </div>
      {actions}
    </div>
  );
}
