import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { GENETICS_NAV, OpsShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { receiptQueue, RECEIPT_STATUS_FA } from '../../../src/genetics/service.ts';
import { formatCivilDateFa } from '../../../src/domain/calendar.ts';

export const dynamic = 'force-dynamic';

/** Receipts waiting for the centre — §14.1 step 4, §21.3. */
export default async function GeneticsReceiptsPage() {
  const guard = await guardRoute('/genetics/receipts');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const rows = await receiptQueue(db(), guard.actor);

  return (
    <OpsShell actor={guard.actor} title="هم‌زیست — مرکز ژنتیک" pathname="/genetics/receipts" nav={GENETICS_NAV}>
      <div className="space-y-lg">
        {rows.length === 0 ? (
          <EmptyState
            title="فیشی در انتظار بررسی نیست"
            description="فیش‌های ارسال‌شده کاربران برای پرداخت مستقیم به مرکز، در همین صف دیده می‌شوند."
          />
        ) : (
          <ul className="space-y-lg" data-testid="receipt-queue">
            {rows.map((receipt) => (
              <li key={receipt.id}>
                <Card>
                  <div className="flex items-start justify-between gap-md">
                    <p className="text-body-sm">
                      فیش {receipt.submittedAt ? formatCivilDateFa(receipt.submittedAt.toISOString().slice(0, 10)) : '—'}
                    </p>
                    <StatusBadge tone="info">{RECEIPT_STATUS_FA[receipt.status]}</StatusBadge>
                  </div>
                  <p className="mt-lg text-body-sm">
                    <Link
                      href={'/genetics/receipts/' + receipt.id}
                      className="text-text-brand underline underline-offset-4"
                      data-testid="open-receipt"
                    >
                      بررسی فیش
                    </Link>
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </OpsShell>
  );
}
