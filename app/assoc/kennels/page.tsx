import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { ASSOC_NAV, OpsShell } from '../../../src/ui/shell.tsx';
import { ageInDays, keyStatus } from '../../../src/ui/queue.tsx';
import { CaseItem, CaseList, QueueMeta } from '../../../src/ui/desk.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { kennelQueue } from '../../../src/kennels/service.ts';
import { formatCivilDateFa } from '../../../src/domain/calendar.ts';
import { readQueueQuery, sliceQueue } from '../../../src/domain/queue-query.ts';
import { QueueFrame } from '../../../src/ui/queue-head.tsx';

export const dynamic = 'force-dynamic';

/** Kennels waiting for the association — §15.2, §21.2, §21.5. */
export default async function AssocKennelsPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string; page?: string }> }) {
  const guard = await guardRoute('/assoc/kennels');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const query = readQueueQuery(await searchParams);
  const rows = await kennelQueue(db(), guard.actor);
  const page = sliceQueue(rows, query, {
    text: (kennel) => [kennel.nameFa, kennel.nameEn, kennel.provinceFa, kennel.cityFa].filter(Boolean).join(' '),
    at: (kennel) => kennel.submittedAt,
    name: (kennel) => kennel.nameFa ?? '',
  });

  return (
    <OpsShell actor={guard.actor} title="کنل" pathname="/assoc/kennels" nav={ASSOC_NAV}>
      {rows.length === 0 ? (
        <EmptyState
          title="پرونده کنلی در انتظار بررسی نیست"
          description="کنل‌هایی که پرداخت و ارسال شده‌اند در همین صف دیده می‌شوند."
        />
      ) : (
        <>
          <QueueMeta total={rows.length} oldestDays={Math.max(...rows.map((kennel) => ageInDays(kennel.submittedAt) ?? 0))} />
          <QueueFrame
            path="/assoc/kennels"
            params={{ q: query.q, sort: query.sort === 'oldest' ? undefined : query.sort }}
            query={query}
            page={page}
            all={page.all}
            searchLabel="جست‌وجوی نام کنل یا شهر"
            testId="kennel-queue-frame"
          >
            {page.total === 0 ? (
              <EmptyState title="نتیجه‌ای پیدا نشد" description="عبارت جست‌وجو را تغییر دهید یا پاک کنید." />
            ) : (
              <CaseList label="صف کنل" testId="kennel-queue">
                {page.items.map((kennel) => (
                  <CaseItem
                    key={kennel.id}
                    name={kennel.nameFa ?? 'کنل بدون نام'}
                    href={'/assoc/kennels/' + kennel.id}
                    linkLabel="بررسی پرونده"
                    linkTestId="open-kennel-case"
                    sub={
                      [kennel.provinceFa, kennel.cityFa].filter(Boolean).join('، ') +
                      ' · ارسال: ' +
                      (kennel.submittedAt ? formatCivilDateFa(kennel.submittedAt.toISOString().slice(0, 10)) : '—')
                    }
                    ageDays={ageInDays(kennel.submittedAt)}
                    status={keyStatus(kennel.status)}
                    owner="ASSOCIATION"
                    ownerIsUs
                  />
                ))}
              </CaseList>
            )}
          </QueueFrame>
        </>
      )}
    </OpsShell>
  );
}
