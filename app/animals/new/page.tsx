import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card, LockedServiceCard } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { db } from '../../../src/db/client.ts';
import { eligibilityFor } from '../../../src/domain/eligibility/service.ts';

export const dynamic = 'force-dynamic';

/**
 * Animal registration entry point.
 *
 * The eligibility rule is enforced here on the server, not only on the card that
 * links to it: approved KYC opens this route and membership is not required
 * (§9.1). The registration form itself is built in PROMPT-006, so this page
 * states that plainly rather than showing a form that stores nothing.
 */
export default async function NewAnimalPage() {
  const guard = await guardRoute('/animals/new');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  const eligibility = await eligibilityFor(db(), actor.accountId, 'ANIMAL_REGISTRATION');

  return (
    <PublicShell actor={actor} title="ثبت حیوان هم‌زیست" pathname="/animals/new">
      {eligibility.allowed ? (
        <div className="space-y-lg">
          <Alert tone="success" title="این خدمت برای شما باز است">
            احراز هویت شما تأیید شده است. برای ثبت حیوان، عضویت انجمن لازم نیست.
          </Alert>
          <Card>
            <h2 className="text-label-lg">فرم ثبت حیوان</h2>
            <p className="mt-md text-body-sm text-text-secondary">
              مراحل مصوب ثبت حیوان — اطلاعات پایه، مشخصات فیزیکی، تصویر، وضعیت میکروچیپ، منبع شناسایی و مرور
              نهایی — در مرحله بعدی پیاده‌سازی ساخته می‌شود. تا آن زمان هیچ فرم نمایشی که چیزی ذخیره نکند
              نمایش داده نمی‌شود.
            </p>
          </Card>
        </div>
      ) : (
        <LockedServiceCard serviceLabel="ثبت حیوان هم‌زیست" lock={eligibility.lock} />
      )}
    </PublicShell>
  );
}
