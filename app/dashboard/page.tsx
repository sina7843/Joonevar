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
import type { ServiceName } from '../../src/domain/eligibility/rules.ts';
import type { LockDetail } from '../../src/domain/errors.ts';

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
  /*
   * §13 and Flow Map section 02 are one service, not two. The chain is: choose
   * animals, choose implant or verification per animal, choose the trusted vet,
   * get the referral, have the chip and the mandatory sample done at the visit,
   * pay once, and receive an independent sheet per animal. Offering the visit
   * as its own dashboard service made step 4 look like a separate errand the
   * person had to complete before the sheet would unlock — §5 lists no such
   * service. It stays reachable from inside the flow, per animal.
   */
  {
    service: 'REGISTRATION_SHEET',
    label: 'برگه ثبتی',
    description: 'میکروچیپ و نمونه‌گیری نزد دامپزشک معتمد، پرداخت گروهی و صدور برگه هر حیوان — یک مسیر.',
    href: '/registration/new',
  },
  {
    service: 'PEDIGREE',
    label: 'دریافت شجره‌نامه',
    description: 'با نمونه موجود همان حیوان و برگه ثبتی صادرشده.',
    href: '/pedigree',
  },
  {
    service: 'KENNEL',
    label: 'شروع ثبت کنل',
    description: 'برای پرورش‌دهنده، با حداقل یک برگه ثبتی.',
    href: '/kennels',
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

/**
 * §8: what is open, and what the one next action is.
 *
 * Every service that depends on identity verification repeats the same lock, so
 * listing all of them turned the dashboard into a wall of the same sentence and
 * buried the single thing the person can actually do. Locked services are
 * grouped by the prerequisite they are waiting for: one card carries the reason
 * and the CTA, and names the services it opens. Nothing is hidden — a service
 * the person cannot start is still shown, once, with its real reason.
 */
function groupLocked(
  entries: ReadonlyArray<{ entry: (typeof SERVICE_CARDS)[number]; lock: LockDetail }>,
): ReadonlyArray<{ lock: LockDetail; labels: readonly string[] }> {
  const groups = new Map<string, { lock: LockDetail; labels: string[] }>();
  for (const { entry, lock } of entries) {
    const key = lock.reason + '|' + lock.nextPrerequisite + '|' + lock.cta.href;
    const existing = groups.get(key);
    if (existing) existing.labels.push(entry.label);
    else groups.set(key, { lock, labels: [entry.label] });
  }
  return [...groups.values()];
}

/**
 * D11: the operational environments are separate, and they are not a public
 * role switch — but an operator still has to be able to reach the one they are
 * entitled to. Without this, signing in as an operator landed on the citizen
 * dashboard with a membership card and locked citizen services, and the only
 * way into their own panel was to type its address. Operational work has never
 * depended on association membership; the server checks the role, and only the
 * role, on every one of these routes.
 */
const OPS_ENVIRONMENTS: ReadonlyArray<{
  role: 'ASSOCIATION_OPERATOR' | 'GENETICS_OPERATOR' | 'SUPERADMIN';
  label: string;
  description: string;
  href: string;
}> = [
  {
    role: 'ASSOCIATION_OPERATOR',
    label: 'محیط عملیاتی انجمن',
    description: 'صف‌های احراز هویت، عضویت، کنل، مجوز جفت‌گیری و درخواست‌های پستی.',
    href: '/assoc',
  },
  {
    role: 'GENETICS_OPERATOR',
    label: 'محیط عملیاتی مرکز ژنتیک',
    description: 'فیش‌ها، نمونه‌ها، نتایج و اعتراض‌ها.',
    href: '/genetics',
  },
  {
    role: 'SUPERADMIN',
    label: 'محیط سوپرادمین',
    description: 'تنظیمات، دامپزشکان معتمد، نژادها و تاریخچه.',
    href: '/admin',
  },
];

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

  const operational = OPS_ENVIRONMENTS.filter((environment) =>
    actor.activeRoles.includes(environment.role),
  );

  const open = SERVICE_CARDS.filter((entry) => services[entry.service].allowed);
  const locked = SERVICE_CARDS.flatMap((entry) => {
    const eligibility = services[entry.service];
    return eligibility.allowed ? [] : [{ entry, lock: eligibility.lock }];
  });

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

        {operational.length > 0 ? (
          <section aria-labelledby="ops-heading" className="space-y-md">
            <h2 id="ops-heading" className="text-h4">
              محیط‌های عملیاتی شما
            </h2>
            <Card>
              <p className="text-caption text-text-secondary">
                این محیط‌ها از حساب کاربری شما جدا هستند و برای کار در آن‌ها عضویت انجمن لازم نیست؛ فقط نقش
                فعال شما بررسی می‌شود.
              </p>
              <div className="mt-lg space-y-md">
                {operational.map((environment) => (
                  <div key={environment.href} className="space-y-2xs">
                    <ButtonLink href={environment.href} block data-testid={'ops-entry-' + environment.role}>
                      {environment.label}
                    </ButtonLink>
                    <p className="text-caption text-text-secondary">{environment.description}</p>
                  </div>
                ))}
              </div>
            </Card>
          </section>
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

          {open.map((entry) => (
            <ServiceCard
              key={entry.service}
              label={entry.label}
              description={entry.description}
              href={entry.href}
            />
          ))}

          {open.length === 0 && locked.length > 0 ? (
            <p className="text-body-sm text-text-secondary" data-testid="no-open-service">
              هنوز هیچ سرویسی برای شما باز نیست. با انجام کار زیر، سرویس‌های وابسته به آن باز می‌شوند.
            </p>
          ) : null}

          {groupLocked(locked).map((group) => (
            <div key={group.lock.reason + group.lock.cta.href} className="space-y-md">
              <LockedServiceCard serviceLabel={group.labels[0]!} lock={group.lock} />
              {group.labels.length > 1 ? (
                <p className="text-caption text-text-secondary" data-testid="locked-group-more">
                  با همین کار، {group.labels.length - 1} سرویس دیگر هم باز می‌شود:{' '}
                  {group.labels.slice(1).join('، ')}.
                </p>
              ) : null}
            </div>
          ))}
        </section>
      </div>
    </PublicShell>
  );
}
