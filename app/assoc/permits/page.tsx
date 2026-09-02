import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { ASSOC_NAV, OpsShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { permitQueue, PERMIT_STATUS_FA } from '../../../src/mating/permits.ts';
import { formatCivilDateFa } from '../../../src/domain/calendar.ts';

export const dynamic = 'force-dynamic';

/** Official permits waiting for the association — §16 step 8, §21.2, §21.5. */
export default async function AssocPermitsPage() {
  const guard = await guardRoute('/assoc/permits');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const rows = await permitQueue(db(), guard.actor);

  return (
    <OpsShell actor={guard.actor} title="هم‌زیست — انجمن" pathname="/assoc/permits" nav={ASSOC_NAV}>
      <div className="space-y-lg">
        {rows.length === 0 ? (
          <EmptyState
            title="پرونده مجوزی در انتظار بررسی نیست"
            description="پرونده‌هایی که هزینه آن‌ها پرداخت و سپس ارسال شده‌اند در همین صف دیده می‌شوند."
          />
        ) : (
          <ul className="space-y-lg" data-testid="permit-queue">
            {rows.map((permit) => (
              <li key={permit.id}>
                <Card>
                  <div className="flex items-start justify-between gap-md">
                    <div className="min-w-0">
                      <h2 className="text-label-md">پرونده مجوز جفت‌گیری</h2>
                      <p className="mt-2xs text-caption text-text-secondary">
                        ارسال:{' '}
                        {permit.submittedAt
                          ? formatCivilDateFa(permit.submittedAt.toISOString().slice(0, 10))
                          : '—'}
                      </p>
                    </div>
                    <StatusBadge tone="info">{PERMIT_STATUS_FA[permit.status]}</StatusBadge>
                  </div>
                  <p className="mt-lg text-body-sm">
                    <Link
                      href={'/assoc/permits/' + permit.id}
                      className="text-text-brand underline underline-offset-4"
                      data-testid="open-permit-case"
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
