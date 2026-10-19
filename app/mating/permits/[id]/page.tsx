import { notFound as pageNotFound } from 'next/navigation';
import { isUuid } from '../../../../src/domain/ids.ts';
import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../src/ui/access-denied.tsx';
import { AppError } from '../../../../src/domain/errors.ts';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { StatusBadge, Identifier } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { readMoney } from '../../../../src/settings/service.ts';
import { formatTomanFa } from '../../../../src/domain/money.ts';
import { formatCivilDateFa } from '../../../../src/domain/calendar.ts';
import {
  cooldownAdvisory,
  permitBatch,
  permitForParty,
  permitReadiness,
  permitView,
  PERMIT_FEE_KEY,
} from '../../../../src/mating/permits.ts';
import {
  describeShare,
  PRE_BIRTH_RULE_NOTE_FA,
  RULE_TYPE_FA,
  SIDE_FA,
  type AllocationSide,
} from '../../../../src/domain/allocation.ts';
import { NO_BASIS_NOTE_FA } from '../../../../src/mating/cooldown.ts';
import { AllocationRuleForm, ConfirmPartyForm, PayPermitForm, SubmitPermitForm } from '../../forms.tsx';
import { PageHeader } from '../../../../src/ui/section-header.tsx';

export const dynamic = 'force-dynamic';

const EDITABLE = ['DRAFT', 'AWAITING_COUNTERPARTY', 'AWAITING_PAYMENT', 'NEEDS_CORRECTION'];

/**
 * One official permit case — §16 steps 4 to 9.
 *
 * The order the source sets is enforced by what the page offers: the rule only
 * after the counterparty has confirmed, payment only after the rule, and the
 * final submit only after a server-verified payment. Pregnancy, birth, a
 * veterinarian's confirmation and any signature are absent, because none of
 * them is a prerequisite here (§12.5, D13).
 */
export default async function PermitCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // A segment that cannot be an id is a missing page, not a server error.
  if (!isUuid(id)) pageNotFound();
  const guard = await guardRoute('/mating/permits/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  let permit;
  try {
    permit = await permitForParty(db(), guard.actor, id);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') return <RecordNotFound error={error} />;
    throw error;
  }

  const [view, readiness, batch, fee, cooldown] = await Promise.all([
    permitView(db(), permit),
    permitReadiness(db(), permit),
    permitBatch(db(), permit),
    readMoney(db(), PERMIT_FEE_KEY),
    cooldownAdvisory(db(), permit),
  ]);
  const feeLabel = formatTomanFa(fee);

  const isInitiator = permit.initiatorAccountId === guard.actor.accountId;
  const awaitingMyConfirmation =
    permit.status === 'AWAITING_COUNTERPARTY' && permit.counterpartyAccountId === guard.actor.accountId;
  const shareOf = (side: AllocationSide) => view.shares.find((row) => row.side === side) ?? null;
  const canEditRule = isInitiator && EDITABLE.includes(permit.status) && permit.counterpartyConfirmedAt !== null;
  const needsPayment = isInitiator && batch?.status !== 'PAID' && permit.status !== 'ISSUED';
  const canSubmit =
    isInitiator &&
    batch?.status === 'PAID' &&
    (permit.status === 'READY_TO_SUBMIT' || permit.status === 'NEEDS_CORRECTION');

  return (
    <PublicShell
      actor={guard.actor}
      title="پرونده مجوز جفت‌گیری"
      pathname={'/mating/permits/' + id}
      header={<PageHeader title={'پرونده مجوز جفت‌گیری'} back={{ href: '/mating/permits' }} />}
    >
      <div className="space-y-lg">
        <Card>
          <div className="flex items-start justify-between gap-md">
            <div className="min-w-0">
              <div className="hz-section-header hz-section-header--sm">
                <h2 className="hz-section-header__title">
                  <span className="hz-section-header__bar" aria-hidden="true" />
                  <span>مجوز رسمی جفت‌گیری</span>
                </h2>
              </div>
              <p className="mt-2xs text-caption text-text-secondary" data-testid="permit-route-note">
                مسیر رسمی هم‌زیست؛ این پرونده با «اعلام توافق شخصی» یکی نیست و شناسه و وضعیت جداگانه دارد.
              </p>
            </div>
            <span data-testid="permit-status">
              <StatusBadge status={permit.status} />
            </span>
          </div>

          {permit.permitNo ? (
            <div className="mt-lg" data-testid="permit-no">
              <Identifier label="شماره مجوز" value={permit.permitNo} />
            </div>
          ) : null}
          {permit.reasonFa ? (
            <p className="mt-lg text-body-sm" data-testid="permit-reason">
              {permit.reasonFa}
            </p>
          ) : null}
          {cooldown.hasWarning ? (
            <Alert tone="warning" title="هشدار فاصله زمانی (Cooldown)">
              <span data-testid="cooldown-warning">{cooldown.messageFa}</span>
            </Alert>
          ) : (
            <p className="mt-lg text-caption text-text-secondary" data-testid="cooldown-seam">
              {NO_BASIS_NOTE_FA}
            </p>
          )}
        </Card>

        {/* §16 step 6: both parties, both animals and the agreed rule in one review. */}
        <Card>
          <div className="hz-section-header hz-section-header--sm">
            <h2 className="hz-section-header__title">
              <span className="hz-section-header__bar" aria-hidden="true" />
              <span>مرور طرفین و حیوان‌ها</span>
            </h2>
          </div>
          <dl className="hz-kv mt-lg" data-testid="permit-parties">
            <div className="hz-kv__row">
              <dt className="hz-kv__key">آغازکننده</dt>
              <dd className="hz-kv__value" data-testid="permit-initiator">
                {view.initiatorName}
              </dd>
            </div>
            <div className="hz-kv__row">
              <dt className="hz-kv__key">طرف مقابل</dt>
              <dd className="hz-kv__value" data-testid="permit-counterparty">
                {view.counterpartyName}
              </dd>
            </div>
            <div className="hz-kv__row">
              <dt className="hz-kv__key">حیوان نر</dt>
              <dd className="hz-kv__value" data-testid="permit-sire">
                <Link href={'/animals/' + view.sire.id} className="hz-link">
                  {view.sire.name ?? 'بدون نام'}
                </Link>
                {view.sire.pedigreeCode ? (
                  <span dir="ltr" className="ms-sm font-mono text-caption">
                    {view.sire.pedigreeCode}
                  </span>
                ) : null}
                <span className="ms-sm text-caption text-text-secondary">{view.sire.ownerName}</span>
              </dd>
            </div>
            <div className="hz-kv__row">
              <dt className="hz-kv__key">حیوان ماده</dt>
              <dd className="hz-kv__value" data-testid="permit-dam">
                <Link href={'/animals/' + view.dam.id} className="hz-link">
                  {view.dam.name ?? 'بدون نام'}
                </Link>
                {view.dam.pedigreeCode ? (
                  <span dir="ltr" className="ms-sm font-mono text-caption">
                    {view.dam.pedigreeCode}
                  </span>
                ) : null}
                <span className="ms-sm text-caption text-text-secondary">{view.dam.ownerName}</span>
              </dd>
            </div>
            <div className="hz-kv__row">
              <dt className="hz-kv__key">تأیید طرف مقابل</dt>
              <dd className="hz-kv__value" data-testid="counterparty-confirmed">
                {permit.counterpartyConfirmedAt
                  ? formatCivilDateFa(permit.counterpartyConfirmedAt.toISOString().slice(0, 10))
                  : 'ثبت نشده'}
              </dd>
            </div>
          </dl>

          {permit.ruleType ? (
            <div className="mt-lg" data-testid="permit-rule-summary">
              <h3 className="text-label-md">{'توافق تقسیم: ' + RULE_TYPE_FA[permit.ruleType]}</h3>
              <dl className="hz-kv mt-sm">
                {(['SIRE_SIDE', 'DAM_SIDE'] as const).map((side) => (
                  <div key={side} className="contents">
                    <div className="hz-kv__row">
                      <dt className="hz-kv__key">{SIDE_FA[side]}</dt>
                      <dd className="hz-kv__value" data-testid={'share-' + side}>
                        {describeShare(permit.ruleType!, {
                          side,
                          fixedCount: shareOf(side)?.fixedCount ?? null,
                          percent: shareOf(side)?.percent ?? null,
                        })}
                      </dd>
                    </div>
                  </div>
                ))}
              </dl>
              {permit.ruleNoteFa ? <p className="mt-sm text-body-sm">{permit.ruleNoteFa}</p> : null}
              <p className="mt-sm text-caption text-text-secondary" data-testid="rule-not-ownership">
                {PRE_BIRTH_RULE_NOTE_FA}
              </p>
            </div>
          ) : null}
        </Card>

        {awaitingMyConfirmation ? (
          <Card>
            <div className="hz-section-header hz-section-header--sm">
              <h2 className="hz-section-header__title">
                <span className="hz-section-header__bar" aria-hidden="true" />
                <span>تأیید مشارکت شما</span>
              </h2>
            </div>
            <p className="mt-md text-caption text-text-secondary">
              این پرونده برای حیوان شما باز شده است. تأیید یا رد آن فقط از حساب خود شما ثبت می‌شود.
            </p>
            <ConfirmPartyForm permitId={permit.id} />
          </Card>
        ) : null}

        {canEditRule ? (
          <AllocationRuleForm
            permitId={permit.id}
            ruleType={permit.ruleType}
            sire={{
              fixedCount: shareOf('SIRE_SIDE')?.fixedCount ?? null,
              percent: shareOf('SIRE_SIDE')?.percent ?? null,
            }}
            dam={{
              fixedCount: shareOf('DAM_SIDE')?.fixedCount ?? null,
              percent: shareOf('DAM_SIDE')?.percent ?? null,
            }}
            note={permit.ruleNoteFa}
          />
        ) : null}

        {needsPayment ? (
          <Card>
            <div className="hz-section-header hz-section-header--sm">
              <h2 className="hz-section-header__title">
                <span className="hz-section-header__bar" aria-hidden="true" />
                <span>پرداخت هزینه مجوز</span>
              </h2>
            </div>
            <p className="mt-md text-body-sm">
              هزینه مجوز جفت‌گیری: <span data-testid="permit-fee">{feeLabel ?? 'تعیین‌نشده'}</span>
            </p>
            <p className="mt-sm text-caption text-text-secondary">
              پرداخت در هم‌زیست و پیش از ارسال نهایی انجام می‌شود و به‌تنهایی به معنی صدور مجوز نیست.
            </p>
            {feeLabel === null ? (
              <Alert tone="warning" title="تعرفه مجوز جفت‌گیری هنوز ثبت نشده است">
                <span data-testid="permit-fee-not-configured">
                  تا ورود مقدار واقعی از پنل مدیریت، مسیر پرداخت باز نمی‌شود و هیچ مبلغی فرض نمی‌شود.
                </span>
              </Alert>
            ) : readiness.ready ? (
              <PayPermitForm permitId={permit.id} batchId={batch?.id ?? null} total={feeLabel} />
            ) : (
              <Alert tone="warning" title="برای پرداخت، پرونده کامل نیست">
                <span data-testid="permit-not-ready">{readiness.reasonFa}</span>
              </Alert>
            )}
          </Card>
        ) : null}

        {canSubmit ? (
          <Card>
            <div className="hz-section-header hz-section-header--sm">
              <h2 className="hz-section-header__title">
                <span className="hz-section-header__bar" aria-hidden="true" />
                <span>ارسال برای بررسی عملیاتی</span>
              </h2>
            </div>
            <p className="mt-md text-caption text-text-secondary">
              پرداخت این پرونده روی سرور تأیید شده است. تصمیم نهایی و صدور مجوز با بررسی انجمن/هم‌زیست است.
            </p>
            <SubmitPermitForm permitId={permit.id} />
          </Card>
        ) : null}

        {permit.status === 'ISSUED' ? (
          <Card>
            <div className="hz-section-header hz-section-header--sm">
              <h2 className="hz-section-header__title">
                <span className="hz-section-header__bar" aria-hidden="true" />
                <span>پرونده رسمی جفت‌گیری</span>
              </h2>
            </div>
            <p className="mt-md text-body-sm">
              <Link href={'/mating/permits/' + permit.id + '/dates'} className="hz-link" data-testid="open-dates">
                ثبت و تأیید تاریخ‌های جفت‌گیری
              </Link>
            </p>
            <p className="mt-md text-body-sm">
              <Link
                href={'/mating/permits/' + permit.id + '/pregnancy'}
                className="hz-link"
                data-testid="open-pregnancy"
              >
                اعلام بارداری و تأیید اختیاری دامپزشک
              </Link>
            </p>
            <p className="mt-md text-body-sm">
              <Link
                href={'/mating/permits/' + permit.id + '/birth'}
                className="hz-link"
                data-testid="open-birth-from-permit"
              >
                ثبت نتیجه زایمان و توله‌ها
              </Link>
            </p>
            <p className="mt-md text-body-sm" data-testid="mating-case-context">
              این مجوز، پرونده رسمی جفت‌گیری بین دو حیوان بالا را ایجاد کرده است و در سوابق هر دو حیوان ثبت شده است.
              ادامه مسیر (تاریخ جفت‌گیری، بارداری، زایمان و تخصیص) در همین پرونده رسمی دنبال می‌شود.
            </p>
            <p className="mt-sm text-caption text-text-secondary">{PRE_BIRTH_RULE_NOTE_FA}</p>
          </Card>
        ) : null}
      </div>
    </PublicShell>
  );
}
