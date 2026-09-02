import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../src/ui/access-denied.tsx';
import { AppError, notFound as notFoundError } from '../../../src/domain/errors.ts';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card, LockedServiceCard } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { Identifier } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { readMoney } from '../../../src/settings/service.ts';
import { formatTomanFa } from '../../../src/domain/money.ts';
import { eligibilityFor } from '../../../src/domain/eligibility/service.ts';
import { permitForParty } from '../../../src/mating/permits.ts';
import { litterOfPermit } from '../../../src/mating/birth.ts';
import {
  cardEligibility,
  cardsOfOwner,
  openCardBatch,
  CARD_DISTINCTION_NOTE_FA,
  PUPPY_CARD_FEE_KEY,
} from '../../../src/mating/allocation.ts';
import { CardCheckoutForm } from '../../litters/forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * The Puppy Card checkout — §19.4, §22.
 *
 * Eligibility is stated per puppy with its own reason, so a locked card always
 * says what is missing. The prerequisites are the ones the source names, and a
 * registration sheet for the puppy is not among them.
 */
export default async function CardCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ permit?: string }>;
}) {
  const guard = await guardRoute('/puppy-cards/checkout');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { permit: permitId } = await searchParams;

  const [eligibility, myCards, fee] = await Promise.all([
    eligibilityFor(db(), guard.actor.accountId, 'PUPPY_CARD'),
    cardsOfOwner(db(), guard.actor.accountId),
    readMoney(db(), PUPPY_CARD_FEE_KEY),
  ]);
  const feeLabel = formatTomanFa(fee);

  if (!permitId) {
    return (
      <PublicShell actor={guard.actor} title="کارت توله" pathname="/puppy-cards/checkout">
        <div className="space-y-lg">
          {eligibility.allowed ? null : (
            <LockedServiceCard serviceLabel="کارت توله" lock={eligibility.lock} />
          )}
          <Card>
            <h2 className="text-label-lg">کارت‌های صادرشده شما</h2>
            {myCards.length === 0 ? (
              <div className="mt-lg">
                <EmptyState
                  title="هنوز کارتی صادر نشده است"
                  description="صدور کارت از پرونده مجوز و پس از نهایی‌شدن تخصیص دوطرفه انجام می‌شود."
                />
              </div>
            ) : (
              <ul className="mt-lg space-y-md" data-testid="my-cards">
                {myCards.map((row) => (
                  <li key={row.card.id} className="rounded-lg border border-border-subtle p-lg">
                    <Link
                      href={'/documents/puppy-card/' + row.card.id}
                      className="text-text-brand underline underline-offset-4"
                      data-testid={'open-card-' + row.tempCode}
                    >
                      {row.card.cardNo} · {row.tempCode} · {row.nameFa ?? 'بدون نام'}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </PublicShell>
    );
  }

  let permit;
  try {
    permit = await permitForParty(db(), guard.actor, permitId);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') return <RecordNotFound error={error} />;
    throw error;
  }
  if (permit.status !== 'ISSUED') {
    return <RecordNotFound error={notFoundError('پرونده مجوز صادرشده‌ای پیدا نشد.')} />;
  }

  const [rows, litter, batch] = await Promise.all([
    cardEligibility(db(), guard.actor, permit.id),
    litterOfPermit(db(), permit.id),
    openCardBatch(db(), guard.actor, permit.id),
  ]);
  const eligible = rows.filter((row) => row.eligible);

  return (
    <PublicShell actor={guard.actor} title="صدور کارت توله" pathname="/puppy-cards/checkout">
      <div className="space-y-lg">
        <Card>
          <h2 className="text-label-lg">کارت توله</h2>
          <p className="mt-md text-caption text-text-secondary" data-testid="card-distinction-note">
            {CARD_DISTINCTION_NOTE_FA}
          </p>
          <p className="mt-sm text-body-sm">
            هزینه هر توله: <span data-testid="card-fee">{feeLabel ?? 'تعیین‌نشده'}</span>
          </p>
          {litter ? (
            <p className="mt-sm text-body-sm">
              <Link
                href={'/litters/' + litter.id + '/allocation'}
                className="text-text-brand underline underline-offset-4"
                data-testid="open-allocation"
              >
                مشاهده تخصیص این پرونده
              </Link>
            </p>
          ) : null}
        </Card>

        <Card>
          <h2 className="text-label-lg">وضعیت هر توله</h2>
          <ul className="mt-lg space-y-md" data-testid="card-eligibility">
            {rows.map((row) => (
              <li
                key={row.puppyId}
                className="rounded-lg border border-border-subtle p-lg"
                data-testid={'card-row-' + row.tempCode}
              >
                <p className="text-label-md">
                  <Identifier value={row.tempCode} />
                </p>
                <p className="mt-2xs text-caption text-text-secondary">{row.nameFa ?? 'بدون نام'}</p>
                {row.card ? (
                  <p className="mt-sm text-body-sm">
                    <Link
                      href={'/documents/puppy-card/' + row.card.id}
                      className="text-text-brand underline underline-offset-4"
                      data-testid={'issued-card-' + row.tempCode}
                    >
                      {'کارت ' + row.card.cardNo}
                    </Link>
                  </p>
                ) : (
                  <p className="mt-sm text-body-sm" data-testid={'card-reason-' + row.tempCode}>
                    {row.eligible ? 'واجد شرایط صدور کارت' : row.reasonFa}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>

        {feeLabel === null ? (
          <Alert tone="warning" title="تعرفه کارت توله هنوز ثبت نشده است">
            <span data-testid="card-fee-not-configured">
              تا ورود مقدار واقعی از پنل مدیریت، مسیر پرداخت باز نمی‌شود و هیچ مبلغی فرض نمی‌شود.
            </span>
          </Alert>
        ) : eligible.length === 0 ? (
          <Alert tone="info" title="توله واجد شرایطی برای صدور کارت وجود ندارد">
            <span data-testid="no-eligible-puppy">
              دلیل هر توله در فهرست بالا آمده است؛ کارت تا نهایی‌شدن تخصیص دوطرفه قفل می‌ماند.
            </span>
          </Alert>
        ) : (
          <Card>
            <h2 className="text-label-lg">انتخاب و پرداخت</h2>
            <p className="mt-md text-caption text-text-secondary">
              می‌توانید یک یا چند توله را انتخاب کنید؛ هزینه هر توله جدا محاسبه و در یک پرداخت جمع می‌شود و
              کارت هر توله مستقل صادر می‌شود.
            </p>
            <CardCheckoutForm
              permitId={permit.id}
              batchId={batch?.id ?? null}
              puppies={eligible.map((row) => ({
                id: row.puppyId,
                tempCode: row.tempCode,
                nameFa: row.nameFa,
              }))}
            />
          </Card>
        )}
      </div>
    </PublicShell>
  );
}
