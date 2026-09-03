import Link from 'next/link';
import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { PublicShell } from '../../src/ui/shell.tsx';
import { Card } from '../../src/ui/card.tsx';
import { EmptyState } from '../../src/ui/states.tsx';
import { Alert } from '../../src/ui/alert.tsx';
import { ButtonLink } from '../../src/ui/button.tsx';
import { StatusBadge } from '../../src/ui/status.tsx';
import { db } from '../../src/db/client.ts';
import { vetCompleted, vetQueue } from '../../src/vets/visits.ts';
import { vetEligibilityFor } from '../../src/domain/eligibility/service.ts';
import { REQUEST_STATUS_FA, REQUEST_STATUS_TONE, SERVICE_TYPE_FA } from '../../src/domain/referral.ts';
import { formatCivilDateFa } from '../../src/domain/calendar.ts';

export const dynamic = 'force-dynamic';

/**
 * Trusted veterinarian panel (§21.1, §7.1).
 *
 * The queue shows only requests assigned to this veterinarian; there is no
 * general pool anyone can pick from (D08). A membership that has lapsed closes
 * new assignment but leaves the work already here completable, and the panel
 * says which of the two is happening.
 */
export default async function VetPage() {
  const guard = await guardRoute('/vet');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const [queue, completed, eligibility] = await Promise.all([
    vetQueue(db(), guard.actor),
    vetCompleted(db(), guard.actor),
    vetEligibilityFor(db(), guard.actor.accountId),
  ]);

  return (
    <PublicShell actor={guard.actor} title="پنل دامپزشک معتمد" pathname="/vet">
      <div className="space-y-lg">
        {eligibility && !eligibility.canAcceptNewWork ? (
          <Alert tone="warning" title="پذیرش کار جدید محدود است">
            <span data-testid="vet-restriction">{eligibility.reasonFa}</span>
          </Alert>
        ) : (
          <Alert tone="info" title="فقط درخواست‌های تخصیص‌یافته">
            هر مراجعه به همین دامپزشک و همین Location تعلق دارد. صف عمومی قابل برداشتن توسط دامپزشک دیگر وجود ندارد.
          </Alert>
        )}

        <ButtonLink href="/vet/check-in" block data-testid="open-check-in">
          پذیرش با QR یا کد مراجعه
        </ButtonLink>
        <ButtonLink tone="secondary" href="/vet/samples" block data-testid="open-custody">
          نمونه‌های نزد من
        </ButtonLink>

        {queue.length === 0 ? (
          <EmptyState
            title="درخواستی به شما تخصیص نیافته است"
            description="پس از ساخت درخواست مراجعه توسط کاربر، پرونده در همین صف دیده می‌شود."
          />
        ) : (
          <ul className="space-y-lg" data-testid="vet-queue">
            {queue.map((row) => (
              <li key={row.request.id}>
                <Card>
                  <div className="flex items-start justify-between gap-md">
                    <div className="min-w-0">
                      <h2 className="text-label-lg">{SERVICE_TYPE_FA[row.request.serviceType]}</h2>
                      <p className="mt-2xs text-caption text-text-secondary">{row.locationNameFa}</p>
                      {row.referral ? (
                        <p className="mt-2xs text-caption text-text-secondary">
                          مهلت مراجعه تا {formatCivilDateFa(row.referral.expiresAt.toISOString().slice(0, 10))}
                        </p>
                      ) : null}
                    </div>
                    <StatusBadge tone={REQUEST_STATUS_TONE[row.request.status]!}>
                      {REQUEST_STATUS_FA[row.request.status]}
                    </StatusBadge>
                  </div>
                  <p className="mt-lg text-body-sm">
                    <Link
                      href={'/vet/requests/' + row.request.id}
                      className="text-text-brand underline underline-offset-4"
                      data-testid="open-vet-request"
                    >
                      مشاهده پرونده
                    </Link>
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}

        {completed.length === 0 ? null : (
          <Card>
            <h2 className="text-label-lg">پرونده‌های تکمیل‌شده اخیر</h2>
            <ul className="mt-md space-y-sm text-body-sm" data-testid="vet-completed">
              {completed.map((row) => (
                <li key={row.request.id}>
                  <Link
                    href={'/vet/requests/' + row.request.id}
                    className="text-text-brand underline underline-offset-4"
                  >
                    {SERVICE_TYPE_FA[row.request.serviceType]} — مشاهده مرور نهایی
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </PublicShell>
  );
}
