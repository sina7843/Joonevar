import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, REVIEW_NAV } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { centreReferenceData, manageableCentres } from '../../../../src/centres/service.ts';
import { CENTRE_STATUS_FA, LICENCE_STATUS_FA, type CentreStatus, type LicenceStatusName } from '../../../../src/centres/model.ts';
import { CentreCreateForm } from '../../../../src/centres/forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * Centres in the review environment — Requirements-Phase-2 §9, §10, §21 (PROMPT-008).
 * The reviewer publishes a reviewed record and records its licence; the content
 * of an owned centre belongs to its manager.
 */
export default async function ReviewCentresPage() {
  const guard = await guardRoute('/review/centres');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const [centres, reference] = await Promise.all([manageableCentres(db(), guard.actor), centreReferenceData(db())]);

  return (
    <OpsShell actor={guard.actor} title="اپراتور بررسی" pathname="/review/centres" nav={REVIEW_NAV}>
      <div className="space-y-lg">
        <CentreCreateForm surface="review" types={reference.types} provinces={reference.provinces} cities={reference.cities} />

        <Card>
          <h2 className="text-label-lg">مراکز</h2>
          <p className="mt-xs text-body-sm text-text-secondary">
            مرکز بدون مالک با برچسب خودش منتشر می‌شود و تا Claim، مدیری ندارد.
          </p>
          {centres.length === 0 ? (
            <div className="mt-lg">
              <EmptyState title="مرکزی ثبت نشده است" description="با فرم بالا مرکز بررسی‌شده را ثبت کنید." />
            </div>
          ) : (
            <ul className="mt-lg space-y-sm" data-testid="centre-list">
              {centres.map((row) => (
                <li key={row.centre.id}>
                  <Link
                    href={'/review/centres/' + row.centre.id}
                    className="block rounded-lg border border-border-subtle p-lg hover:border-border-brand"
                    data-testid={'centre-row-' + row.centre.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-sm">
                      <div className="min-w-0">
                        <p className="text-label-lg">{row.centre.displayNameFa}</p>
                        <p className="mt-2xs text-caption text-text-secondary">
                          {[row.typeNameFa, row.cityNameFa, row.centre.sourceFa ? 'منبع: ' + row.centre.sourceFa : null].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-xs">
                        <StatusBadge tone={row.centre.publicStatus === 'PUBLISHED' ? 'success' : row.centre.publicStatus === 'HIDDEN' ? 'warning' : 'neutral'}>
                          {CENTRE_STATUS_FA[row.centre.publicStatus as CentreStatus]}
                        </StatusBadge>
                        <StatusBadge tone={row.centre.licenceStatus === 'VALID' ? 'info' : 'neutral'}>
                          {'مجوز: ' + LICENCE_STATUS_FA[row.centre.licenceStatus as LicenceStatusName]}
                        </StatusBadge>
                        {row.centre.ownerAccountId ? null : <StatusBadge tone="warning">بدون مالک</StatusBadge>}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </OpsShell>
  );
}
