import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../src/ui/shell.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { db } from '../../../src/db/client.ts';
import { pedigreeIssuers } from '../../../src/db/schema/core.ts';

export const dynamic = 'force-dynamic';

/**
 * Approved pedigree issuer registry (D14).
 *
 * Real rows from the database. The registry is empty on purpose — no issuer
 * name is invented — and an empty registry does not remove the review path; it
 * only means no foreign pedigree can be approved yet.
 */
export default async function IssuersPage() {
  const guard = await guardRoute('/assoc/issuers');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const rows = await db().select().from(pedigreeIssuers);

  return (
    <OpsShell actor={guard.actor} title="صادرکنندگان موردتأیید" pathname="/assoc/issuers" nav={ASSOC_NAV}>
      <div className="space-y-lg">
        <Alert tone="warning" title="این فهرست هنوز تکمیل نشده است">
          بررسی شجره‌نامه خارجی بر اساس فهرست صادرکنندگان موردتأیید انجمن انجام می‌شود. تهیه فهرست واقعی بر عهده
          انجمن است و هیچ نام نمونه‌ای در سامانه درج نشده است. زمان ثابتی هم برای پایان بررسی وعده داده نمی‌شود.
        </Alert>

        {rows.length === 0 ? (
          <EmptyState
            title="صادرکننده‌ای ثبت نشده است"
            description="پس از ثبت فهرست واقعی، مدارک ارسالی بر اساس همین فهرست بررسی می‌شوند."
          />
        ) : (
          <ul className="space-y-sm">
            {rows.map((issuer) => (
              <li key={issuer.id} className="rounded-md border border-border-subtle bg-bg-surface p-md">
                {issuer.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </OpsShell>
  );
}
