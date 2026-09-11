import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../../src/ui/shell.tsx';
import { Card } from '../../../../../src/ui/card.tsx';
import { Alert } from '../../../../../src/ui/alert.tsx';
import { db } from '../../../../../src/db/client.ts';
import { claimableCentre, myCentreClaims } from '../../../../../src/centres/claims.ts';
import { CentreClaimForm } from '../../../../../src/suggestions/forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * Claiming an unowned centre — Requirements-Phase-2 §10 (PROMPT-009).
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
    <PublicShell actor={guard.actor} title="درخواست مدیریت مرکز" pathname="/account/centres">
      <div className="space-y-lg">
        <Card>
          <h1 className="text-h4">{centre.displayNameFa}</h1>
          <p className="mt-xs text-body-sm text-text-secondary">{(centre.cityNameFa ? centre.cityNameFa + ' · ' : '') + 'مرکز بدون مالک'}</p>
          <p className="mt-md text-body-sm">
            برای واگذاری مدیریت، مدرکی لازم است که نشان دهد از طرف این مرکز صحبت می‌کنید: پروانه مرکز، معرفی‌نامه یا وکالت‌نامه.
          </p>
        </Card>

        {open ? (
          <div data-testid={open.centreId === centre.id ? 'claim-in-review' : 'claim-other-open'}>
            <Alert
              tone="info"
              title={open.centreId === centre.id ? 'درخواست شما برای این مرکز در حال بررسی است' : 'درخواست دیگری از شما در حال بررسی است'}
            >
              <Link href="/account/centres/claims" className="text-text-brand underline underline-offset-4">
                پیگیری درخواست
              </Link>
            </Alert>
          </div>
        ) : (
          <CentreClaimForm claimSlug={centre.slug!} centreNameFa={centre.displayNameFa} />
        )}
      </div>
    </PublicShell>
  );
}
