import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { AppError } from '../../../src/domain/errors.ts';
import { disputeQueue } from '../../../src/marketplace/disputes.ts';
import {
  DISPUTE_SCOPE_FA,
  DISPUTE_STATUS_FA,
  OUT_OF_SCOPE_FA,
  type DisputeScope,
} from '../../../src/marketplace/cancellation-model.ts';
import { DisputeDecisionForm, ReviewerNoteForm } from '../../../src/marketplace/settlement-forms.tsx';

export const dynamic = 'force-dynamic';

const moneyFa = (value: bigint | null) => (value === null ? '—' : value.toLocaleString('fa-IR'));
const when = (value: Date) =>
  new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(value);

/**
 * The arbitration queue — PROMPT-006.
 *
 * Three subjects and no more: the deposit, the truth of the recorded listing
 * facts, and whether the handover happened. The limit is printed on the page
 * the reviewer works from, because a reviewer who quietly decides the remaining
 * price would be making a promise the product cannot keep.
 */
export default async function DisputeQueuePage() {
  const guard = await guardRoute('/market/disputes');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  let queue;
  try {
    queue = await disputeQueue(db(), guard.actor);
  } catch (error) {
    if (error instanceof AppError) return <AccessDenied error={error} />;
    throw error;
  }

  return (
    <OpsShell actor={guard.actor} title="پرونده‌های اختلاف" nav={marketNav(guard.actor)} pathname="/market/disputes">
      <div className="space-y-lg">
        <Alert tone="info" title="دامنه داوری">
          <span data-testid="dispute-scope-note">{OUT_OF_SCOPE_FA}</span>
        </Alert>

        {queue.length === 0 ? (
          <div data-testid="dispute-queue-empty">
            <EmptyState
              title="پرونده بازی نیست"
              description="هر اختلافی که طرفین یک معامله باز کنند، اینجا برای بررسی می‌آید."
            />
          </div>
        ) : (
          <ul className="space-y-lg" data-testid="dispute-queue">
            {queue.map((entry) => (
              <li key={entry.id}>
                <Card>
                  <div className="flex flex-wrap items-center gap-sm">
                    <StatusBadge tone="neutral">
                      <span data-testid={'dispute-status-' + entry.id}>
                        {DISPUTE_STATUS_FA[entry.status] ?? entry.status}
                      </span>
                    </StatusBadge>
                    <span className="text-label-lg">{entry.animalNameFa}</span>
                    <span className="text-caption text-text-secondary">
                      {DISPUTE_SCOPE_FA[entry.scope as DisputeScope] ?? entry.scope}
                    </span>
                    <span className="text-caption text-text-secondary">
                      بیعانه: {moneyFa(entry.depositAmountToman)} تومان
                    </span>
                    <span className="text-caption text-text-secondary">
                      طرح‌کننده: {entry.openedByParty === 'BUYER' ? 'خریدار' : 'فروشنده'}
                    </span>
                    <span className="text-caption text-text-secondary">{when(entry.createdAt)}</span>
                    <Link href={'/account/purchases/' + entry.inquiryId} className="text-text-brand">
                      گفت‌وگوی معامله
                    </Link>
                  </div>
                  <p className="mt-sm text-body-sm" data-testid={'dispute-claim-' + entry.id}>
                    {entry.claimFa}
                  </p>
                  <ReviewerNoteForm disputeId={entry.id} />
                  <DisputeDecisionForm
                    disputeId={entry.id}
                    version={entry.version}
                    depositFa={moneyFa(entry.depositAmountToman)}
                  />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </OpsShell>
  );
}
