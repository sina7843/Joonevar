import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../src/ui/shell.tsx';
import { CaseItem, CaseList, Panel, QueueMeta } from '../../../src/ui/desk.tsx';
import { ageInDays } from '../../../src/ui/queue.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
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

  const ordered = queue;
  return (
    <OpsShell actor={actor} title="صف آگهی‌ها" pathname="/market/listings" nav={marketNav(actor)}>
      <QueueMeta
        total={queue.length}
        noun="پرونده باز"
        oldestDays={queue.length > 0 ? Math.max(...queue.map((entry) => ageInDays(entry.firstReportedAt) ?? 0)) : null}
      />
      <Alert tone="info" title="این اعداد نشانه‌اند، نه حکم">
        <span data-testid="signals-disclaimer">
          تعداد گزارش و سابقه فروشنده فقط ترتیب رسیدگی را تعیین می‌کنند. هیچ‌کدام به‌تنهایی تخلف را ثابت
          نمی‌کند و هیچ‌کدام خودبه‌خود آگهی را از دید عمومی خارج نمی‌کند.
        </span>
      </Alert>

      <Panel title="آگهی‌های گزارش‌شده" count={fa(queue.length)}>
        {queue.length === 0 ? (
          <EmptyState title="گزارش بازی نیست" description="هر گزارش تازه همین‌جا با دلیل و سابقه‌اش می‌آید." />
        ) : (
          <CaseList label="آگهی‌های گزارش‌شده" testId="listing-report-queue">
            {ordered.map((entry) => (
              <CaseItem
                key={entry.listingId}
                testId={'queue-row-' + entry.listingId}
                type="گزارش آگهی"
                name={entry.titleFa}
                href={'/animals-market/' + entry.listingId}
                sub={
                  <>
                    {'فروشنده: '}
                    <bdi dir="ltr">{entry.sellerMobile}</bdi>
                    {' · نخستین گزارش: ' + when(entry.firstReportedAt)}
                  </>
                }
                ageDays={ageInDays(entry.firstReportedAt)}
                status={{ tone: entry.status === 'SUSPENDED' ? 'warning' : 'neutral', label: LISTING_STATUS_FA[entry.status as ListingStatus] }}
                owner="SYSTEM"
                ownerLabel="ناظر آگهی"
                ownerIsUs
              >
                <div className="space-y-sm">
                  <ul className="hz-tag-list flex flex-wrap gap-xs" data-testid={'queue-reasons-' + entry.listingId}>
                    {entry.reasonsFa.map((reason) => (
                      <li key={reason}>
                        <span className="hz-tag hz-tag--neutral">{REASON_FA[reason as ReportReason] ?? reason}</span>
                      </li>
                    ))}
                  </ul>
                  <ul className="flex flex-wrap items-center gap-md text-caption text-text-secondary" data-testid={'queue-signals-' + entry.listingId}>
                    <li className={entry.signals.openReports >= 3 ? 'hz-report__count hz-report__count--high' : 'hz-report__count'}>
                      {'گزارش باز: ' + fa(entry.signals.openReports)}
                    </li>
                    <li>{'گزارش‌دهنده متمایز: ' + fa(entry.signals.openReporters)}</li>
                    {entry.signals.sellerRestrictedBefore ? <li>سابقه محدودیت فروشنده</li> : null}
                    {entry.signals.sellerSuspendedBefore ? <li>سابقه اقدام روی این فروشنده</li> : null}
                  </ul>
                  <ListingDecisionForm listingId={entry.listingId} listingVersion={versions.get(entry.listingId) ?? 1} />
                </div>
              </CaseItem>
            ))}
          </CaseList>
        )}
      </Panel>

      <Panel title="اعتراض‌ها" count={fa(appeals.length)}>
        <p className="text-caption text-text-secondary">
          پذیرفتن اعتراض تصمیم قبلی را بازنویسی نمی‌کند؛ هر دو در تاریخچه می‌مانند و آگهی از همان مسیری که
          متوقف شد برمی‌گردد.
        </p>
        {appeals.length === 0 ? (
          <EmptyState title="اعتراض بازی نیست" description="اعتراض فروشنده به یک تصمیم، همین‌جا می‌آید." />
        ) : (
          <CaseList label="اعتراض‌ها" testId="appeal-queue">
            {appeals.map((appeal) => (
              <CaseItem
                key={appeal.id}
                testId={'appeal-row-' + appeal.id}
                type="اعتراض فروشنده"
                name={appeal.listingTitleFa ?? 'آگهی'}
                sub={<><span className="block text-body-sm text-text-primary">{appeal.statementFa}</span>{when(appeal.createdAt)}</>}
                ageDays={ageInDays(appeal.createdAt)}
                status={{ tone: 'info', label: 'در انتظار بررسی' }}
                owner="SYSTEM"
                ownerLabel="ناظر آگهی"
                ownerIsUs
              >
                <AppealDecisionForm appealId={appeal.id} />
              </CaseItem>
            ))}
          </CaseList>
        )}
      </Panel>
    </OpsShell>
  );
}
