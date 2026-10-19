import type { ReactNode } from 'react';
import { ButtonLink } from './button.tsx';
import { Icon } from './icon.tsx';
import type { IconName } from './icon-paths.ts';
import { ActionOwner, type ActionOwnerKind } from './status.tsx';

/**
 * The shared surface states of §8 and §26 — DS *PageStates* (`.hz-state`,
 * `.hz-skeleton`). Every list and case screen uses these instead of inventing
 * its own, so a locked card never simply disappears and a waiting state always
 * names the owner of the next action.
 */

export function LoadingState({ rows = 3, label = 'در حال بارگذاری' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="space-y-md">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="hz-card flex items-center gap-md">
          <span className="hz-skeleton hz-skeleton--thumb" />
          <span className="min-w-0 flex-1">
            <span className="hz-skeleton hz-skeleton--title" />
            <span className="hz-skeleton hz-skeleton--text" />
          </span>
          <span className="hz-skeleton hz-skeleton--pill" />
        </div>
      ))}
    </div>
  );
}

function StateBox({
  tone,
  icon,
  title,
  children,
  owner,
  action,
  compact = false,
  role,
}: {
  tone?: 'error' | 'warning' | 'waiting';
  icon: IconName;
  title: string;
  children?: ReactNode;
  owner?: ActionOwnerKind;
  action?: ReactNode;
  compact?: boolean;
  role?: 'alert' | 'status';
}) {
  return (
    <div
      role={role}
      className={['hz-state', tone ? 'hz-state--' + tone : '', compact ? 'hz-state--compact' : ''].join(' ').trim()}
    >
      <div className="hz-state__icon">
        <Icon name={icon} size="lg" />
      </div>
      <p className="hz-state__title">{title}</p>
      {children ? <div className="hz-state__body">{children}</div> : null}
      {owner ? <ActionOwner owner={owner} /> : null}
      {action ? <div className="hz-state__actions">{action}</div> : null}
    </div>
  );
}

/** Empty: the reason and the next step (DS rule 4). */
export function EmptyState({
  title,
  description,
  action,
  icon = 'tray',
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className="hz-card">
      <StateBox icon={icon} title={title} action={action} compact>
        {description}
      </StateBox>
    </div>
  );
}

/** A technical failure the user can retry. Distinct from a rejected request (§24.3). */
export function NetworkErrorState({ retryHref, compact = false }: { retryHref: string; compact?: boolean }) {
  return (
    <StateBox
      compact={compact}
      role="alert"
      tone="error"
      icon="wifiSlash"
      title="ارتباط برقرار نشد"
      action={
        <ButtonLink tone="secondary" href={retryHref} iconStart="arrowClockwise">
          تلاش دوباره
        </ButtonLink>
      }
    >
      اطلاعات این بخش دریافت نشد. داده واردشده شما حفظ شده است.
    </StateBox>
  );
}

/** Needs correction: the previous valid data and files are kept (§26). */
export function NeedsCorrectionState({ reason, correctionHref }: { reason: string; correctionHref: string }) {
  return (
    <StateBox
      role="alert"
      tone="warning"
      icon="notePencil"
      title="نیازمند اصلاح"
      owner="USER"
      action={<ButtonLink href={correctionHref}>اصلاح و ارسال دوباره</ButtonLink>}
    >
      {reason}
    </StateBox>
  );
}

/** Waiting on someone else. Never claims the review has succeeded (§26). */
export function WaitingState({ title, owner, detail }: { title: string; owner: ActionOwnerKind; detail?: string }) {
  return (
    <div className="hz-card">
      <StateBox tone="waiting" icon="hourglassMedium" title={title} owner={owner} compact>
        {detail}
      </StateBox>
    </div>
  );
}

/**
 * Marks a region whose contents are synthetic — DS *SyntheticNotice*. Placeholder
 * data must always be visibly labelled so a demo screen is never mistaken for
 * real records.
 */
export function SyntheticNotice({ children }: { children: ReactNode }) {
  return (
    <div data-synthetic="true" className="space-y-md">
      <div className="hz-synthetic" role="note" aria-label="داده نمایشی">
        <Icon name="flask" size="md" />
        <span>
          <b>داده نمایشی و ساختگی</b>، فقط برای بررسی الگوهای رابط کاربری، نه رکورد واقعی.
        </span>
      </div>
      <div>{children}</div>
    </div>
  );
}
