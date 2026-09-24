import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { AppError } from '../../../src/domain/errors.ts';
import { refundQueue } from '../../../src/marketplace/refunds.ts';
import { MAX_AUTOMATIC_REFUND_ATTEMPTS, REFUND_STATUS_FA } from '../../../src/marketplace/cancellation-model.ts';
import { ManualRefundForm, RetryRefundForm } from '../../../src/marketplace/settlement-forms.tsx';

export const dynamic = 'force-dynamic';

const moneyFa = (value: bigint) => value.toLocaleString('fa-IR');
const when = (value: Date) =>
  new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(value);

/**
 * Deposits owed back — PROMPT-006.
 *
 * A work queue, not a report: everything here is money that has been decided
 * and not yet sent. A row leaves this page only when a provider or a named bank
 * reference says it was paid.
 */
export default async function RefundQueuePage() {
  const guard = await guardRoute('/market/refunds');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  let queue;
  try {
    queue = await refundQueue(db(), guard.actor);
  } catch (error) {
    if (error instanceof AppError) return <AccessDenied error={error} />;
    throw error;
  }

  return (
    <OpsShell actor={guard.actor} title="استرداد بیعانه" nav={marketNav(guard.actor)} pathname="/market/refunds">
      <div className="space-y-lg">
        <Alert tone="info" title="هیچ مبلغی با زدن دکمه «پرداخت‌شده» نمی‌شود">
          <span data-testid="refund-policy-note">
            استرداد فقط وقتی پرداخت‌شده ثبت می‌شود که درگاه شماره پیگیری بدهد یا اپراتور شماره پیگیری بانکی
            را وارد کند. تلاش ناموفق با متن خطا نگه داشته می‌شود و پس از{' '}
            {MAX_AUTOMATIC_REFUND_ATTEMPTS.toLocaleString('fa-IR')} تلاش، پیگیری دستی لازم است.
          </span>
        </Alert>

        {queue.length === 0 ? (
          <div data-testid="refund-queue-empty">
            <EmptyState
              title="استرداد در انتظاری نیست"
              description="هر لغو یا رأیی که بیعانه را برگرداند، اینجا به‌عنوان کار باقی‌مانده می‌آید."
            />
          </div>
        ) : (
          <ul className="space-y-lg" data-testid="refund-queue">
            {queue.map((entry) => (
              <li key={entry.id}>
                <Card>
                  <div className="flex flex-wrap items-center gap-sm">
                    <StatusBadge tone={entry.status === 'FAILED' ? 'error' : 'neutral'}>
                      <span data-testid={'refund-status-' + entry.id}>
                        {REFUND_STATUS_FA[entry.status] ?? entry.status}
                      </span>
                    </StatusBadge>
                    <span className="text-label-lg">{moneyFa(entry.amountToman)} تومان</span>
                    <span className="text-caption text-text-secondary">{entry.animalNameFa}</span>
                    <span className="text-caption text-text-secondary">
                      گیرنده: <bdi className="hz-ltr font-mono">{entry.recipientMobile}</bdi>
                    </span>
                    <span className="text-caption text-text-secondary">
                      تلاش‌ها: {entry.attempts.toLocaleString('fa-IR')}
                    </span>
                    <span className="text-caption text-text-secondary">{when(entry.createdAt)}</span>
                    <Link href={'/account/purchases/' + entry.inquiryId} className="text-text-brand">
                      معامله
                    </Link>
                  </div>
                  {entry.lastErrorFa ? (
                    <p className="mt-sm text-caption text-text-secondary" data-testid={'refund-error-' + entry.id}>
                      آخرین خطا: {entry.lastErrorFa}
                    </p>
                  ) : null}
                  <div className="mt-lg space-y-lg">
                    <RetryRefundForm refundId={entry.id} retryable={entry.retryable} />
                    <ManualRefundForm refundId={entry.id} />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </OpsShell>
  );
}
