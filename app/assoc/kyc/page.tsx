import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../src/ui/shell.tsx';
import { CaseQueue, ageInDays } from '../../../src/ui/queue.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { kycQueue } from '../../../src/identity/kyc.ts';
import { formatCivilDateFa } from '../../../src/domain/calendar.ts';
import { readQueueQuery } from '../../../src/domain/queue-query.ts';
import { QueueFrame } from '../../../src/ui/queue-head.tsx';

export const dynamic = 'force-dynamic';

/**
 * Association KYC queue (§21.2, §21.5).
 *
 * The source names the association as the reviewer of user-related cases and no
 * other reviewer, so the existing scoped operator permission is reused rather
 * than a new role or gate being introduced (DEC-0027).
 */
export default async function AssocKycPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string; page?: string }> }) {
  const guard = await guardRoute('/assoc/kyc');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const params = await searchParams;
  const query = readQueueQuery(params);
  // P09: the server searches, orders (oldest first by default) and pages.
  const page = await kycQueue(db(), guard.actor, { page: query.page, pageSize: 20 }, undefined, query);
  const rows = page.items;
  const oldest = query.sort === 'oldest' && query.page === 1 && query.q === '' ? ageInDays(rows[0]?.submittedAt) : null;

  return (
    <OpsShell actor={guard.actor} title="صف احراز هویت" pathname="/assoc/kyc" nav={ASSOC_NAV}>
      {page.all > 0 ? (
        <p className="hz-page-header__meta">
          <span>{page.all.toLocaleString('fa-IR') + ' پرونده در صف'}</span>
          {oldest !== null ? <span>{'قدیمی‌ترین: ' + oldest.toLocaleString('fa-IR') + ' روز'}</span> : null}
        </p>
      ) : null}
      {page.all === 0 ? (
        <EmptyState
          title="پرونده‌ای در انتظار بررسی نیست"
          description="پرونده‌های ارسال‌شده کاربران در همین صف دیده می‌شوند."
        />
      ) : (
        <QueueFrame
          path="/assoc/kyc"
          params={{ q: query.q, sort: query.sort === 'oldest' ? undefined : query.sort }}
          query={query}
          page={page}
          all={page.all}
          searchLabel="جست‌وجوی نام متقاضی"
          testId="kyc-queue-frame"
        >
          {page.total === 0 ? (
            <EmptyState title="نتیجه‌ای پیدا نشد" description="عبارت جست‌وجو را تغییر دهید یا پاک کنید." />
          ) : (
            <CaseQueue
              label="صف احراز هویت"
              showCode={false}
              rows={rows.map((item) => ({
                id: item.id,
                href: '/assoc/kyc/' + item.id,
                name: item.applicantName,
                sub:
                  (item.submittedAt ? 'ارسال: ' + formatCivilDateFa(item.submittedAt.toISOString().slice(0, 10)) : 'ارسال: —') +
                  (item.version > 1 ? '، نسخه ' + item.version.toLocaleString('fa-IR') : ''),
                ageDays: ageInDays(item.submittedAt),
                status: { key: 'SUBMITTED' },
                owner: 'ASSOCIATION' as const,
                ownerIsUs: true,
                testId: 'open-case',
              }))}
            />
          )}
        </QueueFrame>
      )}
    </OpsShell>
  );
}
