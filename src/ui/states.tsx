import type { ReactNode } from 'react';
import { Alert } from './alert.tsx';
import { ButtonLink } from './button.tsx';
import { ActionOwner, type ActionOwnerKind } from './status.tsx';

/**
 * The shared surface states of §8 and §26. Every list and case screen uses
 * these instead of inventing its own, so a locked card never simply disappears
 * and a waiting state always names the owner of the next action.
 */

export function LoadingState({ rows = 3, label = 'در حال بارگذاری' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="space-y-md">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-24 animate-pulse rounded-lg bg-bg-subtle" />
      ))}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-subtle p-xl text-center">
      <p className="text-label-lg text-text-primary">{title}</p>
      <p className="mt-sm text-body-sm text-text-secondary">{description}</p>
      {action ? <div className="mt-lg flex justify-center">{action}</div> : null}
    </div>
  );
}

/** A technical failure the user can retry. Distinct from a rejected request (§24.3). */
export function NetworkErrorState({ retryHref }: { retryHref: string }) {
  return (
    <Alert tone="error" title="ارتباط برقرار نشد" action={<ButtonLink tone="secondary" href={retryHref}>تلاش دوباره</ButtonLink>}>
      اطلاعات این بخش دریافت نشد. داده واردشده شما حفظ شده است.
    </Alert>
  );
}

/** Needs correction: the previous valid data and files are kept (§26). */
export function NeedsCorrectionState({
  reason,
  correctionHref,
}: {
  reason: string;
  correctionHref: string;
}) {
  return (
    <Alert
      tone="warning"
      title="نیازمند اصلاح"
      action={<ButtonLink href={correctionHref}>اصلاح و ارسال دوباره</ButtonLink>}
    >
      {reason}
    </Alert>
  );
}

/** Waiting on someone else. Never claims the review has succeeded (§26). */
export function WaitingState({ title, owner, detail }: { title: string; owner: ActionOwnerKind; detail?: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-lg">
      <p className="text-label-lg">{title}</p>
      {detail ? <p className="mt-sm text-body-sm text-text-secondary">{detail}</p> : null}
      <div className="mt-md">
        <ActionOwner owner={owner} />
      </div>
    </div>
  );
}

/**
 * Marks a region whose contents are synthetic. Placeholder data must always be
 * visibly labelled so a demo screen is never mistaken for real records.
 */
export function SyntheticNotice({ children }: { children: ReactNode }) {
  return (
    <div
      data-synthetic="true"
      className="rounded-lg border border-dashed border-status-warning-border bg-status-warning-bg p-md"
    >
      <p className="text-label-sm text-status-warning-text">
        داده نمایشی و ساختگی — فقط برای بررسی الگوهای رابط کاربری، نه رکورد واقعی.
      </p>
      <div className="mt-md">{children}</div>
    </div>
  );
}
