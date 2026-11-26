import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, CONTENT_NAV } from '../../../src/ui/shell.tsx';
import { CaseItem, CaseList } from '../../../src/ui/desk.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { QueueFrame } from '../../../src/ui/queue-head.tsx';
import { readQueueQuery, sliceQueue } from '../../../src/domain/queue-query.ts';
import { db } from '../../../src/db/client.ts';
import { restrictionHistory } from '../../../src/moderation/service.ts';
import { formatInstantFa } from '../../../src/content/model.ts';
import { LiftRestrictionForm } from '../../../src/moderation/forms.tsx';

export const dynamic = 'force-dynamic';

/** Publisher restrictions — §13. Each ends by its date or when lifted with a reason. */
export default async function ContentRestrictionsPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string; page?: string }> }) {
  const guard = await guardRoute('/content/restrictions');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const rows = await restrictionHistory(db(), guard.actor);
  // A history, not a queue: newest first by default (the service keeps the latest 100).
  const query = readQueueQuery(await searchParams, 'newest');
  const page = sliceQueue(rows, query, {
    text: (row) => [row.authorName, row.reason].join(' '),
    at: (row) => row.createdAt,
    name: (row) => row.authorName,
  });

  return (
    <OpsShell actor={guard.actor} title="محدودیت ناشر" pathname="/content/restrictions" nav={CONTENT_NAV}>
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">
          نویسنده محدودشده نمی‌تواند محتوا منتشر کند یا محتوای منتشرشده را تغییر دهد؛ پیش‌نویس‌هایش قابل ویرایش
          می‌مانند. محدودیت از صفحه گزارش یک محتوا ثبت می‌شود.
        </span>
      </p>
      {rows.length === 0 ? (
        <EmptyState title="هیچ محدودیتی ثبت نشده است" description="محدودیت‌های ثبت‌شده و برداشته‌شده اینجا می‌مانند." />
      ) : (
            <QueueFrame
              path="/content/restrictions"
              params={{ q: query.q, sort: query.sort === 'newest' ? undefined : query.sort }}
              query={query}
              page={page}
              all={page.all}
              noun="محدودیت"
              searchLabel="جست‌وجوی نام نویسنده یا دلیل"
              defaultSort="newest"
              testId="restriction-queue-frame"
            >
              {page.items.length === 0 ? (
                <EmptyState title="نتیجه‌ای پیدا نشد" description="عبارت جست‌وجو را دوباره بررسی کنید." />
              ) : (
        <CaseList label="محدودیت‌های ناشر" testId="restriction-list">
          {page.items.map((row) => (
            <CaseItem
              key={row.id}
              testId={'restriction-' + row.id}
              name={row.authorName}
              sub={
                <>
                  <span className="block text-body-sm text-text-primary">{row.reason}</span>
                  {'از ' + formatInstantFa(row.startsAt) + ' · ' + (row.endsAt ? 'تا ' + formatInstantFa(row.endsAt) : 'تا برداشتن')}
                  {row.liftedAt ? ' · برداشته شد: ' + formatInstantFa(row.liftedAt) + ' — ' + (row.liftReason ?? '') : ''}
                </>
              }
              status={{ tone: row.active ? 'warning' : 'neutral', label: row.active ? 'فعال' : row.liftedAt ? 'برداشته‌شده' : 'پایان‌یافته' }}
            >
              {row.active ? <LiftRestrictionForm restrictionId={row.id} /> : null}
            </CaseItem>
          ))}
        </CaseList>
              )}
            </QueueFrame>
      )}
    </OpsShell>
  );
}
