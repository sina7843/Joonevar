import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { LockedServiceCard } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
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
 * Requesting registration sheets — §13.
 *
 * The order the source sets is preserved: the microchip and the mandatory
 * sample come first and the money step only opens for animals that already
 * have both.
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
        <Alert tone="info" title="ترتیب مراحل">
          پرداخت برگه ثبتی پس از کاشت یا تأیید میکروچیپ و نمونه‌گیری انجام می‌شود، نه پیش از آن‌ها.
        </Alert>

        {feeLabel === null ? (
          <Alert tone="warning" title="تعرفه صدور برگه ثبتی هنوز ثبت نشده است">
            <span data-testid="sheet-fee-not-configured">
              تا ورود مقدار واقعی از پنل مدیریت، مسیر پرداخت باز نمی‌شود و هیچ مبلغی فرض نمی‌شود.
            </span>
          </Alert>
        ) : null}

        {animals.length === 0 ? (
          <EmptyState
            title="حیوانی برای صدور برگه ثبتی در دسترس نیست"
            description="حیوان‌هایی که میکروچیپ و نمونه ثبت‌شده دارند و هنوز برگه ثبتی نگرفته‌اند در این فهرست می‌آیند."
          />
        ) : (
          <SelectSheetAnimals
            animals={animals.map((a) => ({
              animalId: a.animalId,
              name: a.name,
              ready: a.ready,
              reasonFa: a.reasonFa,
            }))}
            feeLabel={feeLabel}
          />
        )}
      </div>
    </PublicShell>
  );
}
