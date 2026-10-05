import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { PageHeader, SectionHeader } from '../../../src/ui/section-header.tsx';
import { PageCrumbs } from '../../../src/ui/page-crumbs.tsx';
import { KeyValueList } from '../../../src/ui/key-value.tsx';
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

  const tone = receipt.status === 'PAID' ? 'success' : receipt.status === 'FAILED' ? 'error' : 'warning';

  return (
    <PublicShell
      actor={guard.actor}
      title="رسید پرداخت"
      pathname="/payments"
      header={
        <div>
          <PageCrumbs
            items={[
              { name: 'خانه', href: '/dashboard' },
              { name: 'پرداخت‌ها', href: '/payments' },
              { name: receipt.serviceFa },
            ]}
          />
          <PageHeader
            title={receipt.serviceFa}
            back={{ href: '/payments' }}
            aside={<StatusBadge tone={tone}>{receipt.statusFa}</StatusBadge>}
            meta={['ثبت: ' + formatInstantFa(receipt.createdAt), 'رسید پرداخت']}
          />
        </div>
      }
    >
      <div className="grid items-start gap-xl lg:grid-cols-12">
        <div className="min-w-0 space-y-xl lg:col-span-8">
          <Card>
            <SectionHeader size="sm" title="اقلام" />
            <dl className="hz-kv mt-md" data-testid="receipt-lines">
              {receipt.lines.map((line) => (
                <div key={line.targetType + line.targetId} className="hz-kv__row">
                  <dt className="hz-kv__key">
                    <bdi dir="ltr">{line.targetType}</bdi>
                  </dt>
                  <dd className="hz-kv__value hz-num">{fa(line.amountToman) + ' تومان'}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-md text-caption text-text-secondary">
              مبلغ هر قلم در لحظه شروع پرداخت از داده مدیریت‌شده خوانده و روی همین رسید قفل شده است؛ تغییر بعدی تعرفه
              این رقم را عوض نمی‌کند.
            </p>
          </Card>

          {receipt.attempts.length > 0 ? (
            <Card>
              <SectionHeader size="sm" title="تلاش‌های پرداخت" />
              <ol className="hz-timeline mt-lg" data-testid="receipt-attempts">
                {receipt.attempts.map((attempt, index) => (
                  <li
                    key={index}
                    className={
                      'hz-timeline__item ' +
                      (attempt.status === 'VERIFIED'
                        ? 'hz-timeline__item--done'
                        : attempt.status === 'PENDING'
                          ? 'hz-timeline__item--current'
                          : 'hz-timeline__item--attention')
                    }
                  >
                    <span className="hz-timeline__marker" aria-hidden="true" />
                    <div className="hz-timeline__content">
                      <div className="hz-timeline__head">
                        <span className="hz-timeline__title">{ATTEMPT_FA[attempt.status] ?? attempt.status}</span>
                      </div>
                      <div className="hz-timeline__meta">{formatInstantFa(attempt.startedAt)}</div>
                      {attempt.failureReason ? <p className="hz-timeline__body">{attempt.failureReason}</p> : null}
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-xl lg:col-span-4" aria-label="وضعیت پرداخت">
          <Card>
            <SectionHeader size="sm" title="وضعیت پرداخت" />
            <div className="mt-md space-y-md" data-testid="receipt-facts">
              <div className="hz-price hz-price--lg">
                <span className="hz-price__amount">{fa(receipt.totalToman)}</span>
                <span className="hz-price__unit">تومان</span>
              </div>
              <KeyValueList
                rows={[
                  { key: 'تعداد قلم', value: fa(receipt.items) },
                  {
                    key: 'تأیید سرور',
                    value: receipt.paidAt ? formatInstantFa(receipt.paidAt) : null,
                    empty: 'تأیید نشده',
                  },
                  {
                    key: 'کد پیگیری درگاه',
                    value: receipt.providerRef ? (
                      <bdi dir="ltr" className="hz-id">
                        {receipt.providerRef}
                      </bdi>
                    ) : null,
                  },
                ]}
              />
              {receipt.status !== 'PAID' ? (
                <Alert tone="info" title="این پرداخت هنوز تأیید نشده است">
                  تا وقتی سرور پرداخت را با درگاه تأیید نکند، هیچ سند یا دوره‌ای بر پایه آن ساخته نمی‌شود.
                </Alert>
              ) : null}
              <ButtonLink href={receipt.originRoute} tone="secondary" block data-testid="receipt-continue">
                بازگشت به پرونده این پرداخت
              </ButtonLink>
              <Link href="/payments" className="hz-link hz-link--standalone">
                همه پرداخت‌ها
              </Link>
            </div>
          </Card>
        </aside>
      </div>
    </PublicShell>
  );
}
