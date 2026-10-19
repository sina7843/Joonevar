import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { ASSOC_NAV, OpsShell } from '../../../src/ui/shell.tsx';
import { ageInDays, keyStatus } from '../../../src/ui/queue.tsx';
import { CaseItem, CaseList, QueueMeta } from '../../../src/ui/desk.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { kennelQueue } from '../../../src/kennels/service.ts';
import { formatCivilDateFa } from '../../../src/domain/calendar.ts';

export const dynamic = 'force-dynamic';

/** Kennels waiting for the association — §15.2, §21.2, §21.5. */
export default async function AssocKennelsPage() {
  const guard = await guardRoute('/assoc/kennels');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const rows = await kennelQueue(db(), guard.actor);

  return (
    <OpsShell actor={guard.actor} title="کنل" pathname="/assoc/kennels" nav={ASSOC_NAV}>
      {rows.length === 0 ? (
        <EmptyState
          title="پرونده کنلی در انتظار بررسی نیست"
          description="کنل‌هایی که پرداخت و ارسال شده‌اند در همین صف دیده می‌شوند."
        />
      ) : (
        <>
          <QueueMeta total={rows.length} oldestDays={Math.max(...rows.map((kennel) => ageInDays(kennel.submittedAt) ?? 0))} />
          <CaseList label="صف کنل" testId="kennel-queue">
            {rows.map((kennel) => (
              <CaseItem
                key={kennel.id}
                name={kennel.nameFa ?? 'کنل بدون نام'}
                href={'/assoc/kennels/' + kennel.id}
                linkLabel="بررسی پرونده"
                linkTestId="open-kennel-case"
                sub={
                  [kennel.provinceFa, kennel.cityFa].filter(Boolean).join('، ') +
                  ' · ارسال: ' +
                  (kennel.submittedAt ? formatCivilDateFa(kennel.submittedAt.toISOString().slice(0, 10)) : '—')
                }
                ageDays={ageInDays(kennel.submittedAt)}
                status={keyStatus(kennel.status)}
                owner="ASSOCIATION"
                ownerIsUs
              />
            ))}
          </CaseList>
        </>
      )}
    </OpsShell>
  );
}
