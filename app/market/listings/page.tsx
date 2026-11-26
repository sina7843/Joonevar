import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../src/ui/shell.tsx';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { DeskHead, DeskVersionNote, Panel, QueueMeta } from '../../../src/ui/desk.tsx';
import { CaseDrawer } from '../../../src/ui/desk-drawer.tsx';
import { CaseTable, type CaseRow } from '../../../src/ui/case-table.tsx';
import { BulkSelect } from '../../../src/ui/bulk-action-bar.tsx';
import { FilterChips } from '../../../src/ui/filter-bar.tsx';
import { Pagination } from '../../../src/ui/pagination.tsx';
import { hrefWith, pageSlice, param, QueueHead } from '../../../src/ui/queue-head.tsx';
import { RecordImage } from '../../../src/ui/record-image.tsx';
import { Icon } from '../../../src/ui/icon.tsx';
import { ageInDays, keyStatus } from '../../../src/ui/queue.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { AppError } from '../../../src/domain/errors.ts';
import {
  appealQueue,
  listingReportQueue,
  type AppealView,
  type ListingQueueEntry,
} from '../../../src/marketplace/listing-moderation.ts';
import { REASON_FA, type ReportReason } from '../../../src/moderation/model.ts';
import { animalListings } from '../../../src/db/schema/marketplace.ts';
import { inArray } from 'drizzle-orm';
import { AppealDecisionForm, ListingDecisionForm } from '../../../src/marketplace/moderation-forms.tsx';
import { bulkHideListingsAction } from '../moderation-actions.ts';
import { ListingPrice } from '../../(public)/animals-market/listing-card.tsx';

export const dynamic = 'force-dynamic';

const fa = (value: number): string => value.toLocaleString('fa-IR');
const when = (value: Date) =>
  new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(value);

const PATH = '/market/listings';
type Search = Promise<Record<string, string | string[] | undefined>>;

const SORTS = [
  { key: 'priority', label: 'بیشترین گزارش‌دهنده' },
  { key: 'oldest', label: 'قدیمی‌ترین پرونده' },
  { key: 'newest', label: 'تازه‌ترین پرونده' },
  { key: 'reports', label: 'بیشترین گزارش' },
] as const;
type SortKey = (typeof SORTS)[number]['key'];

const KINDS = [
  { key: 'all', label: 'همه', test: () => true },
  { key: 'kennel', label: 'آگهی کنل', test: (entry: ListingQueueEntry) => entry.sellerKind === 'KENNEL' },
  { key: 'owner', label: 'آگهی مالک', test: (entry: ListingQueueEntry) => entry.sellerKind === 'OWNER' },
  {
    key: 'unset',
    label: 'قیمت تعیین‌نشده',
    test: (entry: ListingQueueEntry) => entry.priceMode !== 'NEGOTIABLE' && entry.priceToman === null,
  },
] as const;

function ordered(queue: readonly ListingQueueEntry[], sort: SortKey): readonly ListingQueueEntry[] {
  // `priority` is the service's own workload order (most distinct reporters, then oldest).
  if (sort === 'priority') return queue;
  const time = (entry: ListingQueueEntry) => entry.firstReportedAt.getTime();
  const copy = [...queue];
  if (sort === 'oldest') return copy.sort((a, b) => time(a) - time(b));
  if (sort === 'newest') return copy.sort((a, b) => time(b) - time(a));
  return copy.sort((a, b) => b.signals.openReports - a.signals.openReports || time(a) - time(b));
}

/**
 * The listing moderation queue — Phase 3, PROMPT-004; DS K14 (P09 queue, P10
 * desk in a Drawer).
 *
 * Publication is direct, so this is where a human looks afterwards. The order
 * is a workload order computed from reports that really exist; the page says so
 * under the queue head, because an advert many people disliked is not thereby
 * an advert that broke a rule. Appeals are their own view (`?view=appeals`), so
 * the listing queue is one set.
 */
export default async function ListingModerationPage({ searchParams }: { searchParams: Search }) {
  const guard = await guardRoute(PATH);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;
  const search = await searchParams;
  const view = param(search.view) === 'appeals' ? 'appeals' : 'listings';
  const sort: SortKey = SORTS.find((entry) => entry.key === param(search.sort))?.key ?? 'priority';
  const kind = KINDS.find((entry) => entry.key === param(search.kind)) ?? KINDS[0];
  const q = (param(search.q) ?? '').trim();
  const params = { view: view === 'appeals' ? 'appeals' : undefined, sort: sort === 'priority' ? undefined : sort, kind: kind.key === 'all' ? undefined : kind.key, q: q || undefined };

  let queue: readonly ListingQueueEntry[];
  let appeals: readonly AppealView[];
  try {
    [queue, appeals] = await Promise.all([listingReportQueue(db(), actor), appealQueue(db(), actor)]);
  } catch (error) {
    if (error instanceof AppError) return <AccessDenied error={error} />;
    throw error;
  }

  const views = (
    <FilterChips
      label="نمای صف آگهی‌ها"
      testId="listing-views"
      chips={[
        { key: 'listings', label: 'آگهی‌های گزارش‌شده', count: fa(queue.length), href: PATH, current: view === 'listings' },
        { key: 'appeals', label: 'اعتراض‌ها', count: fa(appeals.length), href: PATH + '?view=appeals', current: view === 'appeals' },
      ]}
    />
  );

  return (
    <OpsShell actor={actor} title="صف آگهی‌ها" pathname={PATH} nav={marketNav(actor)}>
      {view === 'appeals' ? (
        <AppealsView appeals={appeals} views={views} page={param(search.page)} />
      ) : (
        <ListingsView queue={queue} views={views} sort={sort} kind={kind.key} q={q} params={params} page={param(search.page)} />
      )}
    </OpsShell>
  );
}

async function ListingsView({
  queue,
  views,
  sort,
  kind,
  q,
  params,
  page,
}: {
  queue: readonly ListingQueueEntry[];
  views: ReactNode;
  sort: SortKey;
  kind: string;
  q: string;
  params: Record<string, string | undefined>;
  page: string | undefined;
}) {
  const needle = q.toLocaleLowerCase('fa');
  const matches = (entry: ListingQueueEntry) =>
    needle === '' ||
    [entry.titleFa, entry.sellerNameFa, entry.sellerPersonFa, entry.cityFa, entry.breedFa].some((value) =>
      value?.toLocaleLowerCase('fa').includes(needle),
    );
  const searched = queue.filter(matches);
  const filter = KINDS.find((entry) => entry.key === kind) ?? KINDS[0];
  const filtered = ordered(searched.filter(filter.test), sort);
  const shown = pageSlice(filtered, page);

  // The version each decision must carry, read now so a stale form (or a stale
  // bulk selection) is refused rather than acting on a listing that moved.
  const versions = new Map<string, number>();
  if (shown.items.length > 0) {
    const rows = await db()
      .select({ id: animalListings.id, version: animalListings.version })
      .from(animalListings)
      .where(inArray(animalListings.id, shown.items.map((entry) => entry.listingId)));
    for (const row of rows) versions.set(row.id, row.version);
  }

  const rows: (CaseRow & { entry: ListingQueueEntry })[] = shown.items.map((entry) => ({
    entry,
    id: entry.listingId,
    testId: 'queue-row-' + entry.listingId,
    name: entry.titleFa,
    sub: [entry.breedFa, entry.cityFa, 'نخستین گزارش: ' + when(entry.firstReportedAt)].filter(Boolean).join('، '),
    media: <RecordImage fileId={entry.coverFileId} altFa={entry.coverAltFa ?? entry.titleFa} variant="thumb" />,
    ageDays: ageInDays(entry.firstReportedAt),
    status: keyStatus(entry.status),
    owner: 'SYSTEM',
    ownerLabel: 'ناظر آگهی',
    ownerIsUs: true,
    action: <ListingDesk entry={entry} version={versions.get(entry.listingId) ?? 1} />,
  }));

  return (
    <>
      <QueueMeta
        total={queue.length}
        noun="پرونده باز"
        oldestDays={queue.length > 0 ? Math.max(...queue.map((entry) => ageInDays(entry.firstReportedAt) ?? 0)) : null}
      />
      {views}
      <QueueHead
        total={queue.length}
        shown={filtered.length}
        noun="پرونده باز"
        search={{ action: PATH, value: q, label: 'عنوان آگهی، فروشنده یا شهر', keep: params, testId: 'listing-search' }}
        sort={{
          label: 'مرتب‌سازی صف آگهی‌ها',
          testId: 'listing-sort',
          options: SORTS.map((option) => ({
            key: option.key,
            label: option.label,
            current: option.key === sort,
            href: hrefWith(PATH, params, { sort: option.key === 'priority' ? undefined : option.key, page: undefined }),
          })),
        }}
      >
        <p className="text-caption text-text-secondary" data-testid="signals-disclaimer">
          <b>این اعداد نشانه‌اند، نه حکم:</b> تعداد گزارش و سابقه فروشنده فقط ترتیب رسیدگی را تعیین می‌کنند. هیچ‌کدام به‌تنهایی تخلف
          را ثابت نمی‌کند و هیچ‌کدام خودبه‌خود آگهی را از دید عمومی خارج نمی‌کند.
        </p>
        <FilterChips
          label="نوع آگهی"
          testId="listing-kinds"
          chips={KINDS.map((option) => ({
            key: option.key,
            label: option.label,
            count: fa(searched.filter(option.test).length),
            current: option.key === kind,
            href: hrefWith(PATH, params, { kind: option.key === 'all' ? undefined : option.key, page: undefined }),
          }))}
        />
      </QueueHead>

      {queue.length === 0 ? (
        <EmptyState title="گزارش بازی نیست" description="هر گزارش تازه همین‌جا با دلیل و سابقه‌اش می‌آید." />
      ) : rows.length === 0 ? (
        <EmptyState title="آگهی‌ای با این جستجو یا فیلتر نیست" description="جستجو را کوتاه‌تر کنید یا فیلتر «همه» را بزنید." />
      ) : (
        <BulkSelect
          formId="listing-bulk"
          action={bulkHideListingsAction}
          noun="آگهی"
          testId="listing-bulk"
          note="هر آگهی جداگانه و با نسخه‌ای که دیده‌اید پنهان می‌شود؛ نتیجه هر کدام جدا گزارش می‌شود."
          actions={[
            {
              key: 'hide',
              label: 'پنهان‌کردن آگهی‌ها',
              icon: 'eyeSlash',
              reason: { name: 'reason', title: 'پنهان‌کردن آگهی‌های انتخاب‌شده' },
              testId: 'bulk-hide-listings',
            },
          ]}
        >
          <div hidden>
            {rows.map((row) => (
              <span key={row.id}>
                <input type="hidden" form="listing-bulk" name={'version-' + row.id} value={versions.get(row.id) ?? 1} />
                <input type="hidden" form="listing-bulk" name={'title-' + row.id} value={row.entry.titleFa} />
              </span>
            ))}
          </div>
          <CaseTable
            label="آگهی‌های گزارش‌شده"
            testId="listing-report-queue"
            nameLabel="آگهی"
            dense={false}
            rows={rows}
            selectable={{ form: 'listing-bulk', label: (row) => 'انتخاب ' + (row as (typeof rows)[number]).entry.titleFa }}
            columns={[
              {
                key: 'seller',
                header: 'فروشنده',
                cell: (row) => {
                  const entry = (row as (typeof rows)[number]).entry;
                  return (
                    <div className="hz-case">
                      <span className="font-semibold whitespace-nowrap">{entry.sellerNameFa ?? 'بدون نام ثبت‌شده'}</span>
                      <span className="hz-case__sub">
                        {entry.sellerKind === 'KENNEL' ? 'کنل' + (entry.sellerPersonFa ? '، ' + entry.sellerPersonFa : '') : 'مالک'}
                      </span>
                    </div>
                  );
                },
              },
              {
                key: 'price',
                header: 'قیمت',
                cell: (row) => {
                  const entry = (row as (typeof rows)[number]).entry;
                  return <ListingPrice mode={entry.priceMode} amount={entry.priceToman} size="sm" />;
                },
              },
              {
                key: 'reports',
                header: 'گزارش',
                numeric: true,
                cell: (row) => {
                  const entry = (row as (typeof rows)[number]).entry;
                  return (
                    <span
                      className={'inline-flex items-center gap-2xs ' + (entry.signals.openReports >= 3 ? 'hz-report__count hz-report__count--high' : 'hz-report__count')}
                      title={'گزارش‌دهنده متمایز: ' + fa(entry.signals.openReporters)}
                    >
                      <Icon name="flag" size="xs" />
                      {fa(entry.signals.openReports)}
                    </span>
                  );
                },
              },
            ]}
          />
        </BulkSelect>
      )}
      <Pagination
        page={shown.page}
        pageSize={shown.pageSize}
        total={shown.total}
        totalPages={shown.totalPages}
        hrefFor={(target) => hrefWith(PATH, params, { page: target > 1 ? String(target) : undefined })}
        label="صفحه‌بندی صف آگهی‌ها"
      />
    </>
  );
}

function ListingDesk({ entry, version }: { entry: ListingQueueEntry; version: number }) {
  return (
    <CaseDrawer title="پرونده گزارش آگهی" testId={'open-listing-' + entry.listingId}>
      <DeskHead
        title={entry.titleFa}
        status={keyStatus(entry.status)}
        meta={[
          'فروشنده: ' + (entry.sellerNameFa ?? 'بدون نام ثبت‌شده') + (entry.sellerKind === 'KENNEL' ? ' (کنل)' : ' (مالک)'),
          'نخستین گزارش: ' + when(entry.firstReportedAt),
        ]}
      >
        <Link href={'/animals-market/' + entry.listingId} className="hz-link hz-link--standalone">
          دیدن آگهی
        </Link>
      </DeskHead>
      <Panel title="آگهی">
        <div className="flex flex-wrap items-center gap-md">
          <RecordImage fileId={entry.coverFileId} altFa={entry.coverAltFa ?? entry.titleFa} variant="thumb-lg" />
          <div className="space-y-2xs text-body-sm">
            <p>{[entry.breedFa, entry.cityFa].filter(Boolean).join('، ') || 'نژاد و شهر ثبت نشده'}</p>
            <ListingPrice mode={entry.priceMode} amount={entry.priceToman} size="sm" />
          </div>
        </div>
      </Panel>
      <Panel title="دلیل‌ها و نشانه‌ها">
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
      </Panel>
      <Panel title="تصمیم">
        <ListingDecisionForm listingId={entry.listingId} listingVersion={version} />
        <DeskVersionNote version={version} />
      </Panel>
    </CaseDrawer>
  );
}

function AppealsView({ appeals, views, page }: { appeals: readonly AppealView[]; views: ReactNode; page: string | undefined }) {
  const shown = pageSlice(appeals, page);
  return (
    <>
      <QueueMeta
        total={appeals.length}
        noun="اعتراض باز"
        oldestDays={appeals.length > 0 ? Math.max(...appeals.map((appeal) => ageInDays(appeal.createdAt) ?? 0)) : null}
      />
      {views}
      <p className="text-caption text-text-secondary">
        پذیرفتن اعتراض تصمیم قبلی را بازنویسی نمی‌کند؛ هر دو در تاریخچه می‌مانند و آگهی از همان مسیری که متوقف شد برمی‌گردد.
      </p>
      {appeals.length === 0 ? (
        <EmptyState title="اعتراض بازی نیست" description="اعتراض فروشنده به یک تصمیم، همین‌جا می‌آید." />
      ) : (
        <CaseTable
          label="اعتراض‌ها"
          testId="appeal-queue"
          nameLabel="آگهی"
          rows={shown.items.map((appeal) => ({
            id: appeal.id,
            testId: 'appeal-row-' + appeal.id,
            type: 'اعتراض فروشنده',
            name: appeal.listingTitleFa ?? 'آگهی',
            sub: appeal.statementFa,
            ageDays: ageInDays(appeal.createdAt),
            status: keyStatus('SUBMITTED'),
            owner: 'SYSTEM',
            ownerLabel: 'ناظر آگهی',
            ownerIsUs: true,
            action: (
              <CaseDrawer title="پرونده اعتراض فروشنده" testId={'open-appeal-' + appeal.id}>
                <DeskHead title={appeal.listingTitleFa ?? 'آگهی'} status={keyStatus('SUBMITTED')} meta={[when(appeal.createdAt)]} />
                <Panel title="متن اعتراض">
                  <p className="text-body-sm">{appeal.statementFa}</p>
                </Panel>
                <Panel title="پاسخ">
                  <AppealDecisionForm appealId={appeal.id} />
                </Panel>
              </CaseDrawer>
            ),
          }))}
        />
      )}
      <Pagination
        page={shown.page}
        pageSize={shown.pageSize}
        total={shown.total}
        totalPages={shown.totalPages}
        hrefFor={(target) => PATH + '?view=appeals' + (target > 1 ? '&page=' + target : '')}
        label="صفحه‌بندی اعتراض‌ها"
      />
    </>
  );
}
