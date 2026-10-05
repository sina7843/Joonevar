import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { ASSOC_NAV, OpsShell } from '../../../src/ui/shell.tsx';
import { CaseQueue, ageInDays } from '../../../src/ui/queue.tsx';
import { QueueMeta } from '../../../src/ui/desk.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
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
    <OpsShell actor={guard.actor} title="مجوز جفت‌گیری" pathname="/assoc/permits" nav={ASSOC_NAV}>
      {rows.length === 0 ? (
        <EmptyState
          title="پرونده مجوزی در انتظار بررسی نیست"
          description="پرونده‌هایی که هزینه آن‌ها پرداخت و سپس ارسال شده‌اند در همین صف دیده می‌شوند."
        />
      ) : (
        <>
          <QueueMeta total={rows.length} oldestDays={ageInDays(rows[0]?.submittedAt)} />
          <div data-testid="permit-queue">
            <CaseQueue
              label="صف مجوز جفت‌گیری"
              showCode={false}
              rows={rows.map((permit) => ({
                id: permit.id,
                href: '/assoc/permits/' + permit.id,
                name: 'پرونده مجوز جفت‌گیری',
                sub: 'ارسال: ' + (permit.submittedAt ? formatCivilDateFa(permit.submittedAt.toISOString().slice(0, 10)) : '—'),
                ageDays: ageInDays(permit.submittedAt),
                status: { tone: 'info' as const, label: PERMIT_STATUS_FA[permit.status] ?? '—' },
                owner: 'ASSOCIATION' as const,
                ownerIsUs: true,
                testId: 'open-permit-case',
              }))}
            />
          </div>
        </>
      )}
    </OpsShell>
  );
}
