import { guardRoute } from '../../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../../src/ui/shell.tsx';
import { Alert } from '../../../../../src/ui/alert.tsx';
import { ButtonLink } from '../../../../../src/ui/button.tsx';
import { PageHeader } from '../../../../../src/ui/section-header.tsx';
import { PageCrumbs } from '../../../../../src/ui/page-crumbs.tsx';
import { EmptyState } from '../../../../../src/ui/states.tsx';
import { ActionOwner, StatusBadge } from '../../../../../src/ui/status.tsx';
import { ConversationList } from '../../../../../src/ui/conversation.tsx';
import { db } from '../../../../../src/db/client.ts';
import { AppError } from '../../../../../src/domain/errors.ts';
import { sellerListing, type ListingDetail } from '../../../../../src/marketplace/listings.ts';
import { sellerInquiries } from '../../../../../src/marketplace/inquiries.ts';
import { AcceptInquiryForm } from '../../../purchases/forms.tsx';

export const dynamic = 'force-dynamic';

const moneyFa = (value: bigint | null) => (value === null ? 'تعیین‌نشده' : value.toLocaleString('fa-IR') + ' تومان');
const dateFa = (value: Date) => new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeZone: 'Asia/Tehran' }).format(value);

/** A thread that can take no new move shows its final status in the list. */
const CLOSED = new Set(['DECLINED', 'WITHDRAWN', 'EXPIRED', 'COMPLETED', 'CLOSED']);

/**
 * Every request for one advert — PROMPT-005, DS P12 / K17: the advert's
 * context card, then the ConversationList (one row per buyer thread, its last
 * message and time). The thread itself, with the composer and the offer
 * actions, opens at /account/purchases/[id].
 *
 * Several people may be asking at once and all of them stay open; the seller
 * picks one. Acceptance appears only where a final price is already locked,
 * because the deposit is a fraction of that number. Buyers are named by role
 * and request date: no name or number reaches the seller before a deposit.
 */
export default async function ListingRequestsPage({ params }: { params: Promise<{ id: string }> }) {
  const guard = await guardRoute('/account/listings');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { id } = await params;

  let detail: ListingDetail;
  try {
    detail = await sellerListing(db(), guard.actor, id);
  } catch (error) {
    if (error instanceof AppError) return <RecordNotFound error={error} />;
    throw error;
  }

  const requests = await sellerInquiries(db(), guard.actor, id);
  const accepted = requests.find((row) => row.status === 'ACCEPTED' || row.status === 'CONVERTED') ?? null;
  const { listing, animal } = detail;
  const title = animal.nameFa ?? 'بدون نام';
  const open = requests.filter((row) => !CLOSED.has(row.status)).length;
  const sub = [animal.breedFa, detail.cityFa].filter(Boolean).join('، ');

  return (
    <PublicShell
      actor={guard.actor}
      title="درخواست‌های آگهی"
      pathname="/account/listings"
      header={
        <div>
          <PageCrumbs
            items={[
              { href: '/dashboard', name: 'خانه' },
              { href: '/account/listings', name: 'آگهی‌های من' },
              { href: '/account/listings/' + id, name: title },
              { name: 'درخواست‌ها' },
            ]}
          />
          <PageHeader
            title="درخواست‌های آگهی"
            back={{ href: '/account/listings/' + id, label: 'بازگشت به آگهی' }}
            meta={
              requests.length > 0
                ? [requests.length.toLocaleString('fa-IR') + ' گفتگو', open.toLocaleString('fa-IR') + ' گفتگوی باز']
                : undefined
            }
            actions={
              <ButtonLink tone="secondary" href={'/account/listings/' + id} className="hz-show-md" data-testid="back-to-listing">
                بازگشت به آگهی
              </ButtonLink>
            }
          />
        </div>
      }
    >
      {/* Context summary (K17): which advert these conversations are about. */}
      <section className="hz-card flex flex-wrap items-center gap-lg" aria-label={'آگهی ' + title} data-testid="listing-context">
        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-2xs">
          <div className="flex flex-wrap items-center gap-sm">
            <span className="hz-h4">{title}</span>
            <StatusBadge status={listing.status} size="sm" />
          </div>
          {sub ? <span className="text-caption text-text-secondary">{sub}</span> : null}
          {listing.publishedAt ? (
            <span className="text-caption text-text-secondary">
              {'منتشرشده ' + dateFa(listing.publishedAt) + (listing.expiresAt ? '، اعتبار تا ' + dateFa(listing.expiresAt) : '')}
            </span>
          ) : null}
        </div>
        {listing.priceToman !== null ? (
          <div className="hz-price">
            <span className="hz-price__amount">{listing.priceToman.toLocaleString('fa-IR')}</span>
            <span className="hz-price__unit">تومان</span>
            {listing.priceMode === 'NEGOTIABLE' ? <span className="hz-price__mode">قابل مذاکره</span> : null}
          </div>
        ) : null}
        <ButtonLink tone="secondary" size="sm" href={'/account/listings/' + id}>
          مشاهده آگهی
        </ButtonLink>
      </section>

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
        <ConversationList
          testId="listing-requests"
          countFa={requests.length.toLocaleString('fa-IR') + ' گفتگو'}
          items={requests.map((row) => ({
            id: row.id,
            href: '/account/purchases/' + row.id,
            name: 'خریدار، درخواست ' + dateFa(row.createdAt),
            context:
              title +
              (row.finalPriceToman !== null ? '، قیمت نهایی ' + moneyFa(row.finalPriceToman) : '') +
              (row.depositAmountToman !== null ? '، بیعانه ' + moneyFa(row.depositAmountToman) : ''),
            last: row.lastMessage ? (row.lastMessage.mine ? 'شما: ' : '') + row.lastMessage.textFa : null,
            at: row.lastMessage?.at ?? row.createdAt,
            // CONVERTED (deposit paid, advert reserved) is the dictionary's RESERVED.
            closedStatus: CLOSED.has(row.status) ? row.status : undefined,
            testId: 'listing-request-' + row.id,
          }))}
        >
          {(item) => {
            const row = requests.find((candidate) => candidate.id === item.id)!;
            const canAccept = row.status === 'OPEN' && row.finalPriceToman !== null && accepted === null;
            const live = !CLOSED.has(row.status);
            return live ? (
              <div className="flex flex-wrap items-center gap-sm px-lg pb-md">
                <StatusBadge status={row.status === 'CONVERTED' ? 'RESERVED' : row.status} size="sm" />
                {canAccept ? <ActionOwner owner="USER" /> : null}
                {canAccept ? <AcceptInquiryForm inquiryId={row.id} listingId={id} version={row.version} /> : null}
              </div>
            ) : null;
          }}
        </ConversationList>
      )}
    </PublicShell>
  );
}
