import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../../src/ui/access-denied.tsx';
import { OpsShell, REVIEW_NAV } from '../../../../../src/ui/shell.tsx';
import { DeskHead, DocFrame, Panel, PrivateNote } from '../../../../../src/ui/desk.tsx';
import { KeyValueList } from '../../../../../src/ui/key-value.tsx';
import { ageInDays, keyStatus } from '../../../../../src/ui/queue.tsx';
import { Alert } from '../../../../../src/ui/alert.tsx';
import { db } from '../../../../../src/db/client.ts';
import { centreClaimForReview } from '../../../../../src/centres/claims.ts';
import { CLAIM_DOCUMENT_KIND_FA, type ClaimDocumentKind } from '../../../../../src/suggestions/model.ts';
import { formatInstantFa } from '../../../../../src/content/model.ts';
import { CentreClaimDecisionForm } from '../../../../../src/suggestions/forms.tsx';

export const dynamic = 'force-dynamic';

/** One centre claim, its documents and the centre it is about — §10, §22 (PROMPT-009). */
export default async function ReviewCentreClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/review/centres/claims/' + encodeURIComponent(id));
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const data = await centreClaimForReview(db(), guard.actor, id);
  if (data === null) notFound();
  const { claim, documents } = data;
  const ownClaim = claim.accountId === guard.actor.accountId;

  const open = claim.status === 'SUBMITTED';
  return (
    <OpsShell actor={guard.actor} title="بررسی Claim مرکز" pathname="/review/centres/claims" nav={REVIEW_NAV}>
      <DeskHead
        title={'Claim مرکز · ' + claim.claimantNameFa}
        status={{
          ...keyStatus(claim.status),
          testId: 'claim-review-status',
        }}
        meta={[
          'مرکز: ' + data.centreNameFa,
          'ارسال: ' + formatInstantFa(claim.submittedAt),
          open && ageInDays(claim.submittedAt) !== null ? (
            <span className="hz-age">{ageInDays(claim.submittedAt)!.toLocaleString('fa-IR') + ' روز در صف'}</span>
          ) : null,
        ]}
        owner={open ? 'SYSTEM' : null}
        ownerExtra={open ? 'اپراتور بررسی' : undefined}
      >
        <p className="flex flex-wrap gap-lg">
          <Link href="/review/centres/claims" className="hz-link hz-link--standalone">
            بازگشت به درخواست‌ها
          </Link>
          {data.centreSlug ? (
            <Link href={'/centers/' + data.centreSlug} className="hz-link hz-link--standalone" data-testid="claim-centre-link">
              صفحه عمومی مرکز
            </Link>
          ) : null}
        </p>
      </DeskHead>

      <div className="hz-desk">
        <div className="min-w-0 space-y-lg">
          {data.centreOwned ? (
            <div data-testid="claim-centre-owned">
              <Alert tone="warning" title="این مرکز هم‌اکنون مدیر دارد">
                تأیید این درخواست دیگر ممکن نیست.
              </Alert>
            </div>
          ) : null}

          <Panel title="مدارک" aside={<PrivateNote />}>
            <ul className="hz-desk__docs" data-testid="claim-documents">
              {documents.map((document) => (
                <li key={document.id}>
                  <DocFrame
                    href={'/api/files/' + document.fileId}
                    label={CLAIM_DOCUMENT_KIND_FA[document.kind as ClaimDocumentKind]}
                    linkLabel="مشاهده فایل"
                    meta={document.mime}
                    testId={'claim-document-' + document.kind}
                  />
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="اطلاعات اعلام‌شده">
            <KeyValueList
              twoCol
              rows={[
                { key: 'سمت در مرکز', value: claim.roleFa },
                { key: 'نام روی پرونده هویتی حساب', value: data.accountNameFa },
                { key: 'تلفن', value: claim.phone ? <bdi dir="ltr">{claim.phone}</bdi> : null },
                { key: 'ارسال', value: formatInstantFa(claim.submittedAt) },
              ].filter((row) => row.value)}
            />
            {claim.statementFa ? <p className="whitespace-pre-line text-body-sm">{claim.statementFa}</p> : null}
            {claim.appealFa ? (
              <div data-testid="claim-appeal">
                <Alert tone="info" title="تجدیدنظر درخواست‌دهنده">
                  {claim.appealFa}
                </Alert>
              </div>
            ) : null}
            {claim.reviewNoteFa ? (
              <p className="text-caption text-text-secondary" data-testid="claim-last-note">
                {'آخرین تصمیم: ' + claim.reviewNoteFa + (claim.reviewedAt ? ' · ' + formatInstantFa(claim.reviewedAt) : '')}
              </p>
            ) : null}
          </Panel>
        </div>
        <div className="hz-desk__decision">
          {ownClaim ? (
            claim.status === 'SUBMITTED' ? <Alert tone="warning" title="درخواست خودتان را نمی‌توانید بررسی کنید." /> : null
          ) : (
            <CentreClaimDecisionForm claimId={claim.id} version={claim.version} open={claim.status === 'SUBMITTED'} />
          )}
        </div>
      </div>
    </OpsShell>
  );
}
