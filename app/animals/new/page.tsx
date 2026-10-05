import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card, LockedServiceCard } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { Button } from '../../../src/ui/button.tsx';
import { PageHeader, SectionHeader } from '../../../src/ui/section-header.tsx';
import { PageCrumbs } from '../../../src/ui/page-crumbs.tsx';
import { Stepper } from '../../../src/ui/stepper.tsx';
import { db } from '../../../src/db/client.ts';
import { eligibilityFor } from '../../../src/domain/eligibility/service.ts';
import { openDraft } from '../../../src/animals/service.ts';
import { startAnimalDraftAction } from '../actions.ts';

export const dynamic = 'force-dynamic';

/** The six steps of the form the draft opens into (same labels as the wizard). */
const STEPS = ['گونه و نژاد', 'جنسیت و تولد', 'مشخصات ظاهری', 'تصویر', 'میکروچیپ', 'منبع شناسایی و مرور'];

/**
 * Entry point for animal registration (P07 / K10, before step 1 is saved).
 *
 * The rule is enforced here on the server, not only on the card that links to
 * it: approved KYC opens this route and membership is not required (§9.1).
 */
export default async function NewAnimalPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const guard = await guardRoute('/animals/new');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  const eligibility = await eligibilityFor(db(), actor.accountId, 'ANIMAL_REGISTRATION');
  const draft = eligibility.allowed ? await openDraft(db(), actor) : null;
  const { error } = await searchParams;

  return (
    <PublicShell
      actor={actor}
      title="ثبت حیوان هم‌زیست"
      pathname="/animals/new"
      header={
        <div>
          <PageCrumbs
            items={[
              { name: 'خانه', href: '/dashboard' },
              { name: 'حیوان‌های من', href: '/animals' },
              { name: 'ثبت حیوان هم‌زیست' },
            ]}
          />
          <PageHeader
            title="ثبت حیوان هم‌زیست"
            back={{ href: '/animals' }}
            meta={['هر مرحله جدا ذخیره می‌شود؛ هر وقت برگردید از همان مرحله ادامه می‌دهید.']}
          />
        </div>
      }
    >
      {eligibility.allowed ? (
        <>
          <Card>
            <Stepper label="مراحل ثبت" steps={STEPS.map((label) => ({ label }))} current={1} />
          </Card>
          <div className="grid items-start gap-xl lg:grid-cols-12">
            <div className="min-w-0 space-y-lg lg:col-span-7">
              {error ? <Alert tone="error" title={error} /> : null}
              <Alert tone="success" title="این خدمت برای شما باز است">
                احراز هویت شما تأیید شده است. برای ثبت حیوان، عضویت انجمن لازم نیست و نشانی سکونت هم اجباری نیست.
              </Alert>
              <Card>
                <SectionHeader size="sm" title="شروع ثبت" />
                <p className="mt-md text-body-sm text-text-secondary">
                  فرم شش‌مرحله‌ای است و هر مرحله ذخیره می‌شود؛ اگر نیمه‌کاره خارج شوید، از همان‌جا ادامه می‌دهید.
                </p>
                {draft ? (
                  <div className="mt-md">
                    <Alert tone="neutral" title="پیش‌نویس باز">
                      <span data-testid="open-draft-notice">
                        یک پیش‌نویس باز دارید و ادامه از همان‌جا انجام می‌شود.
                      </span>
                    </Alert>
                  </div>
                ) : null}
                <form action={startAnimalDraftAction} className="mt-lg">
                  <Button type="submit" size="lg" block data-testid="start-animal-draft">
                    {draft ? 'ادامه پیش‌نویس' : 'شروع ثبت حیوان هم‌زیست'}
                  </Button>
                </form>
              </Card>
            </div>
            <aside className="min-w-0 lg:col-span-5" aria-label="پس از ثبت">
              <Card>
                <SectionHeader size="sm" title="پس از ثبت" />
                <ol className="mt-md list-decimal space-y-sm ps-xl text-body-sm text-text-secondary">
                  <li>حیوان را برای کاشت یا تأیید میکروچیپ و نمونه‌گیری نزد دامپزشک معتمد ببرید.</li>
                  <li>پس از تأیید دامپزشک، مشخصات رسمی ثبت می‌شود و برگه ثبتی قابل درخواست است.</li>
                </ol>
              </Card>
            </aside>
          </div>
        </>
      ) : (
        <LockedServiceCard serviceLabel="ثبت حیوان هم‌زیست" lock={eligibility.lock} />
      )}
    </PublicShell>
  );
}
