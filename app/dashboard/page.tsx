import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { PublicShell } from '../../src/ui/shell.tsx';
import { Card, LockedServiceCard } from '../../src/ui/card.tsx';
import { EmptyState } from '../../src/ui/states.tsx';
import { ButtonLink } from '../../src/ui/button.tsx';
import { StatusBadge } from '../../src/ui/status.tsx';
import { LOCK_KYC_REQUIRED, LOCK_MEMBERSHIP_REQUIRED } from '../../src/domain/eligibility/locks.ts';

export const dynamic = 'force-dynamic';

/**
 * Dashboard — §8.
 *
 * The four questions the dashboard must answer are the four sections below:
 * membership status, what each animal has completed, which services are
 * available, and who the next action belongs to.
 *
 * Nothing here is filled with sample records. Membership, animals and requests
 * arrive in PROMPT-005 to PROMPT-007; until then the real answer is "none yet",
 * and the locked services show the genuine reason with a direct CTA.
 */
export default async function DashboardPage() {
  const guard = await guardRoute('/dashboard');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  return (
    <PublicShell actor={actor} title="داشبورد" pathname="/dashboard">
      <div className="space-y-xl">
        <section aria-labelledby="membership-heading">
          <h2 id="membership-heading" className="sr-only">
            عضویت انجمن
          </h2>
          <Card>
            <div className="flex items-start justify-between gap-md">
              <div>
                <p className="text-label-lg">عضویت انجمن</p>
                <p className="mt-2xs text-caption text-text-secondary">
                  عضویت مادام‌العمر است و پس از پرداخت موفق فعال می‌شود.
                </p>
              </div>
              <StatusBadge tone="neutral">فعال نیست</StatusBadge>
            </div>
            <div className="mt-lg">
              <ButtonLink href="/membership" block>
                مشاهده عضویت
              </ButtonLink>
            </div>
          </Card>
        </section>

        <section aria-labelledby="animals-heading" className="space-y-md">
          <h2 id="animals-heading" className="text-h4">
            حیوان‌های من
          </h2>
          <EmptyState
            title="هنوز حیوانی ثبت نکرده‌اید"
            description="پس از تأیید احراز هویت، می‌توانید حیوان خود را در هم‌زیست ثبت کنید."
          />
        </section>

        <section aria-labelledby="requests-heading" className="space-y-md">
          <h2 id="requests-heading" className="text-h4">
            درخواست‌های فعال
          </h2>
          <EmptyState
            title="درخواست فعالی ندارید"
            description="درخواست‌های مراجعه، صدور سند و بررسی پس از ایجاد در این بخش دیده می‌شوند."
          />
        </section>

        <section aria-labelledby="services-heading" className="space-y-lg">
          <h2 id="services-heading" className="text-h4">
            سرویس‌ها
          </h2>
          <LockedServiceCard serviceLabel="ثبت حیوان هم‌زیست" lock={LOCK_KYC_REQUIRED} />
          <LockedServiceCard serviceLabel="کاشت یا تأیید میکروچیپ" lock={LOCK_MEMBERSHIP_REQUIRED} />
        </section>
      </div>
    </PublicShell>
  );
}
