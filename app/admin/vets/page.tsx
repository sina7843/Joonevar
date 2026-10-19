import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { ADMIN_NAV, OpsShell } from '../../../src/ui/shell.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { eligibilityOf, listVetProfiles, locationsOfVet } from '../../../src/vets/registry.ts';
import { VET_PUBLIC_STATUS_FA } from '../../../src/vets/directory-model.ts';
import { AddLocationForm, EditLocationForm, VetProfileForm } from './forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * The trusted veterinarian registry — §21.4, D01, D02.
 *
 * MVP has no public onboarding: these rows describe veterinarians the
 * association already approved, and they are entered here rather than being
 * invented by the product. The council code and the location licence are
 * recorded and judged separately.
 */
export default async function AdminVetsPage() {
  const guard = await guardRoute('/admin/vets');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const vets = await listVetProfiles(db());
  const locations = await Promise.all(
    vets.map(async (vet) => ({ vet, rows: await locationsOfVet(db(), vet.accountId) })),
  );

  return (
    <OpsShell actor={guard.actor} title="دامپزشکان معتمد" pathname="/admin/vets" nav={ADMIN_NAV}>
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">{vets.length.toLocaleString('fa-IR') + ' دامپزشک ثبت‌شده'}</span>
      </p>
      <Alert tone="info" title="این صفحه فرم درخواست معتمدشدن نیست">
        گردش درخواست و تأیید نقش دامپزشک طبق D01 در فاز بعدی است. اینجا فقط داده دامپزشکان از قبل تأییدشده و
        مراکز آن‌ها ثبت می‌شود.
      </Alert>

      <div className="grid items-start gap-lg lg:grid-cols-2">
        <VetProfileForm />
        {vets.length > 0 ? <AddLocationForm vets={vets.map((v) => ({ accountId: v.accountId, nameFa: v.displayNameFa }))} /> : null}
      </div>

      {vets.length === 0 ? (
        <EmptyState
          title="هنوز دامپزشکی ثبت نشده است"
          description="تا ورود داده واقعی دامپزشکان تأییدشده، Finder نتیجه‌ای ندارد و هیچ داده نمونه‌ای جایگزین آن نمی‌شود."
        />
      ) : (
        <ul className="space-y-lg" data-testid="vet-registry" aria-label="دامپزشکان ثبت‌شده">
          {locations.map(({ vet, rows }) => (
            <li key={vet.id} className="hz-card space-y-md">
              <div className="flex flex-wrap items-start justify-between gap-sm">
                <div className="min-w-0">
                  <h2 className="hz-card__title">{vet.displayNameFa}</h2>
                  <p className="text-caption text-text-secondary">
                    {'کد نظام دامپزشکی '}
                    <bdi dir="ltr">{vet.councilCode}</bdi>
                  </p>
                </div>
                <Link
                  href={'/admin/vets/' + vet.accountId}
                  className="hz-link hz-link--standalone"
                  data-testid={'directory-edit-' + vet.accountId}
                >
                  {'پروفایل عمومی · ' + VET_PUBLIC_STATUS_FA[vet.publicStatus]}
                </Link>
              </div>

              {rows.length === 0 ? (
                <p className="text-body-sm text-text-secondary">مرکزی برای این دامپزشک ثبت نشده است.</p>
              ) : (
                <ul className="divide-y divide-border-subtle border-t border-border-subtle">
                  {rows.map((location) => {
                    const microchip = eligibilityOf(location, 'MICROCHIP');
                    return (
                      <li key={location.id} className="py-md last:pb-0">
                        <div className="flex flex-wrap items-start justify-between gap-sm">
                          <div className="min-w-0">
                            <h3 className="text-label-lg">{location.nameFa}</h3>
                            <p className="text-caption text-text-secondary">
                              {[location.cityFa, location.neighborhoodFa].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          <span className="hz-tag hz-tag--neutral">
                            {microchip.eligible ? 'در Finder میکروچیپ' : 'خارج از Finder میکروچیپ'}
                          </span>
                        </div>
                        {microchip.eligible ? null : <p className="mt-xs text-caption text-text-secondary">{microchip.reasonFa}</p>}
                        <EditLocationForm
                          location={{
                            id: location.id,
                            nameFa: location.nameFa,
                            version: location.version,
                            licenceStatus: location.licenceStatus,
                            canImplantMicrochip: location.canImplantMicrochip,
                            canDrawBloodSample: location.canDrawBloodSample,
                            canPregnancyCheck: location.canPregnancyCheck,
                            isActive: location.isActive,
                          }}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </OpsShell>
  );
}
