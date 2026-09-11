import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, ADMIN_NAV } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { breedForEditing } from '../../../../src/breeds/service.ts';
import { CLAIM_KIND_FA, STATUS_FA } from '../../../../src/breeds/model.ts';
import { formatCivilDateFa } from '../../../../src/domain/calendar.ts';
import { ArchiveClaimForm, BreedProfileForm, BreedStatusForm, DuplicateForm, MedicalClaimForm } from './forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * One breed in the bank — Requirements-Phase-2 §6, §21 (PROMPT-003).
 *
 * The superadmin environment edits the same `reference_breed` row Phase 1 forms
 * choose from. Every save carries the version it was made against, and every
 * change is written to the audit history with its previous value.
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
    <OpsShell actor={guard.actor} title="سوپرادمین" pathname="/admin/breeds" nav={ADMIN_NAV}>
      <div className="space-y-lg">
        <Link href="/admin/breeds" className="text-label-md text-text-brand underline underline-offset-4">
          بازگشت به فهرست نژادها
        </Link>

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-md">
            <div className="min-w-0">
              <h1 className="text-h4">{breed.nameFa}</h1>
              <p className="text-caption text-text-secondary">
                <bdi>{breed.nameEn}</bdi>
              </p>
            </div>
            <div className="flex flex-wrap gap-xs">
              <StatusBadge tone={breed.profileStatus === 'PUBLISHED' ? 'info' : 'neutral'}>
                {'صفحه: ' + STATUS_FA[breed.profileStatus]}
              </StatusBadge>
              <StatusBadge tone={breed.isActive ? 'success' : 'neutral'}>
                {breed.isActive ? 'در انتخاب‌های فرم' : 'کنارگذاشته از انتخاب‌ها'}
              </StatusBadge>
            </div>
          </div>
          <p className="mt-md text-caption text-text-secondary">
            {'نسخه ' + breed.version.toLocaleString('fa-IR') + ' · نشانی: '}
            <bdi dir="ltr">{'/breeds/' + breed.slug}</bdi>
            {redirects.length > 0 ? (
              <>
                {' · نشانی‌های قبلی: '}
                <bdi dir="ltr">{redirects.map((row) => row.slug).join(', ')}</bdi>
              </>
            ) : null}
          </p>
          {breed.profileStatus !== 'DRAFT' ? (
            <p className="mt-sm">
              <Link
                href={'/breeds/' + breed.slug}
                className="text-label-md text-text-brand underline underline-offset-4"
                data-testid="breed-public-link"
              >
                مشاهده صفحه عمومی
              </Link>
            </p>
          ) : null}
        </Card>

        {primary ? (
          <Alert tone="warning" title="این نژاد تکراری است">
            <span data-testid="breed-duplicate-of">{'رکورد اصلی: ' + primary.nameFa}</span>
          </Alert>
        ) : null}

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

        <BreedStatusForm breedId={breed.id} version={breed.version} status={breed.profileStatus} />

        <MedicalClaimForm breedId={breed.id} />

        <Card>
          <h2 className="text-label-lg">مطالب سلامت و ژنتیک</h2>
          {claims.length === 0 ? (
            <p className="mt-md text-body-sm text-text-secondary">هنوز مطلبی ثبت نشده است.</p>
          ) : (
            <ul className="mt-lg space-y-md" data-testid="admin-claims">
              {claims.map((claim) => (
                <li key={claim.id} className="rounded-lg border border-border-subtle p-lg" data-testid="admin-claim">
                  <div className="flex flex-wrap items-start justify-between gap-sm">
                    <div className="min-w-0">
                      <p className="text-caption text-text-secondary">{CLAIM_KIND_FA[claim.kind]}</p>
                      <p className="text-label-md">{claim.titleFa}</p>
                    </div>
                    {claim.archivedAt ? <StatusBadge tone="neutral">برداشته‌شده</StatusBadge> : null}
                  </div>
                  <p className="mt-sm text-caption text-text-secondary">
                    {'منبع: ' + claim.sourceTitle + ' · بازبینی: ' + formatCivilDateFa(claim.reviewedOn)}
                  </p>
                  {claim.archivedAt ? null : <ArchiveClaimForm breedId={breed.id} claimId={claim.id} />}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {breed.mergedIntoBreedId ? null : (
          <DuplicateForm breedId={breed.id} version={breed.version} targets={mergeTargets} />
        )}
      </div>
    </OpsShell>
  );
}
