import { guardRoute } from '../../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../../src/ui/shell.tsx';
import { Alert } from '../../../../../src/ui/alert.tsx';
import { ButtonLink } from '../../../../../src/ui/button.tsx';
import { PageHeader } from '../../../../../src/ui/section-header.tsx';
import { PageCrumbs } from '../../../../../src/ui/page-crumbs.tsx';
import { EmptyState } from '../../../../../src/ui/states.tsx';
import { ActionOwner, StatusBadge } from '../../../../../src/ui/status.tsx';
import { db } from '../../../../../src/db/client.ts';
import { AppError } from '../../../../../src/domain/errors.ts';
import { sellerListing } from '../../../../../src/marketplace/listings.ts';
import { sellerInquiries } from '../../../../../src/marketplace/inquiries.ts';
import { INQUIRY_STATUS_FA, type InquiryStatus } from '../../../../../src/marketplace/inquiry-model.ts';
import { AcceptInquiryForm } from '../../../purchases/forms.tsx';

export const dynamic = 'force-dynamic';

const moneyFa = (value: bigint | null) => (value === null ? 'تعیین‌نشده' : value.toLocaleString('fa-IR') + ' تومان');

const dateTimeFa = (value: Date) =>
  new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(value);

/**
 * Every request for one advert — PROMPT-005. P05 list inside the advert.
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
    <PublicShell
      actor={guard.actor}
      title="درخواست‌های این آگهی"
      pathname="/account/listings"
      header={
        <div>
          <PageCrumbs
            items={[
              { href: '/dashboard', name: 'خانه' },
              { href: '/account/listings', name: 'آگهی‌های من' },
              { href: '/account/listings/' + id, name: 'آگهی' },
              { name: 'درخواست‌ها' },
            ]}
          />
          <PageHeader
            title="درخواست‌های این آگهی"
            back={{ href: '/account/listings/' + id, label: 'بازگشت به آگهی' }}
            meta={requests.length > 0 ? [requests.length.toLocaleString('fa-IR') + ' درخواست'] : undefined}
            actions={
              <ButtonLink tone="secondary" href={'/account/listings/' + id} className="hz-show-md" data-testid="back-to-listing">
                بازگشت به آگهی
              </ButtonLink>
            }
          />
        </div>
      }
    >
      {accepted ? (
        <div data-testid="one-accepted-notice">
          <Alert tone="info" title="یک درخواست در جریان است">
            تا پایان مهلت پرداخت یا آزاد شدن آن، درخواست دیگری پذیرفته نمی‌شود. سایر درخواست‌ها باز
            می‌مانند.
          </Alert>
        </div>
      ) : null}

      {requests.length === 0 ? (
        <div data-testid="requests-empty">
          <EmptyState
            icon="chatCircleDots"
            title="هنوز درخواستی برای این آگهی ثبت نشده است."
            description="درخواست خریداران پس از ارسال از صفحه عمومی آگهی اینجا می‌آید."
          />
        </div>
      ) : (
        <ul className="hz-cardlist" data-testid="listing-requests">
          {requests.map((row) => {
            const canAccept = row.status === 'OPEN' && row.finalPriceToman !== null && accepted === null;
            return (
              <li key={row.id} className="hz-cardlist__item" data-testid={'listing-request-' + row.id}>
                <div className="hz-cardlist__row">
                  <span className="hz-cardlist__title">{'درخواست ' + dateTimeFa(row.createdAt)}</span>
                  <StatusBadge tone={row.status === 'CONVERTED' ? 'success' : 'neutral'}>
                    {INQUIRY_STATUS_FA[row.status as InquiryStatus] ?? row.status}
                  </StatusBadge>
                </div>
                <span className="hz-cardlist__meta">
                  قیمت نهایی: {moneyFa(row.finalPriceToman)} · بیعانه: {moneyFa(row.depositAmountToman)}
                </span>
                <div className="hz-cardlist__row">
                  {canAccept ? <ActionOwner owner="USER" /> : <span />}
                  <ButtonLink tone="secondary" size="sm" href={'/account/purchases/' + row.id} iconStart="chatCircle">
                    گفت‌وگو
                  </ButtonLink>
                </div>
                {canAccept ? <AcceptInquiryForm inquiryId={row.id} listingId={id} version={row.version} /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </PublicShell>
  );
}
