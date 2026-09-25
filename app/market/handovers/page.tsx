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
      <div className="space-y-lg">
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
          <ul className="space-y-lg" data-testid="handover-queue">
            {queue.map((entry) => {
              const status = entry.status as HandoverStatus;
              return (
                <li key={entry.handoverId}>
                  <Card>
                    <div className="flex flex-wrap items-center gap-sm">
                      <StatusBadge tone={status === 'ON_HOLD' ? 'warning' : 'neutral'}>
                        <span data-testid={'handover-status-' + entry.inquiryId}>
                          {HANDOVER_STATUS_FA[status] ?? entry.status}
                        </span>
                      </StatusBadge>
                      <span className="text-label-lg">{entry.animalNameFa}</span>
                      <span className="text-caption text-text-secondary">زمان قرار: {when(entry.scheduledAt)}</span>
                      <Link href={'/account/purchases/' + entry.inquiryId} className="text-text-brand">
                        پرونده معامله
                      </Link>
                    </div>
                    {entry.endedReasonFa ? (
                      <p className="mt-sm text-caption text-text-secondary">{entry.endedReasonFa}</p>
                    ) : null}
                    <HandoverRecoveryForm
                      inquiryId={entry.inquiryId}
                      version={entry.version}
                      canRelease={status === 'ON_HOLD'}
                      canRecord={status === 'SELLER_ENTERED'}
                    />
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </OpsShell>
  );
}
