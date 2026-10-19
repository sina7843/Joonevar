import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { PageHeader } from '../../../../src/ui/section-header.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { ButtonLink } from '../../../../src/ui/button.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { ActionOwner, StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { myCentreClaims } from '../../../../src/centres/claims.ts';
import { CLAIM_DOCUMENT_KIND_FA, type ClaimDocumentKind } from '../../../../src/suggestions/model.ts';
import { canAppeal } from '../../../../src/vets/onboarding-model.ts';
import { formatInstantFa } from '../../../../src/content/model.ts';
import {
  AppealCentreClaimForm,
  CentreClaimCorrectionForm,
  WithdrawCentreClaimForm,
} from '../../../../src/suggestions/forms.tsx';

export const dynamic = 'force-dynamic';

/** The claims this account made on centres — Requirements-Phase-2 §10 (PROMPT-009). P05 list. */
export default async function AccountCentreClaimsPage() {
  const guard = await guardRoute('/account/centres/claims');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const claims = await myCentreClaims(db(), guard.actor);

  return (
    <PublicShell
      actor={guard.actor}
      title="درخواست‌های مدیریت مرکز"
      pathname="/account/centres"
      header={
        <PageHeader
          title="درخواست‌های مدیریت مرکز"
          back={{ href: '/account/centres' }}
          meta={[
            ...(claims.length > 0 ? [claims.length.toLocaleString('fa-IR') + ' درخواست'] : []),
            'تأیید، ویرایش آینده مرکز را به شما می‌سپارد؛ تاریخچه ثبت‌شده تغییر نمی‌کند.',
          ]}
          actions={
            <ButtonLink tone="secondary" href="/centers" iconStart="buildings">
              دیدن مراکز بدون مالک در فهرست عمومی
            </ButtonLink>
          }
        />
      }
    >
      {claims.length === 0 ? (
        <EmptyState
          title="درخواستی ثبت نکرده‌اید"
          description="از صفحه مرکز بدون مالک، «این مرکز شماست؟» را بزنید."
          action={
            <ButtonLink tone="secondary" href="/centers">
              فهرست مراکز
            </ButtonLink>
          }
        />
      ) : (
        <ul className="hz-cardlist" data-testid="my-centre-claims">
          {claims.map((claim) => (
            <li key={claim.id} className="hz-cardlist__item">
              <div className="hz-cardlist__row">
                <span className="hz-cardlist__title min-w-0">{claim.centreNameFa}</span>
                <span data-testid={'claim-status-' + claim.id}>
                  <StatusBadge status={claim.status} />
                </span>
              </div>
              <span className="hz-cardlist__meta">
                {[claim.roleFa, 'ارسال: ' + formatInstantFa(claim.submittedAt)].filter(Boolean).join(' · ')}
              </span>

              {claim.status === 'SUBMITTED' ? <ActionOwner owner="SYSTEM" /> : null}
              {claim.status === 'NEEDS_CORRECTION' ? <ActionOwner owner="USER" /> : null}

              {claim.reviewNoteFa && claim.status !== 'SUBMITTED' ? (
                <div data-testid={'claim-note-' + claim.id}>
                  <Alert tone={claim.status === 'APPROVED' ? 'success' : 'warning'} title="نتیجه بررسی">
                    {claim.reviewNoteFa}
                  </Alert>
                </div>
              ) : null}
              {claim.status === 'APPROVED' ? (
                <div>
                  <ButtonLink tone="secondary" href="/account/centres" size="sm" data-testid={'claim-manage-' + claim.id}>
                    رفتن به مرکز من
                  </ButtonLink>
                </div>
              ) : null}

              {claim.documents.length > 0 ? (
                <ul className="flex flex-wrap gap-sm">
                  {claim.documents.map((document) => (
                    <li key={document.fileId}>
                      <a
                        href={'/api/files/' + document.fileId}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hz-attach-chip pe-sm text-text-primary no-underline"
                      >
                        <Icon name="paperclip" size="sm" />
                        <span className="hz-attach-chip__name">{CLAIM_DOCUMENT_KIND_FA[document.kind as ClaimDocumentKind]}</span>
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
            </li>
          ))}
        </ul>
      )}
    </PublicShell>
  );
}
