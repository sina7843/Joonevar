import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { ASSOC_NAV, OpsShell } from '../../../src/ui/shell.tsx';
import { CaseQueue, ageInDays } from '../../../src/ui/queue.tsx';
import { QueueMeta } from '../../../src/ui/desk.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { permitQueue } from '../../../src/mating/permits.ts';
import { formatCivilDateFa } from '../../../src/domain/calendar.ts';
import { readQueueQuery, sliceQueue } from '../../../src/domain/queue-query.ts';
import { QueueFrame } from '../../../src/ui/queue-head.tsx';

export const dynamic = 'force-dynamic';

/** Official permits waiting for the association — §16 step 8, §21.2, §21.5. */
export default async function AssocPermitsPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string; page?: string }> }) {
  const guard = await guardRoute('/assoc/permits');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const query = readQueueQuery(await searchParams);
  const rows = await permitQueue(db(), guard.actor);
  const page = sliceQueue(rows, query, { text: (permit) => permit.id, at: (permit) => permit.submittedAt, name: (permit) => permit.id });

  return (
    <OpsShell actor={guard.actor} title="مجوز جفت‌گیری" pathname="/assoc/permits" nav={ASSOC_NAV} meta={<QueueMeta total={rows.length} oldestDays={ageInDays(rows[0]?.submittedAt)} />}>
      {rows.length === 0 ? (
        <EmptyState
          title="پرونده مجوزی در انتظار بررسی نیست"
          description="پرونده‌هایی که هزینه آن‌ها پرداخت و سپس ارسال شده‌اند در همین صف دیده می‌شوند."
        />
      ) : (
        <>
          <QueueFrame
            path="/assoc/permits"
            params={{ q: query.q, sort: query.sort === 'oldest' ? undefined : query.sort }}
            query={query}
            page={page}
            all={page.all}
            searchLabel="جست‌وجوی شناسه پرونده"
            testId="permit-queue-frame"
          >
            {page.total === 0 ? (
              <EmptyState title="نتیجه‌ای پیدا نشد" description="عبارت جست‌وجو را تغییر دهید یا پاک کنید." />
            ) : (
              <div data-testid="permit-queue">
                <CaseQueue
                  label="صف مجوز جفت‌گیری"
                  showCode={false}
                  rows={page.items.map((permit) => ({
                    id: permit.id,
                    href: '/assoc/permits/' + permit.id,
                    name: 'پرونده مجوز جفت‌گیری',
                    sub: 'ارسال: ' + (permit.submittedAt ? formatCivilDateFa(permit.submittedAt.toISOString().slice(0, 10)) : '—'),
                    ageDays: ageInDays(permit.submittedAt),
                    status: { key: permit.status },
                    owner: 'ASSOCIATION' as const,
                    ownerIsUs: true,
                    testId: 'open-permit-case',
                  }))}
                />
              </div>
            )}
          </QueueFrame>
        </>
      )}
    </OpsShell>
  );
}
