import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { ButtonLink } from '../../../src/ui/button.tsx';
import { PageHeader, SectionHeader } from '../../../src/ui/section-header.tsx';
import { ActionOwner, StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { buyerInquiries, buyerRisk, sellerInquiries } from '../../../src/marketplace/inquiries.ts';
import { INQUIRY_STATUS_FA, type InquiryStatus } from '../../../src/marketplace/inquiry-model.ts';

export const dynamic = 'force-dynamic';

const dateTimeFa = (value: Date | null) =>
  value === null
    ? '—'
    : new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(value);

const moneyFa = (value: bigint | null) => (value === null ? 'تعیین‌نشده' : value.toLocaleString('fa-IR') + ' تومان');

const statusFa = (status: string) => INQUIRY_STATUS_FA[status as InquiryStatus] ?? status;

/**
 * The two sides of one list — PROMPT-005. P05 list, two sections.
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
  const fa = (n: number) => n.toLocaleString('fa-IR');

  return (
    <PublicShell
      actor={actor}
      title="درخواست‌های خرید"
      pathname="/account/purchases"
      header={
        <PageHeader
          title="درخواست‌های خرید"
          back={{ href: '/dashboard' }}
          meta={[
            ...(mine.length > 0 ? [fa(mine.length) + ' درخواست من'] : []),
            ...(incoming.length > 0 ? [fa(incoming.length) + ' درخواست رسیده'] : []),
          ]}
        />
      }
    >
      {risk.blocked ? (
        <div data-testid="risk-notice">
          <Alert tone="warning" title="امکان ثبت درخواست تازه فعلاً بسته است">
            {risk.reasonFa}
          </Alert>
        </div>
      ) : null}

      <section className="space-y-md" aria-labelledby="my-inquiries-title">
        <SectionHeader id="my-inquiries-title" title="درخواست‌های من" count={mine.length > 0 ? fa(mine.length) : undefined} />
        {mine.length === 0 ? (
          <div className="hz-card">
            <div className="hz-state hz-state--compact">
              <p className="hz-state__title" data-testid="my-inquiries-empty">
                هنوز درخواست خریدی ثبت نکرده‌اید.
              </p>
              <div className="hz-state__body">از بازار حیوان، آگهی موردنظر را باز کنید و درخواست خرید بفرستید.</div>
              <div className="hz-state__actions">
                <ButtonLink tone="secondary" href="/animals-market">
                  بازار حیوان
                </ButtonLink>
              </div>
            </div>
          </div>
        ) : (
          <ul className="hz-cardlist" data-testid="my-inquiries">
            {mine.map((row) => (
              <li key={row.id} className="hz-cardlist__item" data-testid={'my-inquiry-' + row.id}>
                <div className="hz-cardlist__row">
                  <Link href={'/account/purchases/' + row.id} className="hz-cardlist__title min-w-0 hover:underline">
                    {row.listingTitleFa}
                  </Link>
                  <StatusBadge tone={row.status === 'CONVERTED' ? 'success' : 'neutral'}>{statusFa(row.status)}</StatusBadge>
                </div>
                <span className="hz-cardlist__meta">قیمت نهایی: {moneyFa(row.finalPriceToman)}</span>
                {row.status === 'ACCEPTED' ? (
                  <ActionOwner owner="USER" extra={row.paymentDeadlineAt ? 'مهلت پرداخت: ' + dateTimeFa(row.paymentDeadlineAt) : undefined} />
                ) : row.status === 'OPEN' ? (
                  <ActionOwner owner="COUNTERPARTY" />
                ) : row.paymentDeadlineAt ? (
                  <span className="hz-cardlist__meta">مهلت پرداخت: {dateTimeFa(row.paymentDeadlineAt)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-md" aria-labelledby="incoming-inquiries-title">
        <SectionHeader
          id="incoming-inquiries-title"
          title="درخواست‌های رسیده به آگهی‌های من"
          count={incoming.length > 0 ? fa(incoming.length) : undefined}
        />
        {incoming.length === 0 ? (
          <div className="hz-card">
            <div className="hz-state hz-state--compact">
              <p className="hz-state__title" data-testid="incoming-inquiries-empty">
                درخواستی برای آگهی‌های شما ثبت نشده است.
              </p>
              <div className="hz-state__body">درخواست‌های خریداران برای آگهی‌های منتشرشده شما اینجا می‌آید.</div>
            </div>
          </div>
        ) : (
          <ul className="hz-cardlist" data-testid="incoming-inquiries">
            {incoming.map((row) => (
              <li key={row.id} className="hz-cardlist__item" data-testid={'incoming-inquiry-' + row.id}>
                <div className="hz-cardlist__row">
                  <Link href={'/account/purchases/' + row.id} className="hz-cardlist__title min-w-0 hover:underline">
                    {row.listingTitleFa}
                  </Link>
                  <StatusBadge tone={row.status === 'CONVERTED' ? 'success' : 'neutral'}>{statusFa(row.status)}</StatusBadge>
                </div>
                <span className="hz-cardlist__meta">بیعانه: {moneyFa(row.depositAmountToman)}</span>
                {row.status === 'OPEN' ? <ActionOwner owner="USER" /> : row.status === 'ACCEPTED' ? <ActionOwner owner="COUNTERPARTY" /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </PublicShell>
  );
}
