import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { PublicShell } from '../../src/ui/shell.tsx';
import Link from 'next/link';
import { AnimalCard, Card, LockedServiceCard, RequestCard, ServiceCard } from '../../src/ui/card.tsx';
import { SectionHeader, PageHeader } from '../../src/ui/section-header.tsx';
import { Icon } from '../../src/ui/icon.tsx';
import { ButtonLink } from '../../src/ui/button.tsx';
import { Identifier, StatusBadge } from '../../src/ui/status.tsx';
import { Alert } from '../../src/ui/alert.tsx';
import { db } from '../../src/db/client.ts';
import { unreadCount } from '../../src/notifications/service.ts';
import { myPayments } from '../../src/billing/receipts.ts';
import { findProfile } from '../../src/identity/account.ts';
import { membershipStanding } from '../../src/billing/membership.ts';
import { listAnimals } from '../../src/animals/service.ts';
import { listOwnerRequests } from '../../src/vets/visits.ts';
import { REQUEST_STATUS_FA, REQUEST_STATUS_TONE, SERVICE_TYPE_FA } from '../../src/domain/referral.ts';
import { formatCivilDateFa } from '../../src/domain/calendar.ts';
import { generationLabel } from '../../src/domain/lineage.ts';
import { professionalDashboard } from '../../src/vets/professional-profile.ts';

/** The dashboard is a summary; the full lists live on their own pages. */
const ANIMALS_ON_DASHBOARD = 3;
const REQUESTS_ON_DASHBOARD = 3;
import { eligibilitySummary, vetEligibilityFor } from '../../src/domain/eligibility/service.ts';
import type { ServiceName } from '../../src/domain/eligibility/rules.ts';
import type { LockDetail } from '../../src/domain/errors.ts';
import type { IconName } from '../../src/ui/icon-paths.ts';

export const dynamic = 'force-dynamic';

/**
 * Dashboard — §8.
 *
 * It answers the four required questions from persisted state: what the
 * membership status is, what each animal has completed, which services are
 * open, and who the next action belongs to. Every lock below comes from the
 * shared server rule, so a card and a refused request can never disagree.
 */
const SERVICE_CARDS: ReadonlyArray<{
  service: ServiceName;
  label: string;
  description: string;
  href: string;
  icon: IconName;
}> = [
  {
    service: 'ANIMAL_REGISTRATION',
    label: 'ثبت حیوان هم‌زیست',
    icon: 'pawPrint',
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
    icon: 'stamp',
    description: 'میکروچیپ و نمونه‌گیری نزد دامپزشک معتمد، پرداخت گروهی و صدور برگه هر حیوان — یک مسیر.',
    href: '/registration/new',
  },
  {
    service: 'PEDIGREE',
    label: 'دریافت شجره‌نامه',
    icon: 'certificate',
    description: 'با نمونه موجود همان حیوان و برگه ثبتی صادرشده.',
    href: '/pedigree',
  },
  {
    service: 'KENNEL',
    label: 'شروع ثبت کنل',
    icon: 'house',
    description: 'برای پرورش‌دهنده، با حداقل یک برگه ثبتی.',
    href: '/kennels',
  },
  {
    service: 'MATING_PERMIT',
    label: 'مجوز جفت‌گیری',
    icon: 'shieldCheck',
    description: 'برای دو حیوان شجره‌دار با تأیید طرفین.',
    href: '/mating/permits/new',
  },
  {
    service: 'PERSONAL_DECLARATION',
    label: 'اعلام توافق شخصی جفت‌گیری',
    icon: 'clipboardText',
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
): ReadonlyArray<{ lock: LockDetail; labels: readonly string[]; icons: readonly IconName[] }> {
  const groups = new Map<string, { lock: LockDetail; labels: string[]; icons: IconName[] }>();
  for (const { entry, lock } of entries) {
    const key = lock.reason + '|' + lock.nextPrerequisite + '|' + lock.cta.href;
    const existing = groups.get(key);
    if (existing) {
      existing.labels.push(entry.label);
      existing.icons.push(entry.icon);
    } else {
      groups.set(key, { lock, labels: [entry.label], icons: [entry.icon] });
    }
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
  role: 'ASSOCIATION_OPERATOR' | 'GENETICS_OPERATOR' | 'SUPERADMIN' | 'AUTHOR' | 'CONTENT_ADMIN';
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
  {
    role: 'AUTHOR',
    label: 'محیط نویسنده',
    description: 'نوشتن، زمان‌بندی و انتشار آموزش و خبر.',
    href: '/author',
  },
  {
    role: 'CONTENT_ADMIN',
    label: 'محیط ادمین محتوا',
    description: 'همه محتوا، پنهان‌سازی، بایگانی، حذف نرم و دسته‌ها.',
    href: '/content',
  },
];

export default async function DashboardPage() {
  const guard = await guardRoute('/dashboard');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  const profile = await findProfile(db(), actor.accountId);
  const membership = await membershipStanding(db(), actor.accountId);
  const { services } = await eligibilitySummary(db(), actor.accountId);
  const vet = actor.context === 'TRUSTED_VET' ? await vetEligibilityFor(db(), actor.accountId) : null;
  const professional = await professionalDashboard(db(), actor);

  // One authoritative answer, already aware of a period that has run out (PROMPT-009).
  const membershipActive = membership.valid;

  const [myAnimals, requestRows] = await Promise.all([
    listAnimals(db(), actor),
    listOwnerRequests(db(), actor),
  ]);
  // §8: "active" means the case is still moving — a completed visit belongs to
  // the animal's file, not to the list of what is waiting for someone.
  const activeRequests = requestRows.filter(
    (row) => row.request.status === 'ACTIVE' || row.request.status === 'CHECKED_IN',
  );

  const operational = OPS_ENVIRONMENTS.filter((environment) =>
    actor.activeRoles.includes(environment.role),
  );

  // What is waiting for this person, and the money side of their own account
  // (PROMPT-015). Both were missing from the dashboard entirely.
  const [unread, payments] = await Promise.all([
    unreadCount(db(), actor),
    myPayments(db(), actor, { page: 1, pageSize: 3 }),
  ]);

  const open = SERVICE_CARDS.filter((entry) => services[entry.service].allowed);
  const locked = SERVICE_CARDS.flatMap((entry) => {
    const eligibility = services[entry.service];
    return eligibility.allowed ? [] : [{ entry, lock: eligibility.lock }];
  });

  const greeting = profile === null ? 'سلام' : 'سلام، ' + profile.firstName;
  const today = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

  /*
   * K2 (P04 user dashboard): greeting header, the unread alert, payments and
   * membership as full-width panels, animals and active requests side by side
   * from 1024px, then the services grid with locked services in place.
   */
  return (
    <PublicShell
      actor={actor}
      title="داشبورد"
      pathname="/dashboard"
      unreadCount={unread}
      primaryAction={services.ANIMAL_REGISTRATION.allowed ? { href: '/animals/new', label: 'ثبت حیوان', icon: 'plus' } : undefined}
      header={
        <PageHeader
          title={<span data-testid="dashboard-greeting">{greeting}</span>}
          meta={[
            today,
            myAnimals.length.toLocaleString('fa-IR') + ' حیوان',
            activeRequests.length.toLocaleString('fa-IR') + ' درخواست فعال',
          ]}
        />
      }
    >
      <div className="space-y-xl">
        {unread > 0 ? (
          <div className="hz-alert hz-alert--info hz-alert--inline-action" role="status">
            <Icon name="bell" size="sm" className="hz-alert__icon" />
            <div className="hz-alert__body">
              <span className="hz-alert__title">{unread.toLocaleString('fa-IR') + ' اعلان خوانده‌نشده دارید'}</span>
              <span data-testid="dashboard-unread">
                هر اعلان به همان پرونده‌ای برمی‌گردد که درباره آن است؛ باز کردن آن، اعلان را خوانده‌شده ثبت می‌کند.
              </span>
              <div className="hz-alert__actions">
                <ButtonLink tone="secondary" size="sm" href="/notifications">
                  مشاهده اعلان‌ها
                </ButtonLink>
              </div>
            </div>
          </div>
        ) : null}

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

        {/*
          * D11: an operator reaches their own environment from here; the
          * environments are not a public role switch (RoleSwitcher › role list).
          */}
        {operational.length > 0 ? (
          <section aria-labelledby="ops-heading" className="hz-card">
            <SectionHeader size="sm" id="ops-heading" title="محیط‌های عملیاتی شما" />
            <p className="hz-caption">
              این محیط‌ها از حساب کاربری شما جدا هستند و برای کار در آن‌ها عضویت انجمن لازم نیست؛ فقط نقش فعال شما بررسی می‌شود.
            </p>
            <ul className="hz-role-list mt-md">
              {operational.map((environment) => (
                <li key={environment.href}>
                  <Link className="hz-role-link" href={environment.href} data-testid={'ops-entry-' + environment.role}>
                    <span className="hz-role-link__icon">
                      <Icon name="buildings" size="md" />
                    </span>
                    <span className="hz-role-link__text">
                      <span className="hz-role-link__name">{environment.label}</span>
                      <span className="hz-role-link__role">{environment.description}</span>
                    </span>
                    <span className="hz-role-link__end">
                      <Icon name="caretRight" size="sm" mirror />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/*
          * Phase 2.5 PROMPT-004: after sign-in, an ordinary account may choose a
          * veterinary path. Choosing nothing is a complete answer, so this is an
          * offer, never a gate.
          */}
        {actor.context === 'USER' && professional.profile === null && professional.cases.length === 0 ? (
          <section className="hz-card">
            <SectionHeader size="sm" title="مسیر حرفه‌ای دامپزشکی" />
            <p className="hz-caption">
              حساب شما یک حساب کاربری عادی است و همان می‌ماند. اگر دانشجو یا دکتر دامپزشک هستید، مسیر خود را انتخاب کنید؛ این انتخاب
              اختیاری است.
            </p>
            <div className="mt-md flex flex-wrap gap-sm" data-testid="dashboard-vet-path">
              <ButtonLink tone="secondary" size="sm" href="/account/vet-profile?path=student" data-testid="dashboard-path-student" iconStart="student">
                دانشجوی دامپزشکی
              </ButtonLink>
              <ButtonLink tone="secondary" size="sm" href="/account/vet-profile?path=doctor" data-testid="dashboard-path-doctor" iconStart="stethoscope">
                دکتر دامپزشک
              </ButtonLink>
            </div>
          </section>
        ) : null}

        <section aria-labelledby="payments-heading" className="hz-card">
          <SectionHeader
            size="sm"
            id="payments-heading"
            title="پرداخت‌ها و رسیدها"
            count={payments.items.length > 0 ? payments.items.length.toLocaleString('fa-IR') + ' پرداخت اخیر' : undefined}
            link={{ href: '/payments', label: 'همه پرداخت‌ها' }}
          />
          <p className="hz-caption" data-testid="dashboard-payments-note">
            {payments.items.length === 0
              ? 'هنوز پرداختی ثبت نشده است. هر پرداخت با مبلغ قفل‌شده و وضعیت تأیید سرور اینجا می‌آید.'
              : 'آخرین پرداخت‌های شما، با وضعیتی که سرور تأیید کرده است.'}
          </p>
          {payments.items.length > 0 ? (
            <div className="hz-table-wrap mt-md">
              <table className="hz-table" data-testid="dashboard-payments">
                <thead>
                  <tr>
                    <th scope="col">خدمت</th>
                    <th scope="col" className="hz-num">
                      مبلغ (تومان)
                    </th>
                    <th scope="col">وضعیت</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.items.map((line) => (
                    <tr key={line.batchId}>
                      <td>
                        <Link href={'/payments/' + line.batchId} className="hz-link">
                          {line.serviceFa}
                        </Link>
                      </td>
                      <td className="hz-num">{line.totalToman.toLocaleString('fa-IR')}</td>
                      <td>{line.statusFa}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section aria-labelledby="membership-heading" className="hz-card">
          <div className="flex items-start justify-between gap-md">
            <SectionHeader size="sm" id="membership-heading" title="عضویت انجمن" />
            <StatusBadge
              tone={
                membershipActive
                  ? 'success'
                  : membership.status === 'APPROVED_AWAITING_PAYMENT' || membership.status === 'PENDING_REVIEW'
                    ? 'info'
                    : 'neutral'
              }
            >
              <span data-testid="dashboard-membership-status">{membership.statusFa}</span>
            </StatusBadge>
          </div>
          <dl className="hz-kv hz-kv--2col">
            <div className="hz-kv__row">
              <dt className="hz-kv__key">وضعیت</dt>
              <dd className="hz-kv__value" data-testid="dashboard-membership-note">
                {membershipActive
                  ? membership.lifetime
                    ? 'عضویت مادام‌العمر شما برقرار است.'
                    : membership.endsAt
                      ? 'عضویت شما تا ' + formatCivilDateFa(membership.endsAt.slice(0, 10)) + ' معتبر است.'
                      : 'عضویت شما معتبر است.'
                  : 'عضویت پس از بررسی انجمن و پرداخت تأییدشده، برای یک دوره فعال می‌شود.'}
              </dd>
            </div>
            {membershipActive ? (
              <div className="hz-kv__row">
                <dt className="hz-kv__key">شماره عضویت</dt>
                <dd
                  className={membership.membershipNo ? 'hz-kv__value' : 'hz-kv__value hz-kv__value--empty'}
                  data-testid="dashboard-membership-number"
                >
                  {membership.membershipNo ? (
                    <Identifier value={membership.membershipNo} />
                  ) : (
                    'در انتظار صدور — خدمات فعال شما متوقف نمی‌شود'
                  )}
                </dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-md">
            {membershipActive ? (
              <Link href="/membership" className="hz-link hz-link--standalone">
                مشاهده عضویت
                <Icon name="arrowRight" size="xs" mirror />
              </Link>
            ) : (
              <ButtonLink href="/membership">فعال‌سازی عضویت</ButtonLink>
            )}
          </div>
        </section>

        <div className="grid gap-lg lg:grid-cols-2 lg:items-start">
          {/*
            * §8: what each animal has completed, from the database. The two
            * marketplace entries stay reachable from here (Phase 3 PROMPT-003,
            * Phase 4 PROMPT-002).
            */}
          <section aria-labelledby="animals-heading" className="hz-card">
            <SectionHeader
              size="sm"
              id="animals-heading"
              title="حیوان‌های من"
              count={myAnimals.length > 0 ? myAnimals.length.toLocaleString('fa-IR') + ' حیوان' : undefined}
              link={myAnimals.length > 0 ? { href: '/animals', label: 'همه' } : undefined}
            />
            {myAnimals.length === 0 ? (
              <div className="hz-state hz-state--compact">
                <div className="hz-state__icon">
                  <Icon name="pawPrint" size="lg" />
                </div>
                <p className="hz-state__title">هنوز حیوانی ثبت نکرده‌اید</p>
                <p className="hz-state__body">
                  {services.ANIMAL_REGISTRATION.allowed
                    ? 'می‌توانید اولین حیوان خود را ثبت کنید.'
                    : 'پس از تأیید احراز هویت، می‌توانید حیوان خود را در هم‌زیست ثبت کنید.'}
                </p>
              </div>
            ) : (
              <ul data-testid="dashboard-animals">
                {myAnimals.slice(0, ANIMALS_ON_DASHBOARD).map((animal) => (
                  <li key={animal.id}>
                    <AnimalCard
                      name={animal.name ?? 'بدون نام'}
                      speciesBreed={'سگ · ' + generationLabel(animal.generation)}
                      petId={animal.petId}
                      status={
                        animal.status === 'REGISTERED'
                          ? animal.identityVerifiedAt === null
                            ? { tone: 'info', label: 'پرونده اولیه' }
                            : { tone: 'success', label: 'مشخصات رسمی ثبت‌شده' }
                          : { tone: 'neutral', label: 'پیش‌نویس' }
                      }
                      href={animal.status === 'REGISTERED' ? '/animals/' + animal.id : '/animals/' + animal.id + '/edit'}
                    />
                  </li>
                ))}
              </ul>
            )}
            <div className="hz-card__footer">
              <Link href="/account/listings" className="hz-link" data-testid="dashboard-listings-link">
                آگهی‌های فروش
              </Link>
              <Link href="/account/mating-finder" className="hz-link" data-testid="dashboard-finder-link">
                جفت‌یابی
              </Link>
            </div>
          </section>

          <section aria-labelledby="requests-heading" className="hz-card">
            <SectionHeader
              size="sm"
              id="requests-heading"
              title="درخواست‌های فعال"
              count={activeRequests.length > 0 ? activeRequests.length.toLocaleString('fa-IR') + ' درخواست' : undefined}
              link={activeRequests.length > 0 ? { href: '/requests', label: 'همه درخواست‌ها' } : undefined}
            />
            {activeRequests.length === 0 ? (
              <div className="hz-state hz-state--compact">
                <div className="hz-state__icon">
                  <Icon name="tray" size="lg" />
                </div>
                <p className="hz-state__title">درخواست فعالی ندارید</p>
                <p className="hz-state__body">درخواست‌های مراجعه، صدور سند و بررسی پس از ایجاد در این بخش دیده می‌شوند.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border-subtle" data-testid="dashboard-requests">
                {activeRequests.slice(0, REQUESTS_ON_DASHBOARD).map((row) => (
                  <li key={row.request.id} className="py-md first:pt-0 last:pb-0">
                    <RequestCard
                      title={SERVICE_TYPE_FA[row.request.serviceType]}
                      requestCode={row.referral?.code ?? '—'}
                      animalName={row.animalName ?? 'بدون نام'}
                      status={{
                        tone: row.expired ? 'warning' : REQUEST_STATUS_TONE[row.request.status]!,
                        label: row.expired ? 'مهلت گذشته' : REQUEST_STATUS_FA[row.request.status]!,
                      }}
                      owner={row.request.status === 'ACTIVE' ? 'USER' : 'VET'}
                      {...(row.referral
                        ? { deadlineFa: formatCivilDateFa(row.referral.expiresAt.toISOString().slice(0, 10)) }
                        : {})}
                      resumeHref={'/requests/' + row.request.id}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section aria-labelledby="services-heading">
          <SectionHeader id="services-heading" title="سرویس‌ها" />
          {open.length === 0 && locked.length > 0 ? (
            <p className="mb-md text-body-sm text-text-secondary" data-testid="no-open-service">
              هنوز هیچ سرویسی برای شما باز نیست. با انجام کار زیر، سرویس‌های وابسته به آن باز می‌شوند.
            </p>
          ) : null}
          <div className="grid gap-lg md:grid-cols-2 lg:grid-cols-3">
            {open.map((entry) => (
              <ServiceCard key={entry.service} label={entry.label} description={entry.description} href={entry.href} icon={entry.icon} />
            ))}
            {groupLocked(locked).map((group) => (
              <div key={group.lock.reason + group.lock.cta.href} className="space-y-sm">
                <LockedServiceCard serviceLabel={group.labels[0]!} lock={group.lock} icon="lockSimple" />
                {group.labels.length > 1 ? (
                  <p className="hz-caption" data-testid="locked-group-more">
                    با همین کار، {group.labels.length - 1} سرویس دیگر هم باز می‌شود: {group.labels.slice(1).join('، ')}.
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </div>
    </PublicShell>
  );
}
