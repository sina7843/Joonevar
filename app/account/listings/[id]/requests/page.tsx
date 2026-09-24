import Link from 'next/link';
import { guardRoute } from '../../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../../src/ui/shell.tsx';
import { Card } from '../../../../../src/ui/card.tsx';
import { Alert } from '../../../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../../../src/ui/status.tsx';
import { db } from '../../../../../src/db/client.ts';
import { AppError } from '../../../../../src/domain/errors.ts';
import { sellerListing } from '../../../../../src/marketplace/listings.ts';
import { sellerInquiries } from '../../../../../src/marketplace/inquiries.ts';
import { INQUIRY_STATUS_FA, type InquiryStatus } from '../../../../../src/marketplace/inquiry-model.ts';
import { AcceptInquiryForm } from '../../../purchases/forms.tsx';

export const dynamic = 'force-dynamic';

const moneyFa = (value: bigint | null) => (value === null ? '—' : value.toLocaleString('fa-IR'));

const dateTimeFa = (value: Date) =>
  new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(value);

/**
 * Every request for one advert — PROMPT-005.
 *
 * Several people may be asking at once and all of them stay open; the seller
 * picks one. Acceptance appears only where a final price is already locked,
 * because the deposit is a fraction of that number and there is nothing to
 * accept before it exists.
 */
export default async function ListingRequestsPage({ params }: { params: Promise<{ id: string }> }) {
  const guard = await guardRoute('/account/listings');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { id } = await params;

  try {
    await sellerListing(db(), guard.actor, id);
  } catch (error) {
    if (error instanceof AppError) return <RecordNotFound error={error} />;
    throw error;
  }

  const requests = await sellerInquiries(db(), guard.actor, id);
  const accepted = requests.find((row) => row.status === 'ACCEPTED' || row.status === 'CONVERTED') ?? null;

  return (
    <PublicShell actor={guard.actor} title="درخواست‌های این آگهی" pathname="/account/listings">
      <div className="space-y-lg p-lg">
        <p className="text-caption">
          <Link href={'/account/listings/' + id} className="text-text-brand" data-testid="back-to-listing">
            بازگشت به آگهی
          </Link>
        </p>

        {accepted ? (
          <div data-testid="one-accepted-notice">
            <Alert tone="info" title="یک درخواست در جریان است">
              تا پایان مهلت پرداخت یا آزاد شدن آن، درخواست دیگری پذیرفته نمی‌شود. سایر درخواست‌ها باز
              می‌مانند.
            </Alert>
          </div>
        ) : null}

        <Card>
          <h2 className="text-label-lg">درخواست‌ها</h2>
          {requests.length === 0 ? (
            <p className="mt-sm text-caption text-text-secondary" data-testid="requests-empty">
              هنوز درخواستی برای این آگهی ثبت نشده است.
            </p>
          ) : (
            <ul className="mt-lg space-y-md" data-testid="listing-requests">
              {requests.map((row) => (
                <li
                  key={row.id}
                  className="rounded-md border border-border-subtle p-md"
                  data-testid={'listing-request-' + row.id}
                >
                  <div className="flex flex-wrap items-center gap-sm">
                    <StatusBadge tone={row.status === 'CONVERTED' ? 'success' : 'neutral'}>
                      {INQUIRY_STATUS_FA[row.status as InquiryStatus] ?? row.status}
                    </StatusBadge>
                    <span className="text-caption text-text-secondary">
                      قیمت نهایی: {moneyFa(row.finalPriceToman)} تومان
                    </span>
                    <span className="text-caption text-text-secondary">
                      بیعانه: {moneyFa(row.depositAmountToman)} تومان
                    </span>
                    <span className="text-caption text-text-secondary">{dateTimeFa(row.createdAt)}</span>
                    <Link href={'/account/purchases/' + row.id} className="text-text-brand">
                      گفت‌وگو
                    </Link>
                  </div>
                  {row.status === 'OPEN' && row.finalPriceToman !== null && accepted === null ? (
                    <div className="mt-sm">
                      <AcceptInquiryForm inquiryId={row.id} listingId={id} version={row.version} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PublicShell>
  );
}
