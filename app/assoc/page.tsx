import Link from 'next/link';
import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../src/ui/shell.tsx';
import { Card } from '../../src/ui/card.tsx';
import { StatusBadge } from '../../src/ui/status.tsx';
import { db } from '../../src/db/client.ts';
import { associationQueues } from '../../src/operations/service.ts';

export const dynamic = 'force-dynamic';

/**
 * Association operations — §21.2, §21.5, D11.
 *
 * Every row is a real count from the same table its detail screen reads, and
 * every row opens that queue. A successful F14 membership never returns to a
 * blocking approval queue (D04), so membership is a register here, not a gate.
 */
export default async function AssocPage() {
  const guard = await guardRoute('/assoc');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const queues = await associationQueues(db(), guard.actor);

  return (
    <OpsShell actor={guard.actor} title="پنل انجمن" pathname="/assoc" nav={ASSOC_NAV}>
      <ul className="space-y-md" data-testid="assoc-queues">
        {queues.map((queue) => (
          <li key={queue.key}>
            <Card>
              <div className="flex items-start justify-between gap-md">
                <div className="min-w-0">
                  <h2 className="text-label-lg">{queue.titleFa}</h2>
                  <p className="mt-2xs text-caption text-text-secondary">{queue.noteFa}</p>
                </div>
                <StatusBadge tone={queue.waiting > 0 ? 'warning' : 'neutral'}>
                  <span data-testid={'queue-count-' + queue.key}>{queue.waiting}</span>
                </StatusBadge>
              </div>
              <p className="mt-lg text-body-sm">
                <Link
                  href={queue.href}
                  className="text-text-brand underline underline-offset-4"
                  data-testid={'open-queue-' + queue.key}
                >
                  باز کردن صف
                </Link>
              </p>
            </Card>
          </li>
        ))}
      </ul>
    </OpsShell>
  );
}
