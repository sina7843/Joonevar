import { FocusHeading } from './focus-on-mount.tsx';
import type { ReactNode } from 'react';
import { Icon } from './icon.tsx';
import type { IconName } from './icon-paths.ts';
import { ActionOwner, StatusBadge } from './status.tsx';
import { KeyValueList, type KeyValueRow } from './key-value.tsx';

/**
 * PaymentResult — DS *PaymentResult* (`.hz-pay-result`, P08 return page): one
 * centred card rendering only what the server's verification found. The page
 * is never a receipt; `UNKNOWN` is a return the server could not match to any
 * payment (no badge — there is no payment status to show).
 */
export type PaymentResultState = 'PAID' | 'FAILED' | 'CANCELLED' | 'UNKNOWN';

const HEAD: Record<PaymentResultState, { icon: IconName; tone: string }> = {
  PAID: { icon: 'checkCircle', tone: 'hz-state--success' },
  FAILED: { icon: 'xCircle', tone: 'hz-state--error' },
  CANCELLED: { icon: 'xCircle', tone: '' },
  UNKNOWN: { icon: 'warningCircle', tone: 'hz-state--warning' },
};

export function PaymentResult({
  state,
  title,
  children,
  facts = [],
  next,
  actions,
  testId,
}: {
  state: PaymentResultState;
  title: string;
  /** One sentence from the server outcome. */
  children?: ReactNode;
  facts?: readonly KeyValueRow[];
  /** «قدم بعد» lines on success. */
  next?: readonly string[];
  actions?: ReactNode;
  testId?: string;
}) {
  const head = HEAD[state];
  return (
    <section className="hz-card hz-pay-result" aria-labelledby="pay-result-title" data-testid={testId}>
      <div className={['hz-state', head.tone].join(' ').trim()} role={state === 'PAID' ? 'status' : 'alert'}>
        <div className="hz-state__icon">
          <Icon name={head.icon} size="lg" />
        </div>
        {state === 'UNKNOWN' ? null : <StatusBadge status={state} />}
        <FocusHeading className="hz-state__title" id="pay-result-title">
          {title}
        </FocusHeading>
        {children ? <div className="hz-state__body">{children}</div> : null}
      </div>
      {facts.length > 0 ? <KeyValueList rows={facts} /> : null}
      {state === 'PAID' ? null : <ActionOwner owner="USER" />}
      <p className="hz-pay-result__notice">
        <Icon name="info" size="sm" />
        <span>
          {state === 'PAID'
            ? 'این صفحه رسید پرداخت نیست؛ وضعیت فقط بر اساس تأیید سرور همزیست اعلام می‌شود و سابقه آن در «پرداخت‌ها» می‌ماند.'
            : 'وضعیت پرداخت فقط بر اساس تأیید سرور اعلام می‌شود؛ رسیدن به این صفحه به‌تنهایی سند پرداخت نیست.'}
        </span>
      </p>
      {next && next.length > 0 ? (
        <div className="hz-pay-result__next">
          <p className="hz-pay-result__next-title">قدم بعد</p>
          <ul className="hz-pay-result__next-list">
            {next.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {actions ? <div className="hz-pay-result__actions">{actions}</div> : null}
    </section>
  );
}
