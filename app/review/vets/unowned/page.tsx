import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, REVIEW_NAV } from '../../../../src/ui/shell.tsx';
import { CaseItem, CaseList, Panel } from '../../../../src/ui/desk.tsx';
import { keyStatus } from '../../../../src/ui/queue.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { QueueFrame } from '../../../../src/ui/queue-head.tsx';
import { readQueueQuery, sliceQueue } from '../../../../src/domain/queue-query.ts';
import { db } from '../../../../src/db/client.ts';
import { directoryReferenceData } from '../../../../src/vets/directory.ts';
import { unownedVetProfiles } from '../../../../src/vets/onboarding.ts';
import { AddCityForm } from '../../../../src/vets/directory-forms.tsx';
import { ReviewStatusForm, UnownedVetForm } from '../../../../src/vets/onboarding-forms.tsx';

export const dynamic = 'force-dynamic';

/** Unowned veterinarian profiles: publish a reviewed suggestion, hide or republish (§10, PROMPT-007). */
export default async function ReviewUnownedVetsPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string; page?: string }> }) {
  const guard = await guardRoute('/review/vets/unowned');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const [profiles, reference] = await Promise.all([unownedVetProfiles(db(), guard.actor), directoryReferenceData(db())]);
  const query = readQueueQuery(await searchParams, 'newest');
  const page = sliceQueue(profiles, query, {
    text: (profile) => [profile.displayNameFa, profile.councilCode ?? '', profile.cityNameFa ?? ''].join(' '),
    at: (profile) => profile.createdAt,
    name: (profile) => profile.displayNameFa,
  });

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
            <QueueFrame
              path="/review/vets/unowned"
              params={{ q: query.q, sort: query.sort === 'newest' ? undefined : query.sort }}
              query={query}
              page={page}
              all={page.all}
              noun="پروفایل"
              searchLabel="جست‌وجوی نام یا کد نظام"
              defaultSort="newest"
              testId="unowned-queue-frame"
            >
              {page.items.length === 0 ? (
                <EmptyState title="نتیجه‌ای پیدا نشد" description="عبارت جست‌وجو را دوباره بررسی کنید." />
              ) : (
            <CaseList label="پروفایل‌های بدون مالک" testId="unowned-list">
              {page.items.map((profile) => (
                <CaseItem
                  key={profile.id}
                  testId={'unowned-item-' + profile.id}
                  type={profile.claimInReview ? 'Claim در حال بررسی' : undefined}
                  name={profile.displayNameFa}
                  code={profile.councilCode}
                  sub={[profile.cityNameFa, 'منبع: ' + (profile.sourceFa ?? '—')].filter(Boolean).join(' · ')}
                  status={keyStatus(profile.publicStatus)}
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
            </QueueFrame>
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
