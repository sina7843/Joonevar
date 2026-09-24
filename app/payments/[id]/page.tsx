import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card, CardHeader } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { ButtonLink } from '../../../src/ui/button.tsx';
import { db } from '../../../src/db/client.ts';
import { myReceipt } from '../../../src/billing/receipts.ts';
import { AppError } from '../../../src/domain/errors.ts';
import { formatInstantFa } from '../../../src/content/model.ts';

export const dynamic = 'force-dynamic';

const fa = (value: bigint | number): string => value.toLocaleString('fa-IR');

const ATTEMPT_FA: Record<string, string> = {
  PENDING: 'در جریان',
  VERIFIED: 'تأییدشده',
  FAILED: 'ناموفق',
  CANCELLED: 'لغوشده',
};

/**
 * One receipt — Phase 2.5 §9 (PROMPT-015).
 *
 * Somebody else's payment is not found rather than refused, so this address
 * cannot be used to learn that a payment exists. What is shown is what the
 * record holds: the frozen amounts, where each price came from, the attempts
 * and the provider's own reference — never a key or a gateway payload.
 */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/payments/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  let receipt;
  try {
    receipt = await myReceipt(db(), guard.actor, id);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }

  return (
    <PublicShell actor={guard.actor} title="رسید پرداخت" pathname="/payments">
      <div className="space-y-lg">
        <Card>
          <CardHeader
            title={receipt.serviceFa}
            subtitle={'ثبت: ' + formatInstantFa(receipt.createdAt)}
            badge={{
              tone: receipt.status === 'PAID' ? 'success' : receipt.status === 'FAILED' ? 'error' : 'warning',
              label: receipt.statusFa,
            }}
          />
          <dl className="mt-lg grid gap-md text-body-sm sm:grid-cols-2" data-testid="receipt-facts">
            <div>
              <dt className="text-caption text-text-secondary">مبلغ کل</dt>
              <dd className="text-body-md">{fa(receipt.totalToman) + ' تومان'}</dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">تعداد قلم</dt>
              <dd className="text-body-md">{fa(receipt.items)}</dd>
            </div>
            {receipt.paidAt ? (
              <div>
                <dt className="text-caption text-text-secondary">تأیید سرور</dt>
                <dd className="text-body-md">{formatInstantFa(receipt.paidAt)}</dd>
              </div>
            ) : null}
            {receipt.providerRef ? (
              <div>
                <dt className="text-caption text-text-secondary">کد پیگیری درگاه</dt>
                <dd dir="ltr" className="text-body-md">
                  {receipt.providerRef}
                </dd>
              </div>
            ) : null}
          </dl>
          {receipt.status !== 'PAID' ? (
            <div className="mt-lg">
              <Alert tone="info" title="این پرداخت هنوز تأیید نشده است">
                تا وقتی سرور پرداخت را با درگاه تأیید نکند، هیچ سند یا دوره‌ای بر پایه آن ساخته نمی‌شود.
              </Alert>
            </div>
          ) : null}
        </Card>

        <Card>
          <h2 className="text-label-lg">اقلام</h2>
          <ul className="mt-md space-y-sm text-body-sm" data-testid="receipt-lines">
            {receipt.lines.map((line) => (
              <li key={line.targetType + line.targetId} className="flex flex-wrap items-center justify-between gap-sm rounded-md border border-border-subtle p-md">
                <span>{line.targetType}</span>
                <span>{fa(line.amountToman) + ' تومان'}</span>
              </li>
            ))}
          </ul>
          <p className="mt-md text-caption text-text-secondary">
            مبلغ هر قلم در لحظه شروع پرداخت از داده مدیریت‌شده خوانده و روی همین رسید قفل شده است؛ تغییر بعدی تعرفه این رقم را عوض نمی‌کند.
          </p>
        </Card>

        {receipt.attempts.length > 0 ? (
          <Card>
            <h2 className="text-label-lg">تلاش‌های پرداخت</h2>
            <ul className="mt-md space-y-xs text-body-sm" data-testid="receipt-attempts">
              {receipt.attempts.map((attempt, index) => (
                <li key={index}>
                  {formatInstantFa(attempt.startedAt) + ' — ' + (ATTEMPT_FA[attempt.status] ?? attempt.status)}
                  {attempt.failureReason ? ' · ' + attempt.failureReason : ''}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <div className="flex flex-wrap gap-md">
          <ButtonLink href="/payments" tone="secondary">
            همه پرداخت‌ها
          </ButtonLink>
          <Link href={receipt.originRoute} className="self-center text-body-sm text-text-brand" data-testid="receipt-continue">
            بازگشت به پرونده این پرداخت
          </Link>
        </div>
      </div>
    </PublicShell>
  );
}
