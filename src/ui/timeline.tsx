import Link from 'next/link';
import { ActionOwner, StatusBadge, type ActionOwnerKind, type StatusTone } from './status.tsx';

/**
 * Animal timeline (§10) — DS *Timeline* (`.hz-timeline`).
 *
 * Every item carries the event, its time, its status, who the next action
 * belongs to, a short summary and a link that returns to that exact record,
 * not to a general list. An item the user must act on is marked `attention`.
 */
export interface TimelineItem {
  readonly id: string;
  readonly title: string;
  readonly whenFa: string;
  readonly status: { tone: StatusTone; label: string };
  readonly owner: ActionOwnerKind;
  readonly summary: string;
  readonly href: string;
  readonly ctaLabel: string;
}

const MARKER: Record<StatusTone, string> = {
  neutral: 'hz-timeline__item--upcoming',
  info: 'hz-timeline__item--current',
  warning: 'hz-timeline__item--attention',
  error: 'hz-timeline__item--attention',
  success: 'hz-timeline__item--done',
};

export function Timeline({ items }: { items: readonly TimelineItem[] }) {
  return (
    <ol className="hz-timeline">
      {items.map((item) => (
        <li key={item.id} className={'hz-timeline__item ' + MARKER[item.status.tone]}>
          <span className="hz-timeline__marker" aria-hidden="true" />
          <div className="hz-timeline__content">
            <div className="hz-timeline__head">
              <span className="hz-timeline__title">{item.title}</span>
              <StatusBadge tone={item.status.tone} size="sm">
                {item.status.label}
              </StatusBadge>
            </div>
            <div className="hz-timeline__meta">{item.whenFa}</div>
            <p className="hz-timeline__body">{item.summary}</p>
            <div className="hz-timeline__actions">
              <ActionOwner owner={item.owner} />
              <Link href={item.href} className="hz-link hz-link--standalone">
                {item.ctaLabel}
              </Link>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
