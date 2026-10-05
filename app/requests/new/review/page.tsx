import { inArray } from 'drizzle-orm';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { db } from '../../../../src/db/client.ts';
import { animals } from '../../../../src/db/schema/animals.ts';
import { findLocation } from '../../../../src/vets/registry.ts';
import { vetProfiles } from '../../../../src/db/schema/vets.ts';
import { eq } from 'drizzle-orm';
import {
  CONTACT_FOR_PRICE_FA,
  CONTEXT_FA,
  SERVICE_TYPE_FA,
  type VisitContextName,
} from '../../../../src/domain/referral.ts';
import { parseSelection } from '../../selection.ts';
import { ConfirmVisitForm } from './confirm-form.tsx';
import { PageCrumbs } from '../../../../src/ui/page-crumbs.tsx';
import { Stepper } from '../../../../src/ui/stepper.tsx';
import { PageHeader, SectionHeader } from '../../../../src/ui/section-header.tsx';
import { KeyValueList } from '../../../../src/ui/key-value.tsx';

export const dynamic = 'force-dynamic';

const CONTEXTS: readonly VisitContextName[] = ['MICROCHIP', 'DNA', 'PREGNANCY'];
const STEPS = [{ label: 'انتخاب حیوان و خدمت' }, { label: 'انتخاب دامپزشک و مرکز' }, { label: 'مرور و ثبت' }];

/** Review before anything is written — §11.2. */
export default async function ReviewVisitPage({
  searchParams,
}: {
  searchParams: Promise<{ context?: string; sel?: string; vet?: string; loc?: string }>;
}) {
  const guard = await guardRoute('/requests/new/review');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  const params = await searchParams;
  const context = (CONTEXTS as readonly string[]).includes(params.context ?? '')
    ? (params.context as VisitContextName)
    : 'MICROCHIP';
  const items = parseSelection(params.sel ?? '', context);
  const location = params.loc ? await findLocation(db(), params.loc) : null;
  const [vet] = params.vet
    ? await db().select().from(vetProfiles).where(eq(vetProfiles.accountId, params.vet)).limit(1)
    : [];

  if (items.length === 0 || !location || !vet || vet.accountId === null || location.vetAccountId !== vet.accountId) {
    return (
      <PublicShell actor={actor} title="مرور درخواست مراجعه" pathname="/requests/new/review">
        <Alert tone="error" title="انتخاب شما کامل نیست">
          دوباره از انتخاب حیوان‌ها شروع کنید تا حیوان، خدمت، دامپزشک و مرکز با هم ثبت شوند.
        </Alert>
      </PublicShell>
    );
  }

  const names = await db()
    .select({ id: animals.id, name: animals.name })
    .from(animals)
    .where(
      inArray(
        animals.id,
        items.map((i) => i.animalId),
      ),
    );

  const header = (
    <div>
      <PageCrumbs
        items={[
          { name: 'خانه', href: '/dashboard' },
          { name: 'درخواست‌ها', href: '/requests' },
          { name: 'مرور درخواست مراجعه' },
        ]}
      />
      <PageHeader title="مرور درخواست مراجعه" back={{ href: '/requests/new?context=' + context }} />
    </div>
  );

  return (
    <PublicShell actor={actor} title="مرور درخواست مراجعه" pathname="/requests/new/review" header={header}>
      <div className="hz-card">
        <Stepper
          label="مراحل درخواست مراجعه"
          steps={[{ label: STEPS[0]!.label, href: '/requests/new?context=' + context }, STEPS[1]!, STEPS[2]!]}
          current={3}
        />
      </div>
      <div className="grid items-start gap-xl lg:grid-cols-12">
        <div className="min-w-0 space-y-xl lg:col-span-7">
          <Card>
            <SectionHeader size="sm" title="حیوان‌ها و خدمت هرکدام" />
            <dl className="hz-kv mt-md" data-testid="review-items">
              {items.map((item) => (
                <div key={item.animalId} className="hz-kv__row">
                  <dt className="hz-kv__key">{names.find((n) => n.id === item.animalId)?.name ?? 'بدون نام'}</dt>
                  <dd className="hz-kv__value">{SERVICE_TYPE_FA[item.serviceType]}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-lg text-caption text-text-secondary">
              برای هر حیوان یک درخواست و یک کد مراجعه جداگانه صادر می‌شود. نوبت و ساعت رزرو نمی‌شود.
            </p>
          </Card>

          <ConfirmVisitForm
            context={context}
            selection={params.sel ?? ''}
            vetAccountId={vet.accountId}
            locationId={location.id}
          />
        </div>

        <aside className="min-w-0 lg:col-span-5" aria-label="دامپزشک و مرکز">
          <Card>
            <SectionHeader size="sm" title={CONTEXT_FA[context]} />
            <div className="mt-md">
              <KeyValueList
                rows={[
                  { key: 'دامپزشک معتمد', value: vet.displayNameFa },
                  { key: 'کد نظام دامپزشکی', value: <bdi dir="ltr">{vet.councilCode}</bdi> },
                  { key: 'مرکز', value: location.nameFa },
                  {
                    key: 'نشانی',
                    value:
                      [location.cityFa, location.neighborhoodFa].filter(Boolean).join(' · ') +
                      ' — ' +
                      location.addressFa,
                  },
                  { key: 'هزینه', value: CONTACT_FOR_PRICE_FA },
                ]}
              />
            </div>
          </Card>
        </aside>
      </div>
    </PublicShell>
  );
}
