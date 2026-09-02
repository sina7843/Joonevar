import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card, LockedServiceCard } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { Button } from '../../../src/ui/button.tsx';
import { db } from '../../../src/db/client.ts';
import { eligibilityFor } from '../../../src/domain/eligibility/service.ts';
import { openDraft } from '../../../src/animals/service.ts';
import { startAnimalDraftAction } from '../actions.ts';

export const dynamic = 'force-dynamic';

/**
 * Entry point for animal registration.
 *
 * The rule is enforced here on the server, not only on the card that links to
 * it: approved KYC opens this route and membership is not required (§9.1).
 */
export default async function NewAnimalPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const guard = await guardRoute('/animals/new');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  const eligibility = await eligibilityFor(db(), actor.accountId, 'ANIMAL_REGISTRATION');
  const draft = eligibility.allowed ? await openDraft(db(), actor) : null;
  const { error } = await searchParams;

  return (
    <PublicShell actor={actor} title="ثبت حیوان هم‌زیست" pathname="/animals/new">
      {eligibility.allowed ? (
        <div className="space-y-lg">
          {error ? <Alert tone="error" title={error} /> : null}
          <Alert tone="success" title="این خدمت برای شما باز است">
            احراز هویت شما تأیید شده است. برای ثبت حیوان، عضویت انجمن لازم نیست و نشانی سکونت هم اجباری نیست.
          </Alert>
          <Card>
            <h2 className="text-label-lg">شروع ثبت</h2>
            <p className="mt-md text-body-sm text-text-secondary">
              فرم شش‌مرحله‌ای است و هر مرحله ذخیره می‌شود؛ اگر نیمه‌کاره خارج شوید، از همان‌جا ادامه می‌دهید.
            </p>
            {draft ? (
              <p className="mt-sm text-caption text-text-secondary" data-testid="open-draft-notice">
                یک پیش‌نویس باز دارید و ادامه از همان‌جا انجام می‌شود.
              </p>
            ) : null}
            <form action={startAnimalDraftAction} className="mt-lg">
              <Button type="submit" block data-testid="start-animal-draft">
                {draft ? 'ادامه پیش‌نویس' : 'شروع ثبت حیوان هم‌زیست'}
              </Button>
            </form>
          </Card>
        </div>
      ) : (
        <LockedServiceCard serviceLabel="ثبت حیوان هم‌زیست" lock={eligibility.lock} />
      )}
    </PublicShell>
  );
}
