import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { LockedServiceCard } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { ButtonLink } from '../../../src/ui/button.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { eligibilityFor } from '../../../src/domain/eligibility/service.ts';
import { readMoney } from '../../../src/settings/service.ts';
import { formatTomanFa } from '../../../src/domain/money.ts';
import {
  REGISTRATION_SHEET_FEE_KEY,
  selectableAnimals,
} from '../../../src/documents/registration-sheet.ts';
import { SelectSheetAnimals } from './select-form.tsx';

export const dynamic = 'force-dynamic';

/**
 * The registration-sheet service — §13, Flow Map section 02.
 *
 * This is the whole of §13, not its last step. The source runs one chain:
 * choose animals → choose implant or verification per animal → choose the
 * trusted vet → referral → the visit, where the chip and the mandatory sample
 * happen → one batch payment → an independent sheet per animal. So the visit is
 * offered from here, per animal, and the money step opens only for the animals
 * that have already been through it — the order the source states, without
 * turning step 4 into a separate service the person has to find on their own.
 */
export default async function NewSheetRequestPage() {
  const guard = await guardRoute('/registration/new');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  const eligibility = await eligibilityFor(db(), actor.accountId, 'REGISTRATION_SHEET');
  if (!eligibility.allowed) {
    return (
      <PublicShell actor={actor} title="درخواست برگه ثبتی" pathname="/registration/new">
        <LockedServiceCard serviceLabel="صدور برگه ثبتی" lock={eligibility.lock} />
      </PublicShell>
    );
  }

  const [animals, fee] = await Promise.all([
    selectableAnimals(db(), actor),
    readMoney(db(), REGISTRATION_SHEET_FEE_KEY),
  ]);
  const feeLabel = formatTomanFa(fee);

  return (
    <PublicShell actor={actor} title="درخواست برگه ثبتی" pathname="/registration/new">
      <div className="space-y-lg">
        <Alert tone="info" title="مراحل این مسیر">
          <span data-testid="sheet-flow-steps">
            انتخاب حیوان‌ها ← انتخاب کاشت یا تأیید میکروچیپ برای هر حیوان ← انتخاب دامپزشک معتمد و دریافت کد
            مراجعه ← کاشت یا تأیید میکروچیپ و نمونه‌گیری در محل ← یک پرداخت گروهی ← صدور مستقل برگه ثبتی هر
            حیوان. میکروچیپ و نمونه‌گیری بخشی از همین مسیرند، نه سرویسی جدا؛ پرداخت از آن‌ها جلو نمی‌افتد.
          </span>
        </Alert>

        {feeLabel === null ? (
          <Alert tone="warning" title="تعرفه صدور برگه ثبتی هنوز ثبت نشده است">
            <span data-testid="sheet-fee-not-configured">
              تا ورود مقدار واقعی از پنل مدیریت، مسیر پرداخت باز نمی‌شود و هیچ مبلغی فرض نمی‌شود.
            </span>
          </Alert>
        ) : null}

        {animals.length === 0 ? (
          <div className="space-y-lg">
            <EmptyState
              title="هنوز حیوانی برای این مسیر ندارید"
              description="این مسیر از حیوان‌های ثبت‌شده شما شروع می‌شود. حیوان‌هایی که برگه ثبتی گرفته‌اند یا در یک پرداخت باز هستند اینجا تکرار نمی‌شوند."
            />
            <ButtonLink href="/animals/new" block data-testid="sheet-register-animal">
              ثبت حیوان هم‌زیست
            </ButtonLink>
          </div>
        ) : (
          <SelectSheetAnimals
            animals={animals.map((a) => ({
              animalId: a.animalId,
              name: a.name,
              ready: a.ready,
              reasonFa: a.reasonFa,
              nextStep: a.nextStep,
            }))}
            feeLabel={feeLabel}
          />
        )}
      </div>
    </PublicShell>
  );
}
