import Link from 'next/link';
import { ActionOwner, StatusBadge, type ActionOwnerKind, type StatusTone } from './status.tsx';

/**
 * Animal timeline (§10).
 *
 * Every item carries the event, its time, its status, who the next action
 * belongs to, a short summary and a link that returns to that exact record —
 * not to a general list.
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

export function Timeline({ items }: { items: readonly TimelineItem[] }) {
  return (
    <ol className="space-y-md">
      {items.map((item) => (
        <li key={item.id} className="rounded-lg border border-border-subtle bg-bg-surface p-lg">
          <div className="flex items-start justify-between gap-md">
            <div className="min-w-0">
              <p className="text-label-lg">{item.title}</p>
              <p className="mt-2xs text-caption text-text-secondary">{item.whenFa}</p>
            </div>
            <StatusBadge tone={item.status.tone}>{item.status.label}</StatusBadge>
          </div>
          <p className="mt-md text-body-sm text-text-secondary">{item.summary}</p>
          <div className="mt-sm flex items-center justify-between gap-md">
            <ActionOwner owner={item.owner} />
            <Link href={item.href} className="text-label-md text-text-brand underline underline-offset-4">
              {item.ctaLabel}
            </Link>
          </div>
        </li>
      ))}
    </ol>
  );
}
