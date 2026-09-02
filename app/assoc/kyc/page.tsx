import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { kycQueue } from '../../../src/identity/kyc.ts';
import { formatCivilDateFa } from '../../../src/domain/calendar.ts';

export const dynamic = 'force-dynamic';

/**
 * Association KYC queue (§21.2, §21.5).
 *
 * The source names the association as the reviewer of user-related cases and no
 * other reviewer, so the existing scoped operator permission is reused rather
 * than a new role or gate being introduced (DEC-0027).
 */
export default async function AssocKycPage() {
  const guard = await guardRoute('/assoc/kyc');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const page = await kycQueue(db(), guard.actor, { page: 1, pageSize: 20 });

  return (
    <OpsShell actor={guard.actor} title="صف احراز هویت" pathname="/assoc/kyc" nav={ASSOC_NAV}>
      {page.items.length === 0 ? (
        <EmptyState
          title="پرونده‌ای در انتظار بررسی نیست"
          description="پرونده‌های ارسال‌شده کاربران در همین صف دیده می‌شوند."
        />
      ) : (
        <ul className="space-y-md">
          {page.items.map((item) => (
            <li key={item.id}>
              <Card>
                <div className="flex items-start justify-between gap-md">
                  <div className="min-w-0">
                    <h2 className="text-label-lg">{item.applicantName}</h2>
                    <p className="mt-2xs text-caption text-text-secondary">
                      ارسال: {item.submittedAt ? formatCivilDateFa(item.submittedAt.toISOString().slice(0, 10)) : '—'}
                    </p>
                  </div>
                  <StatusBadge tone="info">در حال بررسی</StatusBadge>
                </div>
                <div className="mt-lg">
                  <Link
                    href={'/assoc/kyc/' + item.id}
                    className="text-label-md text-text-brand underline underline-offset-4"
                    data-testid="open-case"
                  >
                    بررسی پرونده
                  </Link>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </OpsShell>
  );
}
