import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { GENETICS_NAV, OpsShell } from '../../../src/ui/shell.tsx';
import { CaseItem, CaseList, QueueMeta } from '../../../src/ui/desk.tsx';
import { ageInDays, keyStatus } from '../../../src/ui/queue.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { receiptQueue } from '../../../src/genetics/service.ts';
import { formatCivilDateFa } from '../../../src/domain/calendar.ts';

export const dynamic = 'force-dynamic';

/** Receipts waiting for the centre — §14.1 step 4, §21.3. */
export default async function GeneticsReceiptsPage() {
  const guard = await guardRoute('/genetics/receipts');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const rows = await receiptQueue(db(), guard.actor);

  return (
    <OpsShell actor={guard.actor} title="فیش‌ها" pathname="/genetics/receipts" nav={GENETICS_NAV}>
      {rows.length === 0 ? (
        <EmptyState
          title="فیشی در انتظار بررسی نیست"
          description="فیش‌های ارسال‌شده کاربران برای پرداخت مستقیم به مرکز، در همین صف دیده می‌شوند."
        />
      ) : (
        <>
          <QueueMeta total={rows.length} noun="فیش در صف" oldestDays={Math.max(...rows.map((receipt) => ageInDays(receipt.submittedAt) ?? 0))} />
          <CaseList label="صف فیش‌ها" testId="receipt-queue">
            {rows.map((receipt) => (
              <CaseItem
                key={receipt.id}
                type="فیش پرداخت مستقیم"
                name={'فیش ' + (receipt.submittedAt ? formatCivilDateFa(receipt.submittedAt.toISOString().slice(0, 10)) : '—')}
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
        </>
      )}
    </OpsShell>
  );
}
