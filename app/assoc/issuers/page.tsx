import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../src/ui/shell.tsx';
import { Panel } from '../../../src/ui/desk.tsx';
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
      <Alert tone="warning" title="این فهرست داده عملیاتی انجمن است">
        بررسی Export Pedigree بر اساس همین فهرست انجام می‌شود. هیچ نام نمونه‌ای در سامانه درج نشده است و
        زمان ثابتی هم برای پایان بررسی وعده داده نمی‌شود.
      </Alert>

      <div className="grid items-start gap-lg lg:grid-cols-2">
        <Panel title="فهرست صادرکنندگان" count={rows.length.toLocaleString('fa-IR')}>
          {rows.length === 0 ? (
            <EmptyState
              title="صادرکننده‌ای ثبت نشده است"
              description="پس از ثبت فهرست واقعی، مدارک ارسالی بر اساس همین فهرست بررسی می‌شوند."
            />
          ) : (
            <ul data-testid="issuer-list">
              {rows.map((issuer) => (
                <li key={issuer.id} className="hz-setting">
                  <div className="hz-setting__label">
                    <span className="hz-setting__name">{issuer.name}</span>
                    <span className="hz-setting__hint">
                      {(issuer.country ?? '—') + (issuer.noteFa ? ' · ' + issuer.noteFa : '')}
                    </span>
                  </div>
                  <div className="hz-setting__end">
                    <StatusBadge status={issuer.isActive ? 'ACTIVE' : 'INACTIVE'} />
                  </div>
                  <div className="col-span-full">
                    <ToggleIssuerForm issuerId={issuer.id} isActive={issuer.isActive} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="افزودن صادرکننده">
          <AddIssuerForm />
        </Panel>
      </div>
    </OpsShell>
  );
}
