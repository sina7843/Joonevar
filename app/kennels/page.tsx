import Link from 'next/link';
import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { PublicShell } from '../../src/ui/shell.tsx';
import { Card, LockedServiceCard } from '../../src/ui/card.tsx';
import { Alert } from '../../src/ui/alert.tsx';
import { StatusBadge } from '../../src/ui/status.tsx';
import { db } from '../../src/db/client.ts';
import { kennelEntry, KENNEL_STATUS_FA } from '../../src/kennels/service.ts';
import { StartKennelForm } from './forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * The kennel entry — §15.1, §15.2.
 *
 * The prerequisites are exactly the ones the source names: an active membership
 * and at least one animal with a registration sheet. Holding the breeder role
 * is never a condition here, because the role is what an approved kennel
 * produces, not what it needs.
 */
export default async function KennelsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const guard = await guardRoute('/kennels');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const { eligibility, kennel } = await kennelEntry(db(), guard.actor);
  const { error } = await searchParams;

  return (
    <PublicShell actor={guard.actor} title="کنل" pathname="/kennels">
      <div className="space-y-lg">
        {error ? <Alert tone="error" title={error} /> : null}

        {eligibility.allowed ? null : <LockedServiceCard serviceLabel="ثبت کنل" lock={eligibility.lock} />}

        {kennel ? (
          <Card>
            <div className="flex items-start justify-between gap-md">
              <div className="min-w-0">
                <h2 className="text-label-lg">{kennel.nameFa ?? 'کنل بدون نام'}</h2>
                <p className="mt-2xs text-caption text-text-secondary">
                  {[kennel.provinceFa, kennel.cityFa].filter(Boolean).join(' · ') || 'نشانی ثبت نشده'}
                </p>
              </div>
              <StatusBadge
                tone={
                  kennel.status === 'APPROVED'
                    ? 'success'
                    : kennel.status === 'NEEDS_CORRECTION' || kennel.status === 'REJECTED'
                      ? 'warning'
                      : 'info'
                }
              >
                <span data-testid="kennel-entry-status">{KENNEL_STATUS_FA[kennel.status]}</span>
              </StatusBadge>
            </div>
            <p className="mt-lg text-body-sm">
              <Link
                href={'/kennels/' + kennel.id}
                className="text-text-brand underline underline-offset-4"
                data-testid="open-kennel"
              >
                ادامه پرونده کنل
              </Link>
            </p>
          </Card>
        ) : eligibility.allowed ? (
          <Card>
            <h2 className="text-label-lg">ثبت کنل</h2>
            <p className="mt-md text-caption text-text-secondary">
              مسیر: تکمیل فرم و انتخاب نژادها → مرور → پرداخت → ارسال → بررسی انجمن. مدرک اضافه‌ای خواسته
              نمی‌شود و پرداخت جداگانه‌ای برای «فعال‌سازی نقش» وجود ندارد.
            </p>
            <div className="mt-lg">
              <StartKennelForm label="شروع ثبت کنل" />
            </div>
          </Card>
        ) : null}
      </div>
    </PublicShell>
  );
}
