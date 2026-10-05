import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../../src/ui/shell.tsx';
import { PageHeader } from '../../../../../src/ui/section-header.tsx';
import { PageCrumbs } from '../../../../../src/ui/page-crumbs.tsx';
import { Card } from '../../../../../src/ui/card.tsx';
import { ButtonLink } from '../../../../../src/ui/button.tsx';
import { WaitingState } from '../../../../../src/ui/states.tsx';
import { KeyValueList } from '../../../../../src/ui/key-value.tsx';
import { db } from '../../../../../src/db/client.ts';
import { claimableCentre, myCentreClaims } from '../../../../../src/centres/claims.ts';
import { CentreClaimForm } from '../../../../../src/suggestions/forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * Claiming an unowned centre — Requirements-Phase-2 §10 (PROMPT-009). P07 form.
 * The claim moves who may edit from now on, not the ownership of the history.
 */
export default async function ClaimCentrePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // The real address, so signing in returns to this claim.
  const guard = await guardRoute('/account/centres/claim/' + encodeURIComponent(slug));
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const centre = await claimableCentre(db(), slug);
  if (centre === null) notFound();
  const claims = await myCentreClaims(db(), guard.actor);
  const open = claims.find((claim) => claim.status === 'SUBMITTED' || claim.status === 'NEEDS_CORRECTION') ?? null;

  return (
    <PublicShell
      actor={guard.actor}
      title="درخواست مدیریت مرکز"
      pathname="/account/centres"
      header={
        <div>
          <PageCrumbs items={[{ href: '/dashboard', name: 'خانه' }, { href: '/account/centres', name: 'مراکز من' }, { name: 'درخواست مدیریت مرکز' }]} />
          <PageHeader
            title="درخواست مدیریت مرکز"
            back={{ href: '/account/centres' }}
            meta={[centre.displayNameFa, (centre.cityNameFa ? centre.cityNameFa + ' · ' : '') + 'مرکز بدون مالک']}
          />
        </div>
      }
    >
      <div className="grid gap-xl lg:grid-cols-12">
        <div className="space-y-xl lg:col-span-7">
          {open ? (
            <div data-testid={open.centreId === centre.id ? 'claim-in-review' : 'claim-other-open'}>
              <WaitingState
                title={open.centreId === centre.id ? 'درخواست شما برای این مرکز در حال بررسی است' : 'درخواست دیگری از شما در حال بررسی است'}
                owner={open.status === 'NEEDS_CORRECTION' ? 'USER' : 'SYSTEM'}
              />
              <div className="mt-md">
                <ButtonLink tone="secondary" href="/account/centres/claims">
                  پیگیری درخواست
                </ButtonLink>
              </div>
            </div>
          ) : (
            <CentreClaimForm claimSlug={centre.slug!} centreNameFa={centre.displayNameFa} />
          )}
        </div>
        <aside aria-label="خلاصه درخواست" className="space-y-lg lg:col-span-5">
          <Card>
            <div className="hz-section-header hz-section-header--sm">
              <h2 className="hz-section-header__title">
                <span className="hz-section-header__bar" aria-hidden="true" />
                <span>مرکز</span>
              </h2>
            </div>
            <KeyValueList
              rows={[
                { key: 'نام مرکز', value: centre.displayNameFa },
                { key: 'شهر', value: centre.cityNameFa, empty: 'تعیین‌نشده' },
                { key: 'وضعیت مدیریت', value: 'بدون مالک' },
              ]}
            />
            <p className="mt-md text-body-sm text-text-secondary">
              برای واگذاری مدیریت، مدرکی لازم است که نشان دهد از طرف این مرکز صحبت می‌کنید: پروانه مرکز، معرفی‌نامه یا وکالت‌نامه.
            </p>
          </Card>
        </aside>
      </div>
    </PublicShell>
  );
}
