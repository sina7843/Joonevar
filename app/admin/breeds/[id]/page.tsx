import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, ADMIN_NAV } from '../../../../src/ui/shell.tsx';
import { DeskHead, Panel } from '../../../../src/ui/desk.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { breedForEditing } from '../../../../src/breeds/service.ts';
import { CLAIM_KIND_FA } from '../../../../src/breeds/model.ts';
import { keyStatus } from '../../../../src/ui/queue.tsx';
import { formatCivilDateFa } from '../../../../src/domain/calendar.ts';
import { ArchiveClaimForm, BreedProfileForm, BreedStatusForm, DuplicateForm, MedicalClaimForm } from './forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * One breed in the bank — Requirements-Phase-2 §6, §21 (PROMPT-003).
 *
 * The superadmin environment edits the same `reference_breed` row Phase 1 forms
 * choose from. Every save carries the version it was made against, and every
 * change is written to the audit history with its previous value.
 *
 * DS P11 entity config: record head, then the profile form at the start and the
 * page-state and duplicate controls in the end column from 1024px.
 */
export default async function AdminBreedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // The real address, so signing in returns to this breed rather than the list.
  const guard = await guardRoute('/admin/breeds/' + encodeURIComponent(id));
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const data = await breedForEditing(db(), guard.actor, id);
  if (data === null) notFound();
  const { breed, claims, groups, species, mergeTargets, redirects, primary } = data;

  return (
    <OpsShell actor={guard.actor} title={breed.nameFa} pathname="/admin/breeds" nav={ADMIN_NAV} headingInPage>
      <Link href="/admin/breeds" className="hz-link hz-link--standalone hz-hide-md">
        بازگشت به فهرست نژادها
      </Link>

      <DeskHead level={1}
        title={
          <>
            {breed.nameFa}{' '}
            <bdi className="text-body-md font-normal text-text-secondary" dir="ltr">
              {breed.nameEn}
            </bdi>
          </>
        }
        status={{
          tone: keyStatus(breed.profileStatus).tone,
          // Dictionary label; the prefix only says which axis this is (page vs. form choice).
          label: 'صفحه: ' + keyStatus(breed.profileStatus).label,
        }}
        meta={[
          'نسخه ' + breed.version.toLocaleString('fa-IR'),
          <>
            {'نشانی: '}
            <bdi dir="ltr">{'/breeds/' + breed.slug}</bdi>
          </>,
          redirects.length > 0 ? (
            <>
              {'نشانی‌های قبلی: '}
              <bdi dir="ltr">{redirects.map((row) => row.slug).join(', ')}</bdi>
            </>
          ) : null,
          <span key="active" className="inline-flex items-center gap-xs">
            {'انتخاب در فرم‌ها: '}
            <StatusBadge status={breed.isActive ? 'ACTIVE' : 'INACTIVE'} size="sm" />
          </span>,
        ]}
      >
        {breed.profileStatus !== 'DRAFT' ? (
          <p>
            <Link href={'/breeds/' + breed.slug} className="hz-link hz-link--standalone" data-testid="breed-public-link">
              مشاهده صفحه عمومی
            </Link>
          </p>
        ) : null}
      </DeskHead>

      {primary ? (
        <Alert tone="warning" title="این نژاد تکراری است">
          <span data-testid="breed-duplicate-of">{'رکورد اصلی: ' + primary.nameFa}</span>
        </Alert>
      ) : null}

      <div className="hz-desk">
        <div className="min-w-0 space-y-lg">
          <BreedProfileForm
            breed={{
              id: breed.id,
              version: breed.version,
              nameFa: breed.nameFa,
              nameEn: breed.nameEn,
              slug: breed.slug,
              altNames: breed.altNames,
              speciesCode: breed.speciesCode,
              groupId: breed.groupId,
              originCountry: breed.originCountry,
              size: breed.size,
              coat: breed.coat,
              energy: breed.energy,
              trainability: breed.trainability,
              careNeed: breed.careNeed,
              withChildren: breed.withChildren,
              withOtherAnimals: breed.withOtherAnimals,
              historyFa: breed.historyFa,
              standardFa: breed.standardFa,
              standardUrl: breed.standardUrl,
              profileStatus: breed.profileStatus,
            }}
            groups={groups.map(({ id, fciGroup, nameFa }) => ({ id, fciGroup, nameFa }))}
            species={species.map(({ code, nameFa }) => ({ code, nameFa }))}
          />

          <Panel title="مطالب سلامت و ژنتیک" count={claims.length.toLocaleString('fa-IR')}>
            {claims.length === 0 ? (
              <p className="text-body-sm text-text-secondary">هنوز مطلبی ثبت نشده است.</p>
            ) : (
              <ul className="divide-y divide-border-subtle" data-testid="admin-claims">
                {claims.map((claim) => (
                  <li key={claim.id} className="py-md first:pt-0 last:pb-0" data-testid="admin-claim">
                    <div className="flex flex-wrap items-start justify-between gap-sm">
                      <div className="min-w-0">
                        <p className="text-caption text-text-secondary">{CLAIM_KIND_FA[claim.kind]}</p>
                        <h3 className="hz-card__title">{claim.titleFa}</h3>
                      </div>
                      {claim.archivedAt ? (
                        <StatusBadge status="REMOVED" size="sm" />
                      ) : null}
                    </div>
                    <p className="mt-xs text-caption text-text-secondary">
                      {'منبع: ' + claim.sourceTitle + ' · بازبینی: ' + formatCivilDateFa(claim.reviewedOn)}
                    </p>
                    {claim.archivedAt ? null : <ArchiveClaimForm breedId={breed.id} claimId={claim.id} />}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <MedicalClaimForm breedId={breed.id} />
        </div>

        <div className="min-w-0 space-y-lg">
          <BreedStatusForm breedId={breed.id} version={breed.version} status={breed.profileStatus} />
          {breed.mergedIntoBreedId ? null : (
            <DuplicateForm breedId={breed.id} version={breed.version} targets={mergeTargets} />
          )}
        </div>
      </div>
    </OpsShell>
  );
}
