import type { ReactNode } from 'react';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

const TONE: Record<StatusTone, string> = {
  neutral: 'bg-status-neutral-bg text-status-neutral-text border-status-neutral-border',
  info: 'bg-status-info-bg text-status-info-text border-status-info-border',
  success: 'bg-status-success-bg text-status-success-text border-status-success-border',
  warning: 'bg-status-warning-bg text-status-warning-text border-status-warning-border',
  error: 'bg-status-error-bg text-status-error-text border-status-error-border',
};

/**
 * Status badge. A tone is chosen by the caller from the product meaning of the
 * state; the badge never reinterprets it, and a warning is never rendered the
 * same way as a rejection (§24.3).
 */
export function StatusBadge({ tone = 'neutral', children }: { tone?: StatusTone; children: ReactNode }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-xs rounded-full border px-md py-2xs text-label-sm',
        'min-h-[var(--size-badge-sm)] whitespace-nowrap',
        TONE[tone],
      ].join(' ')}
    >
      <span aria-hidden="true" className="size-[6px] rounded-full bg-current" />
      {children}
    </span>
  );
}

/**
 * An identifier stays left-to-right inside Persian text. `bdi` plus explicit
 * isolation keeps the stored value untouched while it renders correctly (§24.3).
 */
export function Identifier({ value, label }: { value: string; label?: string }) {
  return (
    <span className="inline-flex items-center gap-xs">
      {label ? <span className="text-text-secondary">{label}</span> : null}
      <bdi className="hz-ltr font-mono text-label-md" data-testid="identifier">
        {value}
      </bdi>
    </span>
  );
}

/**
 * Who the next action belongs to (§8, §24.3). A waiting state must never leave
 * this unanswered, so the label is a required part of every waiting card.
 */
export type ActionOwnerKind = 'USER' | 'VET' | 'ASSOCIATION' | 'GENETICS_CENTRE' | 'COUNTERPARTY' | 'SYSTEM';

const OWNER_FA: Record<ActionOwnerKind, string> = {
  USER: 'شما',
  VET: 'دامپزشک معتمد',
  ASSOCIATION: 'انجمن',
  GENETICS_CENTRE: 'مرکز ژنتیک',
  COUNTERPARTY: 'طرف مقابل',
  SYSTEM: 'همزیست',
};

export function ActionOwner({ owner }: { owner: ActionOwnerKind }) {
  return (
    <p className="text-caption text-text-secondary">
      اقدام بعدی با: <span className="text-text-primary">{OWNER_FA[owner]}</span>
    </p>
  );
}
