import type { ReactNode } from 'react';
import { statusOf } from './status-dictionary.ts';
import { Icon } from './icon.tsx';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

/**
 * Status badge — DS *StatusBadge* (`.hz-badge`): dot + Persian label, one tone
 * per status family (draft/closed neutral, waiting info, action warning, done
 * success, blocked error). The tone says whose move it is; who acts next is
 * `ActionOwner`'s job, never the label's. `sm` (20px) is for tables, card lists
 * and timelines.
 */
export function StatusBadge({
  tone = 'neutral',
  size = 'md',
  status,
  children,
}: {
  tone?: StatusTone;
  size?: 'md' | 'sm';
  /** A status-dictionary key; its label and tone win over `tone` and children. */
  status?: string;
  children?: ReactNode;
}) {
  if (status !== undefined) {
    const entry = statusOf(status);
    if (entry !== null && entry.labelFa === null) return null;
    // Unknown key (data drift): neutral with the raw key, never a guessed tone — and said out loud.
    if (entry === null) console.warn('StatusBadge: unknown status key', status);
    tone = entry?.tone ?? 'neutral';
    children = entry?.labelFa ?? <bdi dir="ltr">{status}</bdi>;
  }
  return (
    <span className={['hz-badge', 'hz-badge--' + tone, size === 'sm' ? 'hz-badge--sm' : ''].join(' ').trim()}>
      <span className="hz-badge__dot" aria-hidden="true" />
      {children}
    </span>
  );
}

/**
 * An identifier stays left-to-right inside Persian text — DS *Identifier*:
 * `<bdi dir="ltr">`, 13/20 · 600, never wraps (§24.3).
 */
export function Identifier({ value, label }: { value: string; label?: string }) {
  return (
    <span className="hz-identifier">
      {label ? <span className="hz-identifier__label">{label}</span> : null}
      <bdi dir="ltr" data-testid="identifier">
        {value}
      </bdi>
    </span>
  );
}

/**
 * Who the next action belongs to (§8, §24.3) — DS *ActionOwner* (`.hz-owner`).
 * When the user must act the strip turns warning (`--you`). A waiting state must
 * never leave this unanswered.
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

export function ActionOwner({
  owner,
  extra,
  stack = false,
}: {
  owner: ActionOwnerKind;
  /** Deadline, amount or a short note at the inline end. */
  extra?: ReactNode;
  stack?: boolean;
}) {
  return (
    <div className={['hz-owner', owner === 'USER' ? 'hz-owner--you' : '', stack ? 'hz-owner--stack' : ''].join(' ').trim()}>
      <span>
        اقدام بعدی با: <b className="hz-owner__who">{OWNER_FA[owner]}</b>
      </span>
      {extra ? <span className="hz-owner__extra">{extra}</span> : null}
    </div>
  );
}

/**
 * DS status `TRUSTED` — the «معتمد» mark: success badge with `shield-check`
 * instead of the dot. Never has an opposite: an untrusted record shows nothing.
 */
export function TrustedMark() {
  return (
    <span className="hz-badge hz-badge--success">
      <Icon name="shieldCheck" size="xs" />
      معتمد
    </span>
  );
}
