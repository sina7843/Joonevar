import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { ASSOC_NAV, OpsShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { kennelQueue, KENNEL_STATUS_FA } from '../../../src/kennels/service.ts';
import { formatCivilDateFa } from '../../../src/domain/calendar.ts';

export const dynamic = 'force-dynamic';

/** Kennels waiting for the association — §15.2, §21.2, §21.5. */
export default async function AssocKennelsPage() {
  const guard = await guardRoute('/assoc/kennels');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const rows = await kennelQueue(db(), guard.actor);

  return (
    <OpsShell actor={guard.actor} title="هم‌زیست — انجمن" pathname="/assoc/kennels" nav={ASSOC_NAV}>
      <div className="space-y-lg">
        {rows.length === 0 ? (
          <EmptyState
            title="پرونده کنلی در انتظار بررسی نیست"
            description="کنل‌هایی که پرداخت و ارسال شده‌اند در همین صف دیده می‌شوند."
          />
        ) : (
          <ul className="space-y-lg" data-testid="kennel-queue">
            {rows.map((kennel) => (
              <li key={kennel.id}>
                <Card>
                  <div className="flex items-start justify-between gap-md">
                    <div className="min-w-0">
                      <h2 className="text-label-lg">{kennel.nameFa ?? 'کنل بدون نام'}</h2>
                      <p className="mt-2xs text-caption text-text-secondary">
                        {[kennel.provinceFa, kennel.cityFa].filter(Boolean).join(' · ')} ·{' '}
                        {kennel.submittedAt
                          ? formatCivilDateFa(kennel.submittedAt.toISOString().slice(0, 10))
                          : '—'}
                      </p>
                    </div>
                    <StatusBadge tone="info">{KENNEL_STATUS_FA[kennel.status]}</StatusBadge>
                  </div>
                  <p className="mt-lg text-body-sm">
                    <Link
                      href={'/assoc/kennels/' + kennel.id}
                      className="text-text-brand underline underline-offset-4"
                      data-testid="open-kennel-case"
                    >
                      بررسی پرونده
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
