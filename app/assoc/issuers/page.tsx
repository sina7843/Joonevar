import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { listIssuers } from '../../../src/animals/foreign-pedigree.ts';
import { AddIssuerForm, ToggleIssuerForm } from './issuer-forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * Approved pedigree issuer registry (D14).
 *
 * Real rows from the database. The registry starts empty on purpose — no issuer
 * name is invented — and an empty registry does not remove the review path; it
 * only means no foreign pedigree can be approved yet.
 */
export default async function IssuersPage() {
  const guard = await guardRoute('/assoc/issuers');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const rows = await listIssuers(db());

  return (
    <OpsShell actor={guard.actor} title="صادرکنندگان موردتأیید" pathname="/assoc/issuers" nav={ASSOC_NAV}>
      <div className="space-y-lg">
        <Alert tone="warning" title="این فهرست داده عملیاتی انجمن است">
          بررسی Export Pedigree بر اساس همین فهرست انجام می‌شود. هیچ نام نمونه‌ای در سامانه درج نشده است و
          زمان ثابتی هم برای پایان بررسی وعده داده نمی‌شود.
        </Alert>

        <Card>
          <h2 className="text-label-lg">افزودن صادرکننده</h2>
          <div className="mt-lg">
            <AddIssuerForm />
          </div>
        </Card>

        {rows.length === 0 ? (
          <EmptyState
            title="صادرکننده‌ای ثبت نشده است"
            description="پس از ثبت فهرست واقعی، مدارک ارسالی بر اساس همین فهرست بررسی می‌شوند."
          />
        ) : (
          <ul className="space-y-md" data-testid="issuer-list">
            {rows.map((issuer) => (
              <li key={issuer.id}>
                <Card>
                  <div className="flex items-start justify-between gap-md">
                    <div className="min-w-0">
                      <h3 className="text-label-lg">{issuer.name}</h3>
                      <p className="mt-2xs text-caption text-text-secondary">{issuer.country ?? '—'}</p>
                      {issuer.noteFa ? (
                        <p className="mt-2xs text-caption text-text-secondary">{issuer.noteFa}</p>
                      ) : null}
                    </div>
                    <StatusBadge tone={issuer.isActive ? 'success' : 'neutral'}>
                      {issuer.isActive ? 'فعال' : 'غیرفعال'}
                    </StatusBadge>
                  </div>
                  <ToggleIssuerForm issuerId={issuer.id} isActive={issuer.isActive} />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </OpsShell>
  );
}
