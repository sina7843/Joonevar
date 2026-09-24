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
import { appealQueue, listingReportQueue } from '../../../src/marketplace/listing-moderation.ts';
import { REASON_FA, type ReportReason } from '../../../src/moderation/model.ts';
import { LISTING_STATUS_FA, type ListingStatus } from '../../../src/marketplace/listing-model.ts';
import { animalListings } from '../../../src/db/schema/marketplace.ts';
import { inArray } from 'drizzle-orm';
import { AppealDecisionForm, ListingDecisionForm } from '../../../src/marketplace/moderation-forms.tsx';

export const dynamic = 'force-dynamic';

const fa = (value: number): string => value.toLocaleString('fa-IR');
const when = (value: Date) =>
  new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(value);

/**
 * The listing moderation queue — Phase 3, PROMPT-004.
 *
 * Publication is direct, so this is where a human looks afterwards. The order
 * is a workload order computed from reports that really exist; the page says so
 * beside the numbers, because an advert many people disliked is not thereby an
 * advert that broke a rule.
 */
export default async function ListingModerationPage() {
  const guard = await guardRoute('/market/listings');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  let queue;
  let appeals;
  try {
    [queue, appeals] = await Promise.all([listingReportQueue(db(), actor), appealQueue(db(), actor)]);
  } catch (error) {
    if (error instanceof AppError) return <AccessDenied error={error} />;
    throw error;
  }

  // The version each decision form must carry, read now so a stale form is
  // refused rather than silently acting on a listing that moved meanwhile.
  const versions = new Map<string, number>();
  if (queue.length > 0) {
    const rows = await db()
      .select({ id: animalListings.id, version: animalListings.version })
      .from(animalListings)
      .where(inArray(animalListings.id, queue.map((entry) => entry.listingId)));
    for (const row of rows) versions.set(row.id, row.version);
  }

  return (
    <OpsShell actor={actor} title="گزارش‌های بازار حیوان" pathname="/market/listings" nav={marketNav(actor)}>
      <div className="space-y-lg">
        <Alert tone="info" title="این اعداد نشانه‌اند، نه حکم">
          <span data-testid="signals-disclaimer">
            تعداد گزارش و سابقه فروشنده فقط ترتیب رسیدگی را تعیین می‌کنند. هیچ‌کدام به‌تنهایی تخلف را ثابت
            نمی‌کند و هیچ‌کدام خودبه‌خود آگهی را از دید عمومی خارج نمی‌کند.
          </span>
        </Alert>

        <Card>
          <h2 className="text-label-lg">آگهی‌های گزارش‌شده</h2>
          {queue.length === 0 ? (
            <div className="mt-lg">
              <EmptyState title="گزارش بازی نیست" description="هر گزارش تازه همین‌جا با دلیل و سابقه‌اش می‌آید." />
            </div>
          ) : (
            <ul className="mt-lg space-y-md" data-testid="listing-report-queue">
              {queue.map((entry) => (
                <li
                  key={entry.listingId}
                  className="rounded-lg border border-border-subtle p-md"
                  data-testid={'queue-row-' + entry.listingId}
                >
                  <div className="flex flex-wrap items-start justify-between gap-sm">
                    <div className="min-w-0">
                      <p className="text-label-md">
                        <Link href={'/animals-market/' + entry.listingId} className="text-text-brand">
                          {entry.titleFa}
                        </Link>
                      </p>
                      <p className="mt-2xs text-caption text-text-secondary">
                        فروشنده: <bdi dir="ltr">{entry.sellerMobile}</bdi>
                        <span className="mx-sm text-text-disabled">|</span>
                        نخستین گزارش: {when(entry.firstReportedAt)}
                      </p>
                    </div>
                    <StatusBadge tone={entry.status === 'SUSPENDED' ? 'warning' : 'neutral'}>
                      {LISTING_STATUS_FA[entry.status as ListingStatus]}
                    </StatusBadge>
                  </div>

                  <ul className="mt-sm flex flex-wrap gap-xs" data-testid={'queue-reasons-' + entry.listingId}>
                    {entry.reasonsFa.map((reason) => (
                      <li key={reason}>
                        <StatusBadge tone="neutral">{REASON_FA[reason as ReportReason] ?? reason}</StatusBadge>
                      </li>
                    ))}
                  </ul>

                  <ul className="mt-sm flex flex-wrap gap-xs" data-testid={'queue-signals-' + entry.listingId}>
                    <li>
                      <StatusBadge tone="info">
                        {'گزارش باز: ' + fa(entry.signals.openReports)}
                      </StatusBadge>
                    </li>
                    <li>
                      <StatusBadge tone="info">
                        {'گزارش‌دهنده متمایز: ' + fa(entry.signals.openReporters)}
                      </StatusBadge>
                    </li>
                    {entry.signals.sellerRestrictedBefore ? (
                      <li>
                        <StatusBadge tone="warning">سابقه محدودیت فروشنده</StatusBadge>
                      </li>
                    ) : null}
                    {entry.signals.sellerSuspendedBefore ? (
                      <li>
                        <StatusBadge tone="warning">سابقه اقدام روی این فروشنده</StatusBadge>
                      </li>
                    ) : null}
                  </ul>

                  <ListingDecisionForm
                    listingId={entry.listingId}
                    listingVersion={versions.get(entry.listingId) ?? 1}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="text-label-lg">اعتراض‌ها</h2>
          <p className="mt-2xs text-caption text-text-secondary">
            پذیرفتن اعتراض تصمیم قبلی را بازنویسی نمی‌کند؛ هر دو در تاریخچه می‌مانند و آگهی از همان مسیری که
            متوقف شد برمی‌گردد.
          </p>
          {appeals.length === 0 ? (
            <div className="mt-lg">
              <EmptyState title="اعتراض بازی نیست" description="اعتراض فروشنده به یک تصمیم، همین‌جا می‌آید." />
            </div>
          ) : (
            <ul className="mt-lg space-y-md" data-testid="appeal-queue">
              {appeals.map((appeal) => (
                <li
                  key={appeal.id}
                  className="rounded-lg border border-border-subtle p-md"
                  data-testid={'appeal-row-' + appeal.id}
                >
                  <p className="text-label-md">{appeal.listingTitleFa ?? 'آگهی'}</p>
                  <p className="mt-2xs text-caption text-text-secondary">{when(appeal.createdAt)}</p>
                  <p className="mt-sm text-body-sm">{appeal.statementFa}</p>
                  <AppealDecisionForm appealId={appeal.id} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </OpsShell>
  );
}
