import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { StatusBadge, type StatusTone } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { myCentreClaims } from '../../../../src/centres/claims.ts';
import { CLAIM_DOCUMENT_KIND_FA, type ClaimDocumentKind } from '../../../../src/suggestions/model.ts';
import { APPLICATION_STATUS_FA, canAppeal, type VetApplicationStatus } from '../../../../src/vets/onboarding-model.ts';
import { formatInstantFa } from '../../../../src/content/model.ts';
import {
  AppealCentreClaimForm,
  CentreClaimCorrectionForm,
  WithdrawCentreClaimForm,
} from '../../../../src/suggestions/forms.tsx';

export const dynamic = 'force-dynamic';

const TONE: Record<VetApplicationStatus, StatusTone> = {
  SUBMITTED: 'info',
  NEEDS_CORRECTION: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
  WITHDRAWN: 'neutral',
};

/** The claims this account made on centres — Requirements-Phase-2 §10 (PROMPT-009). */
export default async function AccountCentreClaimsPage() {
  const guard = await guardRoute('/account/centres/claims');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const claims = await myCentreClaims(db(), guard.actor);

  return (
    <PublicShell actor={guard.actor} title="درخواست‌های مدیریت مرکز" pathname="/account/centres">
      <div className="space-y-lg">
        <Card>
          <h1 className="text-h4">درخواست‌های مدیریت مرکز</h1>
          <p className="mt-xs text-body-sm text-text-secondary">
            درخواست را از صفحه همان مرکز بدون مالک ثبت می‌کنید. تأیید، ویرایش آینده مرکز را به شما می‌سپارد؛ تاریخچه ثبت‌شده تغییر نمی‌کند.
          </p>
          <p className="mt-sm text-body-sm">
            <Link href="/centers" className="text-text-brand underline underline-offset-4">
              دیدن مراکز بدون مالک در فهرست عمومی
            </Link>
          </p>
        </Card>

        {claims.length === 0 ? (
          <EmptyState title="درخواستی ثبت نکرده‌اید" description="از صفحه مرکز بدون مالک، «این مرکز شماست؟» را بزنید." />
        ) : (
          <ul className="space-y-md" data-testid="my-centre-claims">
            {claims.map((claim) => (
              <li key={claim.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-sm">
                    <div className="min-w-0">
                      <p className="text-label-lg">{claim.centreNameFa}</p>
                      <p className="mt-2xs text-caption text-text-secondary">
                        {[claim.roleFa, 'ارسال: ' + formatInstantFa(claim.submittedAt)].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <span data-testid={'claim-status-' + claim.id}>
                      <StatusBadge tone={TONE[claim.status as VetApplicationStatus]}>
                        {APPLICATION_STATUS_FA[claim.status as VetApplicationStatus]}
                      </StatusBadge>
                    </span>
                  </div>

                  {claim.reviewNoteFa && claim.status !== 'SUBMITTED' ? (
                    <div className="mt-md" data-testid={'claim-note-' + claim.id}>
                      <Alert tone={claim.status === 'APPROVED' ? 'success' : 'warning'} title="نتیجه بررسی">
                        {claim.reviewNoteFa}
                      </Alert>
                    </div>
                  ) : null}
                  {claim.status === 'APPROVED' ? (
                    <p className="mt-sm text-body-sm">
                      <Link href="/account/centres" className="text-text-brand underline underline-offset-4" data-testid={'claim-manage-' + claim.id}>
                        رفتن به مرکز من
                      </Link>
                    </p>
                  ) : null}

                  {claim.documents.length > 0 ? (
                    <ul className="mt-md space-y-2xs text-body-sm">
                      {claim.documents.map((document) => (
                        <li key={document.fileId}>
                          <a
                            href={'/api/files/' + document.fileId}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-text-brand underline underline-offset-4"
                          >
                            {CLAIM_DOCUMENT_KIND_FA[document.kind as ClaimDocumentKind]}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {claim.status === 'NEEDS_CORRECTION' ? (
                    <CentreClaimCorrectionForm
                      claim={{
                        id: claim.id,
                        version: claim.version,
                        claimantNameFa: claim.claimantNameFa,
                        roleFa: claim.roleFa,
                        phone: claim.phone,
                        statementFa: claim.statementFa,
                      }}
                    />
                  ) : null}
                  {canAppeal(claim) ? <AppealCentreClaimForm claimId={claim.id} version={claim.version} /> : null}
                  {claim.status === 'SUBMITTED' || claim.status === 'NEEDS_CORRECTION' ? (
                    <WithdrawCentreClaimForm claimId={claim.id} version={claim.version} />
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PublicShell>
  );
}
