import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, REVIEW_NAV } from '../../../../src/ui/shell.tsx';
import { CaseItem, CaseList, Panel } from '../../../../src/ui/desk.tsx';
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
    <OpsShell actor={guard.actor} title="پروفایل‌های بدون مالک" pathname="/review/vets/unowned" nav={REVIEW_NAV}>
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">{profiles.length.toLocaleString('fa-IR') + ' پروفایل بدون مالک'}</span>
      </p>
      <div className="grid items-start gap-lg lg:grid-cols-2">
        <Panel title="پروفایل‌های بدون مالک" count={profiles.length.toLocaleString('fa-IR')}>
          {profiles.length === 0 ? (
            <EmptyState title="پروفایل بدون مالکی ثبت نشده است" description="پروفایل‌هایی که با فرم انتشار منتشر شوند اینجا می‌آیند تا Claim شوند." />
          ) : (
            <CaseList label="پروفایل‌های بدون مالک" testId="unowned-list">
              {profiles.map((profile) => (
                <CaseItem
                  key={profile.id}
                  testId={'unowned-item-' + profile.id}
                  type={profile.claimInReview ? 'Claim در حال بررسی' : undefined}
                  name={profile.displayNameFa}
                  code={profile.councilCode}
                  sub={[profile.cityNameFa, 'منبع: ' + (profile.sourceFa ?? '—')].filter(Boolean).join(' · ')}
                  status={{ tone: profile.publicStatus === 'PUBLISHED' ? 'success' : 'warning', label: VET_PUBLIC_STATUS_FA[profile.publicStatus] }}
                >
                  {profile.publicStatus === 'PUBLISHED' && profile.publicSlug ? (
                    <Link href={'/veterinarians/' + profile.publicSlug} className="hz-link hz-link--standalone" data-testid={'unowned-link-' + profile.id}>
                      صفحه عمومی
                    </Link>
                  ) : null}
                  {profile.publicStatus === 'DRAFT' ? null : (
                    <ReviewStatusForm profileId={profile.id} version={profile.version} publicStatus={profile.publicStatus} />
                  )}
                </CaseItem>
              ))}
            </CaseList>
          )}
        </Panel>
        <div className="space-y-lg">
          <UnownedVetForm provinces={reference.provinces} cities={reference.cities} />
          <AddCityForm surface="review" provinces={reference.provinces} />
        </div>
      </div>
    </OpsShell>
  );
}
