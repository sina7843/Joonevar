import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../src/ui/shell.tsx';
import { CaseItem, CaseList, QueueMeta } from '../../../src/ui/desk.tsx';
import { keyStatus } from '../../../src/ui/queue.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { AppError } from '../../../src/domain/errors.ts';
import { stuckHandovers } from '../../../src/marketplace/handover.ts';
import { HANDOVER_STATUS_FA, type HandoverStatus } from '../../../src/marketplace/handover-model.ts';
import { HandoverRecoveryForm } from '../../../src/marketplace/settlement-forms.tsx';

export const dynamic = 'force-dynamic';

const when = (value: Date | null) =>
  value === null ? '—' : new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(value);

/**
 * Handovers that stopped somewhere — PROMPT-007.
 *
 * Everything here is a meeting that did not end in a transfer: held by a
 * dispute, refused at the door, left with an expired code, or waiting on a
 * buyer's confirmation that never came. The recovery an administrator has is
 * deliberately narrow — it skips the one-time code and nothing else, and every
 * condition of the transfer is checked again when it runs.
 *
 * DS P09 case cards with the narrow recovery step inline (no `[id]` route).
 */
export default async function HandoverRecoveryPage() {
  const guard = await guardRoute('/market/handovers');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  let queue;
  try {
    queue = await stuckHandovers(db(), guard.actor);
  } catch (error) {
    if (error instanceof AppError) return <AccessDenied error={error} />;
    throw error;
  }

  return (
    <OpsShell actor={guard.actor} title="تحویل‌های متوقف‌مانده" nav={marketNav(guard.actor)} pathname="/market/handovers">
      <QueueMeta total={queue.length} noun="تحویل متوقف" />
      <Alert tone="info" title="ثبت دستی، دور زدن شواهد نیست">
        <span data-testid="handover-recovery-note">
          ثبت دستی تحویل فقط کد یک‌بارمصرف را کنار می‌گذارد. بیعانه تأییدشده، حداقل سن، میکروچیپ ثبت‌شده،
          اختیار فروشنده، قابل‌انتقال بودن حیوان، نبود انتقال دیگر و بسته‌بودن پرونده اختلاف همچنان بررسی
          می‌شوند و نام ثبت‌کننده روی انتقال مالکیت می‌ماند.
        </span>
      </Alert>

      {queue.length === 0 ? (
        <div data-testid="handover-queue-empty">
          <EmptyState
            title="تحویل متوقف‌مانده‌ای نیست"
            description="هر تحویلی که متوقف، رد یا منقضی شود یا منتظر تأیید خریدار بماند، اینجا می‌آید."
          />
        </div>
      ) : (
        <CaseList label="تحویل‌های متوقف‌مانده" testId="handover-queue">
          {queue.map((entry) => {
            const status = entry.status as HandoverStatus;
            return (
              <CaseItem
                key={entry.handoverId}
                type="تحویل حیوان"
                name={entry.animalNameFa}
                sub={
                  <>
                    {'زمان قرار: ' + when(entry.scheduledAt) + ' · '}
                    <Link href={'/account/purchases/' + entry.inquiryId} className="hz-link">
                      پرونده معامله
                    </Link>
                    {entry.endedReasonFa ? <span className="block">{entry.endedReasonFa}</span> : null}
                  </>
                }
                status={{
                  // GAPS #4: no dictionary key for SELLER_ENTERED, REFUSED, ON_HOLD — module label and tone kept.
                  ...keyStatus(status, { tone: status === 'ON_HOLD' ? 'warning' : 'neutral', label: HANDOVER_STATUS_FA[status] ?? entry.status }),
                  testId: 'handover-status-' + entry.inquiryId,
                }}
                owner="SYSTEM"
                ownerLabel="پشتیبانی بازار"
                ownerIsUs
              >
                <HandoverRecoveryForm
                  inquiryId={entry.inquiryId}
                  version={entry.version}
                  canRelease={status === 'ON_HOLD'}
                  canRecord={status === 'SELLER_ENTERED'}
                />
              </CaseItem>
            );
          })}
        </CaseList>
      )}
    </OpsShell>
  );
}
