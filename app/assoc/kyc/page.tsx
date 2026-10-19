import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../src/ui/shell.tsx';
import { CaseQueue, ageInDays } from '../../../src/ui/queue.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
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

  // P09: oldest first, age in whole days, the association's own clock.
  const rows = [...page.items].sort((x, y) => (x.submittedAt?.getTime() ?? 0) - (y.submittedAt?.getTime() ?? 0));
  const oldest = ageInDays(rows[0]?.submittedAt);

  return (
    <OpsShell actor={guard.actor} title="صف احراز هویت" pathname="/assoc/kyc" nav={ASSOC_NAV}>
      {rows.length > 0 ? (
        <p className="hz-page-header__meta">
          <span>{page.total.toLocaleString('fa-IR') + ' پرونده در صف'}</span>
          {oldest !== null ? <span>{'قدیمی‌ترین: ' + oldest.toLocaleString('fa-IR') + ' روز'}</span> : null}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState
          title="پرونده‌ای در انتظار بررسی نیست"
          description="پرونده‌های ارسال‌شده کاربران در همین صف دیده می‌شوند."
        />
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
    </OpsShell>
  );
}
