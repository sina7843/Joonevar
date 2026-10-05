import type { ReactNode } from 'react';
import type { StatusTone } from './status.tsx';
import { Icon } from './icon.tsx';
import type { IconName } from './icon-paths.ts';

/**
 * Alert — DS *Alert* (`.hz-alert`): reason for a lock, a limitation, a
 * correction request or a warning, in the tone of its status family.
 *
 * `role="alert"` only for what the user must notice now (errors and
 * corrections); advisory notices use `role="status"`, so a cooldown warning is
 * not announced with the urgency of a rejection (§24.3).
 */
const GLYPH: Record<StatusTone, IconName> = {
  neutral: 'info',
  info: 'info',
  success: 'checkCircle',
  warning: 'warning',
  error: 'warningCircle',
};

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
    <div role={urgent ? 'alert' : 'status'} className={'hz-alert hz-alert--' + tone}>
      {/* The glyph repeats the tone the colour already carries, so it stays out
          of the accessibility tree; the title is what is announced. */}
      <Icon name={GLYPH[tone]} size="sm" className="hz-alert__icon" />
      <div className="hz-alert__body">
        <span className="hz-alert__title">{title}</span>
        {children ? <div>{children}</div> : null}
        {action ? <div className="hz-alert__actions">{action}</div> : null}
      </div>
    </div>
  );
}
