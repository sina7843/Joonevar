import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../../src/ui/access-denied.tsx';
import { OpsShell, REVIEW_NAV } from '../../../../../src/ui/shell.tsx';
import { Card } from '../../../../../src/ui/card.tsx';
import { Alert } from '../../../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../../../src/ui/status.tsx';
import { db } from '../../../../../src/db/client.ts';
import { centreClaimForReview } from '../../../../../src/centres/claims.ts';
import { CLAIM_DOCUMENT_KIND_FA, type ClaimDocumentKind } from '../../../../../src/suggestions/model.ts';
import { APPLICATION_STATUS_FA, type VetApplicationStatus } from '../../../../../src/vets/onboarding-model.ts';
import { formatInstantFa } from '../../../../../src/content/model.ts';
import { CentreClaimDecisionForm } from '../../../../../src/suggestions/forms.tsx';

export const dynamic = 'force-dynamic';

function Fact({ label, value, ltr = false }: { label: string; value: string | null; ltr?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-md border-b border-border-subtle py-sm last:border-b-0">
      <dt className="text-body-sm text-text-secondary">{label}</dt>
      <dd className="text-label-md" dir={ltr ? 'ltr' : undefined}>
        {value}
      </dd>
    </div>
  );
}

/** One centre claim, its documents and the centre it is about — §10, §22 (PROMPT-009). */
export default async function ReviewCentreClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/review/centres/claims/' + encodeURIComponent(id));
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const data = await centreClaimForReview(db(), guard.actor, id);
  if (data === null) notFound();
  const { claim, documents } = data;
  const ownClaim = claim.accountId === guard.actor.accountId;

  return (
    <OpsShell actor={guard.actor} title="اپراتور بررسی" pathname="/review/centres/claims" nav={REVIEW_NAV}>
      <div className="space-y-lg">
        <Link href="/review/centres/claims" className="text-label-md text-text-brand underline underline-offset-4">
          بازگشت به درخواست‌ها
        </Link>

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-md">
            <div>
              <p className="text-caption text-text-secondary">{data.centreNameFa}</p>
              <h1 className="text-h4">{claim.claimantNameFa}</h1>
            </div>
            <span data-testid="claim-review-status">
              <StatusBadge tone={claim.status === 'SUBMITTED' ? 'warning' : claim.status === 'APPROVED' ? 'success' : 'neutral'}>
                {APPLICATION_STATUS_FA[claim.status as VetApplicationStatus]}
              </StatusBadge>
            </span>
          </div>
          <dl className="mt-lg">
            <Fact label="سمت در مرکز" value={claim.roleFa} />
            <Fact label="نام روی پرونده هویتی حساب" value={data.accountNameFa} />
            <Fact label="تلفن" value={claim.phone} ltr />
            <Fact label="ارسال" value={formatInstantFa(claim.submittedAt)} />
          </dl>
          {claim.statementFa ? <p className="mt-md whitespace-pre-line text-body-sm">{claim.statementFa}</p> : null}
          {claim.appealFa ? (
            <div className="mt-md" data-testid="claim-appeal">
              <Alert tone="info" title="تجدیدنظر درخواست‌دهنده">
                {claim.appealFa}
              </Alert>
            </div>
          ) : null}
          {claim.reviewNoteFa ? (
            <p className="mt-md text-caption text-text-secondary" data-testid="claim-last-note">
              {'آخرین تصمیم: ' + claim.reviewNoteFa + (claim.reviewedAt ? ' · ' + formatInstantFa(claim.reviewedAt) : '')}
            </p>
          ) : null}
          {data.centreSlug ? (
            <p className="mt-sm text-body-sm">
              <Link href={'/centers/' + data.centreSlug} className="text-text-brand underline underline-offset-4" data-testid="claim-centre-link">
                صفحه عمومی مرکز
              </Link>
            </p>
          ) : null}
          {data.centreOwned ? (
            <div className="mt-md" data-testid="claim-centre-owned">
              <Alert tone="warning" title="این مرکز هم‌اکنون مدیر دارد">
                تأیید این درخواست دیگر ممکن نیست.
              </Alert>
            </div>
          ) : null}
        </Card>

        <Card>
          <h2 className="text-label-lg">مدارک</h2>
          <ul className="mt-md space-y-sm" data-testid="claim-documents">
            {documents.map((document) => (
              <li key={document.id} className="flex flex-wrap items-center justify-between gap-sm rounded-md border border-border-subtle px-md py-sm">
                <span className="text-body-sm">{CLAIM_DOCUMENT_KIND_FA[document.kind as ClaimDocumentKind] + ' · ' + document.mime}</span>
                <a
                  href={'/api/files/' + document.fileId}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-label-md text-text-brand underline underline-offset-4"
                  data-testid={'claim-document-' + document.kind}
                >
                  مشاهده فایل
                </a>
              </li>
            ))}
          </ul>
        </Card>

        {ownClaim ? (
          claim.status === 'SUBMITTED' ? <Alert tone="warning" title="درخواست خودتان را نمی‌توانید بررسی کنید." /> : null
        ) : (
          <CentreClaimDecisionForm claimId={claim.id} version={claim.version} open={claim.status === 'SUBMITTED'} />
        )}
      </div>
    </OpsShell>
  );
}
