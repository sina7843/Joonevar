import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { PublicShell } from '../../src/ui/shell.tsx';
import { Card, LockedServiceCard, ServiceCard } from '../../src/ui/card.tsx';
import { EmptyState } from '../../src/ui/states.tsx';
import { ButtonLink } from '../../src/ui/button.tsx';
import { Identifier, StatusBadge } from '../../src/ui/status.tsx';
import { Alert } from '../../src/ui/alert.tsx';
import { db } from '../../src/db/client.ts';
import { findProfile } from '../../src/identity/account.ts';
import { findMembership } from '../../src/billing/membership.ts';
import { eligibilitySummary, vetEligibilityFor } from '../../src/domain/eligibility/service.ts';
import type { Eligibility, ServiceName } from '../../src/domain/eligibility/rules.ts';

export const dynamic = 'force-dynamic';

/**
 * Dashboard — §8.
 *
 * It answers the four required questions from persisted state: what the
 * membership status is, what each animal has completed, which services are
 * open, and who the next action belongs to. Every lock below comes from the
 * shared server rule, so a card and a refused request can never disagree.
 */
const SERVICE_CARDS: ReadonlyArray<{ service: ServiceName; label: string; description: string; href: string }> = [
  {
    service: 'ANIMAL_REGISTRATION',
    label: 'ثبت حیوان هم‌زیست',
    description: 'پس از تأیید احراز هویت باز می‌شود؛ برای این کار عضویت لازم نیست.',
    href: '/animals/new',
  },
  {
    service: 'VET_VISIT_REQUEST',
    label: 'کاشت یا تأیید میکروچیپ',
    description: 'انتخاب دامپزشک معتمد و دریافت کد مراجعه.',
    href: '/vets/finder',
  },
  {
    service: 'REGISTRATION_SHEET',
    label: 'دریافت برگه ثبتی',
    description: 'پس از کاشت یا تأیید میکروچیپ و نمونه‌گیری.',
    href: '/registration/batch',
  },
  {
    service: 'PEDIGREE',
    label: 'دریافت شجره‌نامه',
    description: 'با نمونه موجود همان حیوان و برگه ثبتی صادرشده.',
    href: '/pedigree/request',
  },
  {
    service: 'KENNEL',
    label: 'شروع ثبت کنل',
    description: 'برای پرورش‌دهنده، با حداقل یک برگه ثبتی.',
    href: '/kennels/new',
  },
  {
    service: 'MATING_PERMIT',
    label: 'مجوز جفت‌گیری',
    description: 'برای دو حیوان شجره‌دار با تأیید طرفین.',
    href: '/mating/permits/new',
  },
  {
    service: 'PERSONAL_DECLARATION',
    label: 'اعلام توافق شخصی جفت‌گیری',
    description: 'ثبت وجود توافق، جدا از مسیر رسمی و بدون پرداخت.',
    href: '/declaration/new',
  },
];

function renderService(entry: (typeof SERVICE_CARDS)[number], eligibility: Eligibility) {
  if (eligibility.allowed) {
    return <ServiceCard key={entry.service} label={entry.label} description={entry.description} href={entry.href} />;
  }
  return <LockedServiceCard key={entry.service} serviceLabel={entry.label} lock={eligibility.lock} />;
}

export default async function DashboardPage() {
  const guard = await guardRoute('/dashboard');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  const profile = await findProfile(db(), actor.accountId);
  const membership = await findMembership(db(), actor.accountId);
  const { services } = await eligibilitySummary(db(), actor.accountId);
  const vet = actor.context === 'TRUSTED_VET' ? await vetEligibilityFor(db(), actor.accountId) : null;

  const membershipStatus = membership?.status ?? 'NONE';
  const membershipActive = membershipStatus === 'ACTIVE';

  return (
    <PublicShell actor={actor} title="داشبورد" pathname="/dashboard">
      <div className="space-y-xl">
        {profile === null ? (
          <Alert
            tone="warning"
            title="حساب شما هنوز کامل نیست"
            action={<ButtonLink href="/account/profile">تکمیل اطلاعات هویتی</ButtonLink>}
          >
            نام، نام خانوادگی، کد ملی و تاریخ تولد برای ادامه لازم است.
          </Alert>
        ) : null}

        {vet !== null && vet.reasonFa !== null ? (
          <Alert tone="warning" title="پذیرش کار جدید متوقف است">
            {vet.reasonFa}
          </Alert>
        ) : null}

        <section aria-labelledby="membership-heading">
          <h2 id="membership-heading" className="sr-only">
            عضویت انجمن
          </h2>
          <Card>
            <div className="flex items-start justify-between gap-md">
              <div>
                <p className="text-label-lg">عضویت انجمن</p>
                <p className="mt-2xs text-caption text-text-secondary">
                  {membershipActive
                    ? 'عضویت مادام‌العمر شما فعال است.'
                    : 'عضویت مادام‌العمر است و پس از تأیید پرداخت روی سرور فعال می‌شود.'}
                </p>
                {membershipActive ? (
                  <p className="mt-sm text-caption text-text-secondary" data-testid="dashboard-membership-number">
                    شماره عضویت:{' '}
                    {membership?.membershipNo ? (
                      <Identifier value={membership.membershipNo} />
                    ) : (
                      'در انتظار صدور — خدمات فعال شما متوقف نمی‌شود'
                    )}
                  </p>
                ) : null}
              </div>
              <StatusBadge
                tone={membershipActive ? 'success' : membershipStatus === 'PAYMENT_PENDING' ? 'info' : 'neutral'}
              >
                {membershipActive
                  ? 'فعال'
                  : membershipStatus === 'PAYMENT_PENDING'
                    ? 'در انتظار پرداخت'
                    : membershipStatus === 'INACTIVE'
                      ? 'غیرفعال'
                      : 'فعال نیست'}
              </StatusBadge>
            </div>
            <div className="mt-lg">
              <ButtonLink href="/membership" block tone={membershipActive ? 'secondary' : 'primary'}>
                {membershipActive ? 'مشاهده عضویت' : 'فعال‌سازی عضویت'}
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
            description={
              services.ANIMAL_REGISTRATION.allowed
                ? 'می‌توانید اولین حیوان خود را ثبت کنید.'
                : 'پس از تأیید احراز هویت، می‌توانید حیوان خود را در هم‌زیست ثبت کنید.'
            }
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
          {SERVICE_CARDS.map((entry) => renderService(entry, services[entry.service]))}
        </section>
      </div>
    </PublicShell>
  );
}
