import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card, LockedServiceCard } from '../../../src/ui/card.tsx';
import { ButtonLink } from '../../../src/ui/button.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { permitEntry, PERMIT_STATUS_FA } from '../../../src/mating/permits.ts';

export const dynamic = 'force-dynamic';

/**
 * The official permits of both sides — §16.
 *
 * A case appears here for the person who opened it and for the person the
 * pedigree code resolved to, and for nobody else.
 */
export default async function PermitsPage() {
  const guard = await guardRoute('/mating/permits');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const { eligibility, permits } = await permitEntry(db(), guard.actor);

  return (
    <PublicShell actor={guard.actor} title="مجوز رسمی جفت‌گیری" pathname="/mating/permits">
      <div className="space-y-lg">
        {eligibility.allowed ? (
          <Card>
            <h2 className="text-label-lg">مجوز رسمی جفت‌گیری</h2>
            <p className="mt-md text-caption text-text-secondary">
              مسیر: انتخاب حیوان شجره‌دار خود → کد شجره‌نامه حیوان مقابل → شناسایی و تأیید طرف مقابل → ثبت
              توافق تقسیم → مرور → پرداخت → ارسال → بررسی و صدور مجوز.
            </p>
            <div className="mt-lg">
              <ButtonLink href="/mating/permits/new" block data-testid="new-permit">
                شروع مجوز جفت‌گیری
              </ButtonLink>
            </div>
          </Card>
        ) : (
          <LockedServiceCard serviceLabel="مجوز جفت‌گیری" lock={eligibility.lock} />
        )}

        {permits.length === 0 ? (
          <EmptyState
            title="هنوز پرونده مجوزی ندارید"
            description="پرونده‌هایی که خودتان باز کرده‌اید یا به آن‌ها دعوت شده‌اید در همین فهرست دیده می‌شوند."
          />
        ) : (
          <ul className="space-y-lg" data-testid="permit-list">
            {permits.map((permit) => (
              <li key={permit.id}>
                <Card>
                  <div className="flex items-start justify-between gap-md">
                    <div className="min-w-0">
                      <h3 className="text-label-md">
                        {permit.permitNo ?? 'پرونده مجوز'}
                      </h3>
                      <p className="mt-2xs text-caption text-text-secondary">
                        {permit.initiatorAccountId === guard.actor.accountId
                          ? 'آغازکننده: شما'
                          : 'شما طرف مقابل این پرونده هستید'}
                      </p>
                    </div>
                    <StatusBadge
                      tone={
                        permit.status === 'ISSUED'
                          ? 'success'
                          : permit.status === 'REJECTED' || permit.status === 'NEEDS_CORRECTION'
                            ? 'warning'
                            : 'info'
                      }
                    >
                      {PERMIT_STATUS_FA[permit.status]}
                    </StatusBadge>
                  </div>
                  <p className="mt-lg text-body-sm">
                    <Link
                      href={'/mating/permits/' + permit.id}
                      className="text-text-brand underline underline-offset-4"
                      data-testid="open-permit"
                    >
                      ادامه پرونده مجوز
                    </Link>
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PublicShell>
  );
}
