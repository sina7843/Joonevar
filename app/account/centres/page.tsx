import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { manageableCentres } from '../../../src/centres/service.ts';
import { CENTRE_STATUS_FA, type CentreStatus } from '../../../src/centres/model.ts';

export const dynamic = 'force-dynamic';

/** The centres this account manages — Requirements-Phase-2 §9, P2-D07 (PROMPT-008). */
export default async function AccountCentresPage() {
  const guard = await guardRoute('/account/centres');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const centres = await manageableCentres(db(), guard.actor);

  return (
    <PublicShell actor={guard.actor} title="مراکز من" pathname="/account/centres">
      <div className="space-y-lg">
        <Card>
          <h1 className="text-h4">مراکزی که مدیریت می‌کنید</h1>
          <p className="mt-xs text-body-sm text-text-secondary">
            مدیریت یک مرکز پس از واگذاری یا تأیید Claim به حساب شما سپرده می‌شود. مجوز مرکز را بررسی همزیست ثبت می‌کند، نه مدیر مرکز.
          </p>
        </Card>

        {centres.length === 0 ? (
          <EmptyState title="هنوز مرکزی به شما سپرده نشده است" description="اگر مدیر یک مرکز هستید، از مسیر Claim مرکز اقدام کنید." />
        ) : (
          <ul className="space-y-sm" data-testid="my-centres">
            {centres.map((row) => (
              <li key={row.centre.id}>
                <Link
                  href={'/account/centres/' + row.centre.id}
                  className="block rounded-lg border border-border-subtle bg-bg-surface p-lg hover:border-border-brand"
                  data-testid={'my-centre-' + row.centre.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-sm">
                    <div className="min-w-0">
                      <p className="text-label-lg">{row.centre.displayNameFa}</p>
                      <p className="mt-2xs text-caption text-text-secondary">
                        {[row.typeNameFa, row.cityNameFa].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <StatusBadge tone={row.centre.publicStatus === 'PUBLISHED' ? 'success' : row.centre.publicStatus === 'HIDDEN' ? 'warning' : 'neutral'}>
                      {CENTRE_STATUS_FA[row.centre.publicStatus as CentreStatus]}
                    </StatusBadge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PublicShell>
  );
}
