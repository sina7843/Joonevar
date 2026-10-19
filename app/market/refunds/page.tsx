import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../src/ui/shell.tsx';
import { CaseItem, CaseList, QueueMeta } from '../../../src/ui/desk.tsx';
import { ageInDays, keyStatus } from '../../../src/ui/queue.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
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
      <QueueMeta
        total={queue.length}
        noun="استرداد در انتظار"
        oldestDays={queue.length > 0 ? Math.max(...queue.map((entry) => ageInDays(entry.createdAt) ?? 0)) : null}
      />
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
        <CaseList label="استردادهای در انتظار" testId="refund-queue">
          {queue.map((entry) => (
            <CaseItem
              key={entry.id}
              type="استرداد بیعانه"
              name={<span className="hz-num">{moneyFa(entry.amountToman) + ' تومان'}</span>}
              sub={
                <>
                  {entry.animalNameFa + ' · گیرنده: '}
                  <bdi dir="ltr">{entry.recipientMobile}</bdi>
                  {' · تلاش‌ها: ' + entry.attempts.toLocaleString('fa-IR') + ' · ' + when(entry.createdAt) + ' · '}
                  <Link href={'/account/purchases/' + entry.inquiryId} className="hz-link">
                    معامله
                  </Link>
                </>
              }
              ageDays={ageInDays(entry.createdAt)}
              status={{
                // GAPS #4: no dictionary key for MANUAL_REQUIRED — module label kept.
                ...keyStatus(entry.status, { tone: 'neutral', label: REFUND_STATUS_FA[entry.status] ?? entry.status }),
                testId: 'refund-status-' + entry.id,
              }}
              owner="SYSTEM"
              ownerLabel="مالی بازار"
              ownerIsUs
            >
              <div className="space-y-md">
                {entry.lastErrorFa ? (
                  <p className="text-caption text-text-secondary" data-testid={'refund-error-' + entry.id}>
                    آخرین خطا: {entry.lastErrorFa}
                  </p>
                ) : null}
                <RetryRefundForm refundId={entry.id} retryable={entry.retryable} />
                <ManualRefundForm refundId={entry.id} />
              </div>
            </CaseItem>
          ))}
        </CaseList>
      )}
    </OpsShell>
  );
}
