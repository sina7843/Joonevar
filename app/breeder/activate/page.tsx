import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { kennelEntry, KENNEL_STATUS_FA } from '../../../src/kennels/service.ts';

export const dynamic = 'force-dynamic';

/**
 * Breeder activation — §15.1, F11.
 *
 * The approved states are kept: under review, approved and needs correction.
 * They are the kennel's own states, because the role is activated from inside
 * the kennel flow and nothing else gates it — no extra document and no separate
 * activation payment.
 */
export default async function BreederActivatePage() {
  const guard = await guardRoute('/breeder/activate');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const { eligibility, kennel } = await kennelEntry(db(), guard.actor);

  return (
    <PublicShell actor={guard.actor} title="فعال‌سازی پرورش‌دهنده" pathname="/breeder/activate">
      <div className="space-y-lg">
        <Card>
          <h2 className="text-label-lg">نقش پرورش‌دهنده چگونه فعال می‌شود</h2>
          <p className="mt-md text-body-sm" data-testid="breeder-activation-rule">
            نقش پرورش‌دهنده با تأیید پرونده کنل فعال می‌شود. مدرک اضافه‌ای جز همان کارت ملی KYC خواسته
            نمی‌شود و پرداخت مستقلی با عنوان «فعال‌سازی نقش» وجود ندارد؛ تنها پرداخت این مسیر، هزینه ثبت کنل
            است.
          </p>
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-md">
            <h3 className="text-label-lg">وضعیت فعلی شما</h3>
            {kennel ? (
              <StatusBadge
                tone={
                  kennel.status === 'APPROVED'
                    ? 'success'
                    : kennel.status === 'NEEDS_CORRECTION' || kennel.status === 'REJECTED'
                      ? 'warning'
                      : 'info'
                }
              >
                <span data-testid="breeder-status">{KENNEL_STATUS_FA[kennel.status]}</span>
              </StatusBadge>
            ) : (
              <StatusBadge tone="neutral">
                <span data-testid="breeder-status">شروع نشده</span>
              </StatusBadge>
            )}
          </div>

          {kennel?.status === 'APPROVED' ? (
            <Alert tone="success" title="نقش پرورش‌دهنده فعال است">
              از تغییر نقش در بالای صفحه می‌توانید به محیط پرورش‌دهنده بروید.
            </Alert>
          ) : null}
          {kennel?.reasonFa ? <p className="mt-md text-body-sm">{kennel.reasonFa}</p> : null}

          <p className="mt-lg text-body-sm">
            <Link href="/kennels" className="text-text-brand underline underline-offset-4" data-testid="go-to-kennels">
              {kennel ? 'ادامه پرونده کنل' : 'شروع ثبت کنل'}
            </Link>
          </p>
          {eligibility.allowed ? null : (
            <p className="mt-sm text-caption text-text-secondary" data-testid="breeder-lock-reason">
              {eligibility.lock.reason} — {eligibility.lock.nextPrerequisite}
            </p>
          )}
        </Card>
      </div>
    </PublicShell>
  );
}
