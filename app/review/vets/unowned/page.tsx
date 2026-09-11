import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, REVIEW_NAV } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { db } from '../../../../src/db/client.ts';
import { directoryReferenceData } from '../../../../src/vets/directory.ts';
import { unownedVetProfiles } from '../../../../src/vets/onboarding.ts';
import { VET_PUBLIC_STATUS_FA } from '../../../../src/vets/directory-model.ts';
import { AddCityForm } from '../../../../src/vets/directory-forms.tsx';
import { ReviewStatusForm, UnownedVetForm } from '../../../../src/vets/onboarding-forms.tsx';

export const dynamic = 'force-dynamic';

/** Unowned veterinarian profiles: publish a reviewed suggestion, hide or republish (§10, PROMPT-007). */
export default async function ReviewUnownedVetsPage() {
  const guard = await guardRoute('/review/vets/unowned');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const [profiles, reference] = await Promise.all([unownedVetProfiles(db(), guard.actor), directoryReferenceData(db())]);

  return (
    <OpsShell actor={guard.actor} title="اپراتور بررسی" pathname="/review/vets/unowned" nav={REVIEW_NAV}>
      <div className="space-y-lg">
        <UnownedVetForm provinces={reference.provinces} cities={reference.cities} />

        <Card>
          <h2 className="text-label-lg">پروفایل‌های بدون مالک</h2>
          {profiles.length === 0 ? (
            <div className="mt-lg">
              <EmptyState title="پروفایل بدون مالکی ثبت نشده است" description="پروفایل‌هایی که با فرم بالا منتشر شوند اینجا می‌آیند تا Claim شوند." />
            </div>
          ) : (
            <ul className="mt-lg space-y-md" data-testid="unowned-list">
              {profiles.map((profile) => (
                <li key={profile.id} className="rounded-lg border border-border-subtle p-lg" data-testid={'unowned-item-' + profile.id}>
                  <div className="flex flex-wrap items-start justify-between gap-sm">
                    <div className="min-w-0">
                      <p className="text-label-lg">{profile.displayNameFa}</p>
                      <p className="mt-2xs text-caption text-text-secondary">
                        {[profile.cityNameFa, profile.councilCode ? 'کد نظام ' + profile.councilCode : null, 'منبع: ' + (profile.sourceFa ?? '—')]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-xs">
                      <StatusBadge tone={profile.publicStatus === 'PUBLISHED' ? 'success' : 'warning'}>{VET_PUBLIC_STATUS_FA[profile.publicStatus]}</StatusBadge>
                      {profile.claimInReview ? <StatusBadge tone="info">Claim در حال بررسی</StatusBadge> : null}
                    </div>
                  </div>
                  {profile.publicStatus === 'PUBLISHED' && profile.publicSlug ? (
                    <Link
                      href={'/veterinarians/' + profile.publicSlug}
                      className="mt-xs inline-block text-label-md text-text-brand underline underline-offset-4"
                      data-testid={'unowned-link-' + profile.id}
                    >
                      صفحه عمومی
                    </Link>
                  ) : null}
                  {profile.publicStatus === 'DRAFT' ? null : (
                    <ReviewStatusForm profileId={profile.id} version={profile.version} publicStatus={profile.publicStatus} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <AddCityForm surface="review" provinces={reference.provinces} />
      </div>
    </OpsShell>
  );
}
