import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../src/ui/shell.tsx';
import { SectionHeader } from '../../src/ui/section-header.tsx';
import { CountTiles, StatTiles } from '../../src/ui/desk.tsx';
import { db } from '../../src/db/client.ts';
import { associationQueues } from '../../src/operations/service.ts';

export const dynamic = 'force-dynamic';

/**
 * Association operations — §21.2, §21.5, D11 — DS P09 home / K13: a row of
 * QueueTiles, then the summary StatTiles.
 *
 * Every tile is a real count from the same table its detail screen reads, and
 * every tile opens that queue. A successful F14 membership never returns to a
 * blocking approval queue (D04), so membership is a register here, not a gate.
 */
export default async function AssocPage() {
  const guard = await guardRoute('/assoc');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const queues = await associationQueues(db(), guard.actor);
  const open = queues.reduce((sum, queue) => sum + queue.waiting, 0);
  const busy = queues.filter((queue) => queue.waiting > 0);

  return (
    <OpsShell actor={guard.actor} title="صف‌ها" pathname="/assoc" nav={ASSOC_NAV}>
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">محیط عملیاتی انجمن</span>
        <span className="hz-page-header__meta-item">
          {open.toLocaleString('fa-IR') + ' پرونده باز در ' + busy.length.toLocaleString('fa-IR') + ' صف'}
        </span>
      </p>

      <CountTiles queues={queues} testId="assoc-queues" countTestId="queue-count-" linkTestId="open-queue-" />

      <section className="space-y-md" aria-labelledby="assoc-summary">
        <SectionHeader title="خلاصه پرونده‌ها" size="sm" id="assoc-summary" />
        <StatTiles
          tiles={[
            { label: 'پرونده‌های باز', value: open, sub: 'در همه صف‌های انجمن' },
            { label: 'صف‌های دارای پرونده', value: busy.length, sub: 'از ' + queues.length.toLocaleString('fa-IR') + ' صف' },
            {
              label: 'صف‌های خالی',
              value: queues.length - busy.length,
              sub: 'پرونده تازه پس از ارسال کاربر می‌آید',
            },
            {
              label: 'بیشترین پرونده',
              value: busy.length === 0 ? null : Math.max(...busy.map((queue) => queue.waiting)),
              sub:
                busy.length === 0
                  ? 'همه صف‌ها خالی است'
                  : [...busy].sort((a, b) => b.waiting - a.waiting)[0]!.titleFa,
            },
          ]}
        />
      </section>
    </OpsShell>
  );
}
