import Link from 'next/link';
import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { PublicShell } from '../../src/ui/shell.tsx';
import { Card, LockedServiceCard } from '../../src/ui/card.tsx';
import { Alert } from '../../src/ui/alert.tsx';
import { Identifier, StatusBadge } from '../../src/ui/status.tsx';
import { db } from '../../src/db/client.ts';
import { findMembership, membershipFee } from '../../src/billing/membership.ts';
import { eligibilityFor } from '../../src/domain/eligibility/service.ts';
import { formatTomanFa } from '../../src/domain/money.ts';
import { formatCivilDateFa } from '../../src/domain/calendar.ts';
import { CancelMembershipPaymentForm, PayMembershipForm } from './membership-forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * Membership — F14 and §7.
 *
 * Hero, prerequisites and benefits, fee review, payment, and the active state.
 * Lifetime by decision (D04): nothing on this page mentions an expiry date, a
 * renewal or a review that must pass after payment.
 */
const BENEFITS: readonly string[] = [
  'دریافت برگه ثبتی برای حیوان‌های شما',
  'دریافت شجره‌نامه پس از صدور برگه ثبتی',
  'شروع ثبت کنل',
  'مجوز جفت‌گیری و صدور کارت توله',
  'اعلام توافق شخصی جفت‌گیری',
];

export default async function MembershipPage() {
  const guard = await guardRoute('/membership');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  const eligibility = await eligibilityFor(db(), actor.accountId, 'MEMBERSHIP');
  const membership = await findMembership(db(), actor.accountId);
  const fee = await membershipFee(db());
  const feeLabel = formatTomanFa(fee);

  const status = membership?.status ?? 'NONE';
  const active = status === 'ACTIVE';

  return (
    <PublicShell actor={actor} title="عضویت انجمن" pathname="/membership">
      <div className="space-y-lg">
        <Card>
          <div className="flex items-start justify-between gap-md">
            <div className="min-w-0">
              <h2 className="text-h4">عضویت انجمن</h2>
              <p className="mt-sm text-body-sm text-text-secondary">
                عضویت مادام‌العمر است و پس از تأیید پرداخت روی سرور فعال می‌شود.
              </p>
            </div>
            <StatusBadge tone={active ? 'success' : status === 'PAYMENT_PENDING' ? 'info' : 'neutral'}>
              {active ? 'فعال' : status === 'PAYMENT_PENDING' ? 'در انتظار پرداخت' : status === 'INACTIVE' ? 'غیرفعال' : 'فعال نیست'}
            </StatusBadge>
          </div>

          {active ? (
            <dl className="mt-lg grid grid-cols-2 gap-sm text-body-sm">
              <dt className="text-text-secondary">تاریخ فعال‌سازی</dt>
              <dd data-testid="membership-activated">
                {membership?.activatedAt ? formatCivilDateFa(membership.activatedAt.toISOString().slice(0, 10)) : '—'}
              </dd>
              <dt className="text-text-secondary">شماره عضویت</dt>
              <dd data-testid="membership-number">
                {membership?.membershipNo ? (
                  <Identifier value={membership.membershipNo} />
                ) : (
                  'در انتظار صدور'
                )}
              </dd>
            </dl>
          ) : null}
        </Card>

        {active ? (
          <Alert tone="success" title="عضویت شما فعال است">
            {membership?.numberStatus === 'ISSUED'
              ? 'شماره عضویت شما صادر شده است.'
              : 'شماره عضویت شما هنوز صادر نشده است؛ این موضوع هیچ‌کدام از خدمات فعال شما را متوقف نمی‌کند.'}
          </Alert>
        ) : null}

        {!eligibility.allowed ? (
          <LockedServiceCard serviceLabel="عضویت انجمن" lock={eligibility.lock} />
        ) : null}

        {!active && eligibility.allowed ? (
          <>
            <Card>
              <h3 className="text-label-lg">پیش‌نیازها</h3>
              <ul className="mt-md space-y-xs text-body-sm text-text-secondary">
                <li>احراز هویت تأییدشده</li>
                <li>پرداخت موفق و تأییدشده هزینه عضویت</li>
              </ul>
              <p className="mt-md text-caption text-text-secondary">
                عضویت با احراز هویت یکی نیست و ثبت حیوان به عضویت نیاز ندارد.{' '}
                <Link href="/account/kyc" className="text-text-brand underline underline-offset-4">
                  وضعیت احراز هویت
                </Link>
              </p>
            </Card>

            <Card>
              <h3 className="text-label-lg">با عضویت چه چیزی باز می‌شود</h3>
              <ul className="mt-md list-disc space-y-xs pe-lg text-body-sm text-text-secondary">
                {BENEFITS.map((benefit) => (
                  <li key={benefit}>{benefit}</li>
                ))}
              </ul>
            </Card>

            <Card>
              <h3 className="text-label-lg">مرور هزینه</h3>
              {feeLabel === null ? (
                <Alert tone="warning" title="هزینه عضویت هنوز تعیین نشده است">
                  تا ورود مبلغ واقعی از پنل مدیریت، مسیر پرداخت باز نمی‌شود.
                </Alert>
              ) : (
                <>
                  <p className="mt-md text-h4" data-testid="membership-fee">
                    {feeLabel}
                  </p>
                  <p className="mt-sm text-caption text-text-secondary">
                    مبلغ از داده مدیریت‌شده خوانده می‌شود و در لحظه ایجاد پرداخت ثبت می‌شود؛ تغییر بعدی تعرفه،
                    پرداخت‌های قبلی را تغییر نمی‌دهد.
                  </p>
                  <div className="mt-lg">
                    <PayMembershipForm label={status === 'PAYMENT_PENDING' ? 'ادامه پرداخت' : 'پرداخت و فعال‌سازی عضویت'} />
                  </div>
                </>
              )}
            </Card>

            {status === 'PAYMENT_PENDING' ? (
              <Card>
                <p className="text-body-sm text-text-secondary">
                  پرداخت قبلی شما تکمیل نشده است. می‌توانید دوباره تلاش کنید یا آن را لغو کنید؛ در هر دو حالت
                  اطلاعات شما حفظ می‌شود.
                </p>
                <div className="mt-md">
                  <CancelMembershipPaymentForm />
                </div>
              </Card>
            ) : null}
          </>
        ) : null}

        {status === 'INACTIVE' ? (
          <Alert tone="warning" title="عضویت شما غیرفعال است">
            محدودیت ناشی از عضویت با فعال‌شدن دوباره برطرف می‌شود و نیازی به تکرار مراحل قبلی نیست.
          </Alert>
        ) : null}
      </div>
    </PublicShell>
  );
}
