import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, REVIEW_NAV } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { vetApplicationForReview } from '../../../../src/vets/onboarding.ts';
import { APPLICATION_KIND_FA, APPLICATION_STATUS_FA, DOCUMENT_KIND_FA } from '../../../../src/vets/onboarding-model.ts';
import { formatInstantFa } from '../../../../src/content/model.ts';
import { ReviewDecisionForm } from '../../../../src/vets/onboarding-forms.tsx';

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

/** One veterinarian application, its documents and possible duplicates — Requirements-Phase-2 §8, §22 (PROMPT-007). */
export default async function ReviewVetApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/review/vets/' + encodeURIComponent(id));
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const data = await vetApplicationForReview(db(), guard.actor, id);
  if (data === null) notFound();
  const { application, documents, target, candidates } = data;
  const ownApplication = application.accountId === guard.actor.accountId;

  return (
    <OpsShell actor={guard.actor} title="اپراتور بررسی" pathname="/review/vets" nav={REVIEW_NAV}>
      <div className="space-y-lg">
        <Link href="/review/vets" className="text-label-md text-text-brand underline underline-offset-4">
          بازگشت به درخواست‌ها
        </Link>

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-md">
            <div>
              <p className="text-caption text-text-secondary">{APPLICATION_KIND_FA[application.kind]}</p>
              <h1 className="text-h4">{application.displayNameFa}</h1>
            </div>
            <span data-testid="review-application-status">
              <StatusBadge tone={application.status === 'SUBMITTED' ? 'warning' : application.status === 'APPROVED' ? 'success' : 'neutral'}>
                {APPLICATION_STATUS_FA[application.status]}
              </StatusBadge>
            </span>
          </div>
          <dl className="mt-lg">
            <Fact label="نام در پرونده هویتی حساب" value={data.applicantNameFa} />
            <Fact label="کد نظام دامپزشکی" value={application.councilCode} ltr />
            <Fact label="تلفن" value={application.phone} ltr />
            <Fact label="شهر" value={[data.provinceNameFa, data.cityNameFa].filter(Boolean).join(' · ') || null} />
            <Fact label="ارسال" value={formatInstantFa(application.submittedAt)} />
          </dl>
          {application.statementFa ? <p className="mt-md whitespace-pre-line text-body-sm">{application.statementFa}</p> : null}
          {application.appealFa ? (
            <div className="mt-md" data-testid="review-appeal">
              <Alert tone="info" title="تجدیدنظر درخواست‌دهنده">
                {application.appealFa}
              </Alert>
            </div>
          ) : null}
          {application.reviewNoteFa ? (
            <p className="mt-md text-caption text-text-secondary" data-testid="review-last-note">
              {'آخرین تصمیم: ' + application.reviewNoteFa + (application.reviewedAt ? ' · ' + formatInstantFa(application.reviewedAt) : '')}
            </p>
          ) : null}
        </Card>

        {target ? (
          <Card>
            <h2 className="text-label-lg">پروفایل بدون مالک مورد Claim</h2>
            <p className="mt-sm text-body-sm" data-testid="review-claim-target">
              {target.displayNameFa + (target.councilCode ? ' · کد نظام ثبت‌شده ' + target.councilCode : ' · کد نظامی ثبت نشده است')}
            </p>
            {target.publicSlug ? (
              <Link href={'/veterinarians/' + target.publicSlug} className="mt-xs inline-block text-label-md text-text-brand underline underline-offset-4">
                صفحه عمومی پروفایل
              </Link>
            ) : null}
          </Card>
        ) : null}

        {candidates.length > 0 ? (
          <div data-testid="review-duplicates">
            <Alert tone="warning" title="پروفایل مشابه یا کد نظام تکراری">
              <ul className="list-disc space-y-2xs pr-lg">
                {candidates.map((candidate) => (
                  <li key={candidate.id}>
                    {candidate.displayNameFa + (candidate.councilCode ? ' · ' + candidate.councilCode : '') + (candidate.accountId ? ' · دارای مالک' : ' · بدون مالک')}
                  </li>
                ))}
              </ul>
            </Alert>
          </div>
        ) : null}

        <Card>
          <h2 className="text-label-lg">مدارک</h2>
          <ul className="mt-md space-y-sm" data-testid="review-documents">
            {documents.map((document) => (
              <li key={document.id} className="flex flex-wrap items-center justify-between gap-sm rounded-md border border-border-subtle px-md py-sm">
                <span className="text-body-sm">{DOCUMENT_KIND_FA[document.kind] + ' · ' + document.mime}</span>
                <a
                  href={'/api/files/' + document.fileId}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-label-md text-text-brand underline underline-offset-4"
                  data-testid={'review-document-' + document.kind}
                >
                  مشاهده فایل
                </a>
              </li>
            ))}
          </ul>
        </Card>

        {ownApplication ? (
          application.status === 'SUBMITTED' ? <Alert tone="warning" title="درخواست خودتان را نمی‌توانید بررسی کنید." /> : null
        ) : (
          <ReviewDecisionForm applicationId={application.id} version={application.version} open={application.status === 'SUBMITTED'} />
        )}
      </div>
    </OpsShell>
  );
}
