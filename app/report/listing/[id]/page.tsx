import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { db } from '../../../../src/db/client.ts';
import { publicListing } from '../../../../src/marketplace/public-listings.ts';
import { MarketReportForm } from '../../../../src/marketplace/moderation-forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * Reporting an advert — Phase 3, PROMPT-004.
 *
 * Only a publicly visible advert is reportable, on the same terms every other
 * report has: a signed-in account, one open report per person per subject, and
 * the reporter's name never reaches the seller.
 */
export default async function ReportListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const path = '/report/listing/' + encodeURIComponent(id);
  const guard = await guardRoute(path);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const listing = await publicListing(db(), id);
  if (listing === null) notFound();

  return (
    <PublicShell actor={guard.actor} title="گزارش آگهی" pathname={path}>
      <div className="space-y-lg p-lg">
        <Card>
          <p className="text-caption text-text-secondary">آگهی</p>
          <h1 className="text-h4">
            <Link href={listing.path} className="hover:text-text-brand" data-testid="report-listing-title">
              {listing.titleFa}
            </Link>
          </h1>
          <p className="mt-xs text-body-sm text-text-secondary">
            گزارش شما به ناظر آگهی می‌رسد و با دلیل بررسی می‌شود. هر حساب برای هر موضوع تا بسته‌شدن بررسی،
            یک گزارش باز دارد. نام شما به فروشنده گفته نمی‌شود.
          </p>
        </Card>
        <Card>
          <MarketReportForm
            listingId={listing.id}
            media={listing.mediaFileIds.map((item) => ({
              id: item.id,
              altFa: item.altFa,
              kind: item.kind,
            }))}
          />
        </Card>
      </div>
    </PublicShell>
  );
}
