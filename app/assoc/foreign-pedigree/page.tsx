import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../src/ui/shell.tsx';
import { CaseQueue, ageInDays } from '../../../src/ui/queue.tsx';
import { QueueMeta } from '../../../src/ui/desk.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { foreignQueue, listIssuers } from '../../../src/animals/foreign-pedigree.ts';
import { formatCivilDateFa } from '../../../src/domain/calendar.ts';
import { readQueueQuery } from '../../../src/domain/queue-query.ts';
import { QueueFrame } from '../../../src/ui/queue-head.tsx';

export const dynamic = 'force-dynamic';

/**
 * Association queue for foreign pedigrees (§21.2, D14).
 *
 * The review basis is the association's own registry of approved issuers, which
 * stays empty until the association enters real names.
 */
export default async function AssocForeignPedigreePage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string; page?: string }> }) {
  const guard = await guardRoute('/assoc/foreign-pedigree');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const query = readQueueQuery(await searchParams);
  // P09: the server searches, orders (oldest first by default) and pages.
  const [page, issuers] = await Promise.all([
    foreignQueue(db(), guard.actor, { page: query.page, pageSize: 20 }, undefined, query),
    listIssuers(db(), true),
  ]);

  return (
    <OpsShell actor={guard.actor} title="Export Pedigree" pathname="/assoc/foreign-pedigree" nav={ASSOC_NAV} meta={<QueueMeta total={page.all} oldestDays={query.sort === 'oldest' && query.page === 1 && query.q === '' ? ageInDays(page.items[0]?.submittedAt) : null} />}>
      <div className="space-y-lg">
        {issuers.length === 0 ? (
          <Alert tone="warning" title="فهرست صادرکنندگان موردتأیید خالی است">
            مبنای بررسی، فهرست صادرکنندگان موردتأیید انجمن است. تا ورود فهرست واقعی، هیچ مدرکی قابل تأیید
            نیست.{' '}
            <Link href="/assoc/issuers" className="hz-link">
              مدیریت فهرست صادرکنندگان
            </Link>
          </Alert>
        ) : null}

        {page.all === 0 ? (
          <EmptyState
            title="پرونده‌ای در انتظار بررسی نیست"
            description="مدارک ارسال‌شده مالکان در همین صف دیده می‌شوند."
          />
        ) : (
          <>
            <QueueFrame
              path="/assoc/foreign-pedigree"
              params={{ q: query.q, sort: query.sort === 'oldest' ? undefined : query.sort }}
              query={query}
              page={page}
              all={page.all}
              searchLabel="جست‌وجوی نام یا کد"
              testId="foreign-queue-frame"
            >
              {page.total === 0 ? (
                <EmptyState title="نتیجه‌ای پیدا نشد" description="عبارت جست‌وجو را تغییر دهید یا پاک کنید." />
              ) : (
                <CaseQueue
                  label="صف Export Pedigree"
                  rows={page.items.map((item) => ({
                    id: item.id,
                    href: '/assoc/foreign-pedigree/' + item.id,
                    name: item.animalName,
                    code: item.documentCode,
                    sub:
                      'صادرکننده: ' +
                      (item.issuerName ?? '—') +
                      ' · ارسال: ' +
                      (item.submittedAt ? formatCivilDateFa(item.submittedAt.toISOString().slice(0, 10)) : '—'),
                    ageDays: ageInDays(item.submittedAt),
                    status: { key: 'UNDER_REVIEW' },
                    owner: 'ASSOCIATION' as const,
                    ownerIsUs: true,
                    testId: 'open-foreign-case',
                  }))}
                />
              )}
            </QueueFrame>
          </>
        )}
      </div>
    </OpsShell>
  );
}
