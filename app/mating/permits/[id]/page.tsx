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
  PERMIT_STATUS_FA,
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
    isInitiator && batch?.status === 'PAID' && (permit.status === 'READY_TO_SUBMIT' || permit.status === 'NEEDS_CORRECTION');

  return (
    <PublicShell actor={guard.actor} title="پرونده مجوز جفت‌گیری" pathname={'/mating/permits/' + id}>
      <div className="space-y-lg">
        <Card>
          <div className="flex items-start justify-between gap-md">
            <div className="min-w-0">
              <h2 className="text-label-lg">مجوز رسمی جفت‌گیری</h2>
              <p className="mt-2xs text-caption text-text-secondary" data-testid="permit-route-note">
                مسیر رسمی هم‌زیست؛ این پرونده با «اعلام توافق شخصی» یکی نیست و شناسه و وضعیت جداگانه دارد.
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
              <span data-testid="permit-status">{PERMIT_STATUS_FA[permit.status]}</span>
            </StatusBadge>
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
          <h2 className="text-label-lg">مرور طرفین و حیوان‌ها</h2>
          <dl className="mt-lg grid grid-cols-2 gap-sm text-body-sm" data-testid="permit-parties">
            <dt className="text-text-secondary">آغازکننده</dt>
            <dd data-testid="permit-initiator">{view.initiatorName}</dd>
            <dt className="text-text-secondary">طرف مقابل</dt>
            <dd data-testid="permit-counterparty">{view.counterpartyName}</dd>
            <dt className="text-text-secondary">حیوان نر</dt>
            <dd data-testid="permit-sire">
              <Link href={'/animals/' + view.sire.id} className="text-text-brand underline underline-offset-4">
                {view.sire.name ?? 'بدون نام'}
              </Link>
              {view.sire.pedigreeCode ? (
                <span dir="ltr" className="ms-sm font-mono text-caption">
                  {view.sire.pedigreeCode}
                </span>
              ) : null}
              <span className="ms-sm text-caption text-text-secondary">{view.sire.ownerName}</span>
            </dd>
            <dt className="text-text-secondary">حیوان ماده</dt>
            <dd data-testid="permit-dam">
              <Link href={'/animals/' + view.dam.id} className="text-text-brand underline underline-offset-4">
                {view.dam.name ?? 'بدون نام'}
              </Link>
              {view.dam.pedigreeCode ? (
                <span dir="ltr" className="ms-sm font-mono text-caption">
                  {view.dam.pedigreeCode}
                </span>
              ) : null}
              <span className="ms-sm text-caption text-text-secondary">{view.dam.ownerName}</span>
            </dd>
            <dt className="text-text-secondary">تأیید طرف مقابل</dt>
            <dd data-testid="counterparty-confirmed">
              {permit.counterpartyConfirmedAt
                ? formatCivilDateFa(permit.counterpartyConfirmedAt.toISOString().slice(0, 10))
                : 'ثبت نشده'}
            </dd>
          </dl>

          {permit.ruleType ? (
            <div className="mt-lg" data-testid="permit-rule-summary">
              <h3 className="text-label-md">{'توافق تقسیم: ' + RULE_TYPE_FA[permit.ruleType]}</h3>
              <dl className="mt-sm grid grid-cols-2 gap-sm text-body-sm">
                {(['SIRE_SIDE', 'DAM_SIDE'] as const).map((side) => (
                  <div key={side} className="contents">
                    <dt className="text-text-secondary">{SIDE_FA[side]}</dt>
                    <dd data-testid={'share-' + side}>
                      {describeShare(permit.ruleType!, {
                        side,
                        fixedCount: shareOf(side)?.fixedCount ?? null,
                        percent: shareOf(side)?.percent ?? null,
                      })}
                    </dd>
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
            <h2 className="text-label-lg">تأیید مشارکت شما</h2>
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
            <h2 className="text-label-lg">پرداخت هزینه مجوز</h2>
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
              <PayPermitForm permitId={permit.id} batchId={batch?.id ?? null} />
            ) : (
              <Alert tone="warning" title="برای پرداخت، پرونده کامل نیست">
                <span data-testid="permit-not-ready">{readiness.reasonFa}</span>
              </Alert>
            )}
          </Card>
        ) : null}

        {canSubmit ? (
          <Card>
            <h2 className="text-label-lg">ارسال برای بررسی عملیاتی</h2>
            <p className="mt-md text-caption text-text-secondary">
              پرداخت این پرونده روی سرور تأیید شده است. تصمیم نهایی و صدور مجوز با بررسی انجمن/هم‌زیست است.
            </p>
            <SubmitPermitForm permitId={permit.id} />
          </Card>
        ) : null}

        {permit.status === 'ISSUED' ? (
          <Card>
            <h2 className="text-label-lg">پرونده رسمی جفت‌گیری</h2>
            <p className="mt-md text-body-sm">
              <Link
                href={'/mating/permits/' + permit.id + '/dates'}
                className="text-text-brand underline underline-offset-4"
                data-testid="open-dates"
              >
                ثبت و تأیید تاریخ‌های جفت‌گیری
              </Link>
            </p>
            <p className="mt-md text-body-sm" data-testid="mating-case-context">
              این مجوز، پرونده رسمی جفت‌گیری بین دو حیوان بالا را ایجاد کرده است و در سوابق هر دو حیوان ثبت
              شده است. ادامه مسیر (تاریخ جفت‌گیری، بارداری، زایمان و تخصیص) در همین پرونده رسمی دنبال می‌شود.
            </p>
            <p className="mt-sm text-caption text-text-secondary">{PRE_BIRTH_RULE_NOTE_FA}</p>
          </Card>
        ) : null}
      </div>
    </PublicShell>
  );
}
