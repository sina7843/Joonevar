import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../src/ui/shell.tsx';
import { CaseItem, CaseList, DeskHead, DeskVersionNote, Panel, QueueMeta } from '../../../src/ui/desk.tsx';
import { CaseDrawer } from '../../../src/ui/desk-drawer.tsx';
import { ageInDays, keyStatus } from '../../../src/ui/queue.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { AppError } from '../../../src/domain/errors.ts';
import { disputeQueue } from '../../../src/marketplace/disputes.ts';
import {
  DISPUTE_SCOPE_FA,
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
 *
 * DS P09 queue; each row opens its P10 desk in a wide Drawer (no `[id]`
 * route): facts, claim, note, decision.
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
      <QueueMeta
        total={queue.length}
        noun="پرونده باز"
        oldestDays={queue.length > 0 ? Math.max(...queue.map((entry) => ageInDays(entry.createdAt) ?? 0)) : null}
      />
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
        <CaseList label="پرونده‌های اختلاف" testId="dispute-queue">
          {queue.map((entry) => (
            <CaseItem
              key={entry.id}
              type={DISPUTE_SCOPE_FA[entry.scope as DisputeScope] ?? entry.scope}
              name={entry.animalNameFa}
              sub={
                <>
                  {'بیعانه: ' + moneyFa(entry.depositAmountToman) + ' تومان · طرح‌کننده: ' + (entry.openedByParty === 'BUYER' ? 'خریدار' : 'فروشنده') + ' · ' + when(entry.createdAt) + ' · '}
                  <Link href={'/account/purchases/' + entry.inquiryId} className="hz-link">
                    گفت‌وگوی معامله
                  </Link>
                </>
              }
              ageDays={ageInDays(entry.createdAt)}
              status={{ ...keyStatus(entry.status), testId: 'dispute-status-' + entry.id }}
              owner="SYSTEM"
              ownerLabel="داور بازار"
              ownerIsUs
            >
              <CaseDrawer title="پرونده اختلاف" testId={'open-dispute-' + entry.id}>
                <DeskHead
                  title={entry.animalNameFa}
                  status={keyStatus(entry.status)}
                  meta={[
                    DISPUTE_SCOPE_FA[entry.scope as DisputeScope] ?? entry.scope,
                    'بیعانه: ' + moneyFa(entry.depositAmountToman) + ' تومان',
                    'طرح‌کننده: ' + (entry.openedByParty === 'BUYER' ? 'خریدار' : 'فروشنده'),
                    when(entry.createdAt),
                  ]}
                >
                  <Link href={'/account/purchases/' + entry.inquiryId} className="hz-link hz-link--standalone">
                    گفت‌وگوی معامله
                  </Link>
                </DeskHead>
                <Panel title="ادعا">
                  <blockquote className="hz-card hz-card--subtle text-body-sm" data-testid={'dispute-claim-' + entry.id}>
                    {entry.claimFa}
                  </blockquote>
                </Panel>
                <Panel title="یادداشت و مدرک بررسی">
                  <ReviewerNoteForm disputeId={entry.id} />
                </Panel>
                <Panel title="رأی">
                  <DisputeDecisionForm disputeId={entry.id} version={entry.version} depositFa={moneyFa(entry.depositAmountToman)} />
                  <DeskVersionNote version={entry.version} />
                </Panel>
              </CaseDrawer>
            </CaseItem>
          ))}
        </CaseList>
      )}
    </OpsShell>
  );
}
