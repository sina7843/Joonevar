import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { GENETICS_NAV, OpsShell } from '../../../src/ui/shell.tsx';
import { CaseItem, CaseList, QueueMeta } from '../../../src/ui/desk.tsx';
import { ageInDays, keyStatus } from '../../../src/ui/queue.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { receiptQueue } from '../../../src/genetics/service.ts';
import { formatCivilDateFa } from '../../../src/domain/calendar.ts';
import { readQueueQuery, sliceQueue } from '../../../src/domain/queue-query.ts';
import { QueueFrame } from '../../../src/ui/queue-head.tsx';

export const dynamic = 'force-dynamic';

/** Receipts waiting for the centre — §14.1 step 4, §21.3. */
export default async function GeneticsReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
}) {
  const guard = await guardRoute('/genetics/receipts');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const rows = await receiptQueue(db(), guard.actor);
  const nameOf = (receipt: (typeof rows)[number]) =>
    'فیش ' + (receipt.submittedAt ? formatCivilDateFa(receipt.submittedAt.toISOString().slice(0, 10)) : '—');
  const query = readQueueQuery(await searchParams);
  // Age and order by submittedAt: a resubmitted receipt has no stored first-submission time (only in the audit log).
  const page = sliceQueue(rows, query, {
    text: (receipt) => [nameOf(receipt), receipt.payerNoteFa ?? '', receipt.id].join(' '),
    at: (receipt) => receipt.submittedAt,
    name: nameOf,
  });

  return (
    <OpsShell actor={guard.actor} title="فیش‌ها" pathname="/genetics/receipts" nav={GENETICS_NAV} meta={<QueueMeta total={rows.length} noun="فیش در صف" oldestDays={Math.max(...rows.map((receipt) => ageInDays(receipt.submittedAt) ?? 0))} />}>
      {rows.length === 0 ? (
        <EmptyState
          title="فیشی در انتظار بررسی نیست"
          description="فیش‌های ارسال‌شده کاربران برای پرداخت مستقیم به مرکز، در همین صف دیده می‌شوند."
        />
      ) : (
        <>
          <QueueFrame
            path="/genetics/receipts"
            params={{ q: query.q, sort: query.sort === 'oldest' ? undefined : query.sort }}
            query={query}
            page={page}
            all={page.all}
            noun="فیش"
            searchLabel="جست‌وجوی تاریخ یا یادداشت فیش"
            testId="receipt-queue-frame"
          >
          {page.items.length === 0 ? (
            <EmptyState title="نتیجه‌ای پیدا نشد" description="عبارت جست‌وجو را دوباره بررسی کنید." />
          ) : (
          <CaseList label="صف فیش‌ها" testId="receipt-queue">
            {page.items.map((receipt) => (
              <CaseItem
                key={receipt.id}
                type="فیش پرداخت مستقیم"
                name={nameOf(receipt)}
                href={'/genetics/receipts/' + receipt.id}
                linkLabel="بررسی فیش"
                linkTestId="open-receipt"
                ageDays={ageInDays(receipt.submittedAt)}
                status={keyStatus(receipt.status)}
                owner="GENETICS_CENTRE"
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
