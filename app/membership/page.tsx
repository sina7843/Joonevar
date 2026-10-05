import Link from 'next/link';
import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { PublicShell } from '../../src/ui/shell.tsx';
import { Card, LockedServiceCard } from '../../src/ui/card.tsx';
import { PageHeader, SectionHeader } from '../../src/ui/section-header.tsx';
import { Alert } from '../../src/ui/alert.tsx';
import { Identifier, StatusBadge, type StatusTone } from '../../src/ui/status.tsx';
import { db } from '../../src/db/client.ts';
import {
  membershipApplicationHistory,
  membershipFee,
  membershipPeriodHistory,
  membershipRenewalFee,
  membershipStanding,
  openApplication,
} from '../../src/billing/membership.ts';
import { MEMBERSHIP_STATUS_FA, type MembershipStatus } from '../../src/billing/membership-model.ts';
import { eligibilityFor } from '../../src/domain/eligibility/service.ts';
import { formatTomanFa, toman } from '../../src/domain/money.ts';
import { formatCivilDateFa } from '../../src/domain/calendar.ts';
import { formatInstantFa } from '../../src/content/model.ts';
import {
  ApplyForMembershipForm,
  CancelMembershipPaymentForm,
  PayMembershipForm,
  ReviseMembershipApplicationForm,
} from './membership-forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * Membership — §7 and Phase 2.5 §6.
 *
 * Membership is applied for, reviewed by the association, and then bought one
 * period at a time; it is renewed before it ends and expires when it is not. A
 * membership that was already active before Phase 2.5 stays lifetime and is
 * shown as such (DEC-0195).
 */
const BENEFITS: readonly string[] = [
  'دریافت برگه ثبتی برای حیوان‌های شما',
  'دریافت شجره‌نامه پس از صدور برگه ثبتی',
  'شروع ثبت کنل',
  'مجوز جفت‌گیری و صدور کارت توله',
  'اعلام توافق شخصی جفت‌گیری',
  'شرط لازم برای درخواست دامپزشک معتمد و شروط کلاب',
];

const TONE: Partial<Record<MembershipStatus, StatusTone>> = {
  ACTIVE: 'success',
  APPROVED_AWAITING_PAYMENT: 'info',
  PENDING_REVIEW: 'info',
  NEEDS_CORRECTION: 'warning',
  EXPIRED: 'warning',
  SUSPENDED: 'error',
  REVOKED: 'error',
  REJECTED: 'error',
};

export default async function MembershipPage() {
  const guard = await guardRoute('/membership');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  const standing = await membershipStanding(db(), actor.accountId);
  const [eligibility, application, periods, applications, initialFee, renewalFee] = await Promise.all([
    eligibilityFor(db(), actor.accountId, 'MEMBERSHIP'),
    openApplication(db(), actor.accountId),
    membershipPeriodHistory(db(), actor.accountId),
    membershipApplicationHistory(db(), actor.accountId),
    membershipFee(db()),
    membershipRenewalFee(db()),
  ]);

  const fee = standing.kind === 'RENEWAL' ? renewalFee : initialFee;
  const feeLabel = formatTomanFa(fee);
  const paidPeriods = periods.filter((period) => period.status === 'ACTIVE');

  return (
    <PublicShell
      actor={actor}
      title="عضویت انجمن"
      pathname="/membership"
      header={<PageHeader title="عضویت انجمن" back={{ href: '/dashboard' }} />}
    >
      <div className="grid items-start gap-xl lg:grid-cols-12">
        <div className="min-w-0 space-y-xl lg:col-span-7">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-md">
              <div className="min-w-0">
                <div className="hz-section-header hz-section-header--sm">
                  <h2 className="hz-section-header__title">
                    <span className="hz-section-header__bar" aria-hidden="true" />
                    <span>عضویت انجمن</span>
                  </h2>
                </div>
                <p className="mt-sm text-body-sm text-text-secondary">
                  {standing.lifetime
                    ? 'عضویت شما پیش از دوره‌ای شدن عضویت فعال شده است و مادام‌العمر می‌ماند؛ تاریخ پایانی برای آن ساخته نمی‌شود.'
                    : 'عضویت پس از بررسی انجمن و پرداخت تأییدشده، برای یک دوره فعال می‌شود و با تمدید ادامه پیدا می‌کند.'}
                </p>
              </div>
              <span data-testid="membership-status">
                <StatusBadge tone={TONE[standing.status] ?? 'neutral'}>{standing.statusFa}</StatusBadge>
              </span>
            </div>

            <dl className="hz-kv mt-lg">
              <div className="hz-kv__row">
                <dt className="hz-kv__key">اعتبار</dt>
                <dd className="hz-kv__value" data-testid="membership-validity">
                  {standing.lifetime
                    ? 'مادام‌العمر'
                    : standing.valid
                      ? 'معتبر' + (standing.endsAt ? ' تا ' + formatCivilDateFa(standing.endsAt.slice(0, 10)) : '')
                      : 'معتبر نیست'}
                </dd>
              </div>
              {!standing.lifetime && standing.endsAt ? (
                <>
                  <div className="hz-kv__row">
                    <dt className="hz-kv__key">پایان دوره</dt>
                    <dd className="hz-kv__value" data-testid="membership-ends-at">
                      {formatCivilDateFa(standing.endsAt.slice(0, 10))}
                      {standing.daysLeft !== null && standing.valid
                        ? ' · ' + standing.daysLeft.toLocaleString('fa-IR') + ' روز مانده'
                        : ''}
                    </dd>
                  </div>
                </>
              ) : null}
              <div className="hz-kv__row">
                <dt className="hz-kv__key">شماره عضویت</dt>
                <dd className="hz-kv__value" data-testid="membership-number">
                  {standing.membershipNo ? <Identifier value={standing.membershipNo} /> : 'در انتظار صدور'}
                </dd>
              </div>
            </dl>

            {standing.inGrace ? (
              <div className="mt-md" data-testid="membership-grace">
                <Alert tone="warning" title="دوره عضویت شما تمام شده و در مهلت ارفاقی است">
                  تا پایان مهلت ارفاقی عضویت معتبر است. با تمدید، دوره تازه از پایان دوره قبلی شروع می‌شود و روزی از بین
                  نمی‌رود.
                </Alert>
              </div>
            ) : null}

            {standing.statusReasonFa &&
            (standing.status === 'SUSPENDED' ||
              standing.status === 'REVOKED' ||
              standing.status === 'REJECTED' ||
              standing.status === 'NEEDS_CORRECTION') ? (
              <div className="mt-md" data-testid="membership-status-reason">
                <Alert tone="warning" title="توضیح انجمن">
                  {standing.statusReasonFa}
                </Alert>
              </div>
            ) : null}
          </Card>

          {!eligibility.allowed ? <LockedServiceCard serviceLabel="عضویت انجمن" lock={eligibility.lock} /> : null}

          {eligibility.allowed && standing.canApply ? (
            <Card>
              <div className="hz-section-header hz-section-header--sm">
                <h3 className="hz-section-header__title">
                  <span className="hz-section-header__bar" aria-hidden="true" />
                  <span>درخواست عضویت</span>
                </h3>
              </div>
              <p className="mt-sm text-body-sm text-text-secondary">
                درخواست شما را ادمین انجمن بررسی می‌کند. پرداخت فقط پس از تأیید باز می‌شود و درخواست دادن هزینه‌ای
                ندارد.
              </p>
              <div className="mt-lg">
                <ApplyForMembershipForm />
              </div>
            </Card>
          ) : null}

          {application && application.status === 'SUBMITTED' ? (
            <Alert tone="info" title="درخواست عضویت شما در انتظار بررسی انجمن است">
              <span data-testid="membership-application-status">
                نتیجه بررسی و دلیل آن در همین صفحه و در اعلان‌ها نمایش داده می‌شود.
              </span>
            </Alert>
          ) : null}

          {application && application.status === 'NEEDS_CORRECTION' ? (
            <Card>
              <div className="hz-section-header hz-section-header--sm">
                <h3 className="hz-section-header__title">
                  <span className="hz-section-header__bar" aria-hidden="true" />
                  <span>اصلاح درخواست</span>
                </h3>
              </div>
              <div className="mt-sm" data-testid="membership-review-note">
                <Alert tone="warning" title="انجمن اصلاح خواسته است">
                  {application.reviewNoteFa ?? '—'}
                </Alert>
              </div>
              <div className="mt-lg">
                <ReviseMembershipApplicationForm
                  applicationId={application.id}
                  version={application.version}
                  defaultStatement={application.statementFa ?? ''}
                />
              </div>
            </Card>
          ) : null}

          {eligibility.allowed && standing.canPay ? (
            <Card>
              <SectionHeader
                size="sm"
                as="h3"
                title={standing.kind === 'RENEWAL' ? 'تمدید دوره عضویت' : 'مرور هزینه عضویت'}
              />
              {feeLabel === null ? (
                <Alert tone="warning" title="تعرفه این دوره هنوز تعیین نشده است">
                  تا ورود مبلغ واقعی از پنل مدیریت، مسیر پرداخت باز نمی‌شود.
                </Alert>
              ) : (
                <>
                  <p className="hz-price hz-price--lg mt-md" data-testid="membership-fee">
                    <span className="hz-price__amount">
                      {standing.pendingAmountToman
                        ? formatTomanFa({ configured: true, toman: toman(standing.pendingAmountToman) })
                        : feeLabel}
                    </span>
                  </p>
                  <p className="mt-sm text-caption text-text-secondary">
                    مبلغ و طول دوره از داده مدیریت‌شده خوانده و در لحظه شروع پرداخت روی همان دوره ثبت می‌شوند؛ تغییر
                    بعدی تعرفه، دوره‌های پرداخت‌شده را تغییر نمی‌دهد.
                  </p>
                  <div className="mt-lg">
                    <PayMembershipForm
                      label={standing.kind === 'RENEWAL' ? 'تمدید و پرداخت دوره تازه' : 'پرداخت و فعال‌سازی عضویت'}
                      testId={standing.kind === 'RENEWAL' ? 'renew-membership' : 'pay-membership'}
                    />
                  </div>
                </>
              )}
              {standing.pendingBatchId ? (
                <div className="mt-md">
                  <p className="text-body-sm text-text-secondary">
                    پرداخت قبلی شما تکمیل نشده است. می‌توانید دوباره تلاش کنید یا آن را لغو کنید؛ در هر دو حالت اطلاعات
                    شما حفظ می‌شود.
                  </p>
                  <div className="mt-md">
                    <CancelMembershipPaymentForm />
                  </div>
                </div>
              ) : null}
            </Card>
          ) : null}
        </div>
        <aside className="min-w-0 space-y-xl lg:col-span-5" aria-label="پیش‌نیازها و سوابق">
          {standing.status === 'NONE' || standing.canApply ? (
            <>
              <Card>
                <div className="hz-section-header hz-section-header--sm">
                  <h3 className="hz-section-header__title">
                    <span className="hz-section-header__bar" aria-hidden="true" />
                    <span>پیش‌نیازها</span>
                  </h3>
                </div>
                <ul className="mt-md space-y-xs text-body-sm text-text-secondary">
                  <li>احراز هویت تأییدشده</li>
                  <li>تأیید درخواست عضویت توسط انجمن</li>
                  <li>پرداخت موفق و تأییدشده دوره عضویت</li>
                </ul>
                <p className="mt-md text-caption text-text-secondary">
                  عضویت با احراز هویت یکی نیست و ثبت حیوان به عضویت نیاز ندارد.{' '}
                  <Link href="/account/kyc" className="hz-link">
                    وضعیت احراز هویت
                  </Link>
                </p>
              </Card>

              <Card>
                <div className="hz-section-header hz-section-header--sm">
                  <h3 className="hz-section-header__title">
                    <span className="hz-section-header__bar" aria-hidden="true" />
                    <span>با عضویت چه چیزی باز می‌شود</span>
                  </h3>
                </div>
                <ul className="mt-md list-disc space-y-xs ps-xl text-body-sm text-text-secondary">
                  {BENEFITS.map((benefit) => (
                    <li key={benefit}>{benefit}</li>
                  ))}
                </ul>
              </Card>
            </>
          ) : null}

          {paidPeriods.length > 0 ? (
            <Card>
              <div className="hz-section-header hz-section-header--sm">
                <h3 className="hz-section-header__title">
                  <span className="hz-section-header__bar" aria-hidden="true" />
                  <span>دوره‌های پرداخت‌شده</span>
                </h3>
              </div>
              <ol className="mt-md space-y-sm text-body-sm" data-testid="membership-receipts">
                {paidPeriods.map((period) => (
                  <li key={period.id}>
                    {(period.kind === 'RENEWAL' ? 'تمدید' : 'عضویت') +
                      ' · ' +
                      formatTomanFa({ configured: true, toman: toman(period.amountToman) }) +
                      ' · از ' +
                      formatCivilDateFa(period.startsAt!.toISOString().slice(0, 10)) +
                      ' تا ' +
                      formatCivilDateFa(period.endsAt!.toISOString().slice(0, 10))}
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}

          {applications.length > 0 ? (
            <Card>
              <div className="hz-section-header hz-section-header--sm">
                <h3 className="hz-section-header__title">
                  <span className="hz-section-header__bar" aria-hidden="true" />
                  <span>تاریخچه درخواست‌ها</span>
                </h3>
              </div>
              <ol className="mt-md space-y-sm text-body-sm" data-testid="membership-application-history">
                {applications.map((row) => (
                  <li key={row.id}>
                    {formatInstantFa(row.updatedAt) +
                      ' · ' +
                      MEMBERSHIP_STATUS_FA[
                        row.status === 'APPROVED' ? 'APPROVED_AWAITING_PAYMENT' : (row.status as MembershipStatus)
                      ]}
                    {row.reviewNoteFa ? ' — ' + row.reviewNoteFa : ''}
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}
        </aside>
      </div>
    </PublicShell>
  );
}
