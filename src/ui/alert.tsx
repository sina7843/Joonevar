import type { ReactNode } from 'react';
import type { StatusTone } from './status.tsx';

const TONE: Record<StatusTone, string> = {
  neutral: 'bg-status-neutral-bg border-status-neutral-border text-status-neutral-text',
  info: 'bg-status-info-bg border-status-info-border text-status-info-text',
  success: 'bg-status-success-bg border-status-success-border text-status-success-text',
  warning: 'bg-status-warning-bg border-status-warning-border text-status-warning-text',
  error: 'bg-status-error-bg border-status-error-border text-status-error-text',
};

/**
 * Alert — reason for a lock, a limitation, a correction request or a warning.
 *
 * `role="alert"` is used only for messages the user must notice now (errors and
 * corrections). Advisory notices use `role="status"`, so a cooldown warning is
 * not announced with the urgency of a rejection (§24.3).
 */
export function Alert({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: StatusTone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const urgent = tone === 'error' || tone === 'warning';
  return (
    <div
      role={urgent ? 'alert' : 'status'}
      className={['rounded-lg border p-lg', TONE[tone]].join(' ')}
    >
      <p className="text-label-lg">{title}</p>
      {children ? <div className="mt-sm text-body-sm text-text-secondary">{children}</div> : null}
      {action ? <div className="mt-md">{action}</div> : null}
    </div>
  );
}
