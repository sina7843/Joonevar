import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { buyerInquiries, buyerRisk, sellerInquiries } from '../../../src/marketplace/inquiries.ts';
import { INQUIRY_STATUS_FA, type InquiryStatus } from '../../../src/marketplace/inquiry-model.ts';

export const dynamic = 'force-dynamic';

const dateTimeFa = (value: Date | null) =>
  value === null
    ? '—'
    : new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(value);

const moneyFa = (value: bigint | null) => (value === null ? '—' : value.toLocaleString('fa-IR'));

const statusFa = (status: string) => INQUIRY_STATUS_FA[status as InquiryStatus] ?? status;

/**
 * The two sides of one list — PROMPT-005.
 *
 * What this account asked for, and what has been asked of it. They are the same
 * kind of row read from two directions, so they are shown together rather than
 * in two screens that drift apart.
 */
export default async function PurchasesPage() {
  const guard = await guardRoute('/account/purchases');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  const [mine, incoming, risk] = await Promise.all([
    buyerInquiries(db(), actor),
    sellerInquiries(db(), actor),
    buyerRisk(db(), actor.accountId),
  ]);

  return (
    <PublicShell actor={actor} title="درخواست‌های خرید" pathname="/account/purchases">
      <div className="space-y-lg p-lg">
        {risk.blocked ? (
          <div data-testid="risk-notice">
            <Alert tone="warning" title="امکان ثبت درخواست تازه فعلاً بسته است">
              {risk.reasonFa}
            </Alert>
          </div>
        ) : null}

        <Card>
          <h2 className="text-label-lg">درخواست‌های من</h2>
          {mine.length === 0 ? (
            <p className="mt-sm text-caption text-text-secondary" data-testid="my-inquiries-empty">
              هنوز درخواست خریدی ثبت نکرده‌اید.
            </p>
          ) : (
            <ul className="mt-lg space-y-sm" data-testid="my-inquiries">
              {mine.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-sm" data-testid={'my-inquiry-' + row.id}>
                  <Link href={'/account/purchases/' + row.id} className="text-text-brand">
                    {row.listingTitleFa}
                  </Link>
                  <StatusBadge tone={row.status === 'CONVERTED' ? 'success' : 'neutral'}>
                    {statusFa(row.status)}
                  </StatusBadge>
                  <span className="text-caption text-text-secondary">
                    قیمت نهایی: {moneyFa(row.finalPriceToman)} تومان
                  </span>
                  {row.paymentDeadlineAt ? (
                    <span className="text-caption text-text-secondary">
                      مهلت پرداخت: {dateTimeFa(row.paymentDeadlineAt)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="text-label-lg">درخواست‌های رسیده به آگهی‌های من</h2>
          {incoming.length === 0 ? (
            <p className="mt-sm text-caption text-text-secondary" data-testid="incoming-inquiries-empty">
              درخواستی برای آگهی‌های شما ثبت نشده است.
            </p>
          ) : (
            <ul className="mt-lg space-y-sm" data-testid="incoming-inquiries">
              {incoming.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center gap-sm"
                  data-testid={'incoming-inquiry-' + row.id}
                >
                  <Link href={'/account/purchases/' + row.id} className="text-text-brand">
                    {row.listingTitleFa}
                  </Link>
                  <StatusBadge tone={row.status === 'CONVERTED' ? 'success' : 'neutral'}>
                    {statusFa(row.status)}
                  </StatusBadge>
                  <span className="text-caption text-text-secondary">
                    بیعانه: {moneyFa(row.depositAmountToman)} تومان
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PublicShell>
  );
}
