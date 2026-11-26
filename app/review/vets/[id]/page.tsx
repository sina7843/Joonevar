import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, REVIEW_NAV } from '../../../../src/ui/shell.tsx';
import { CaseAge, CaseHistory, Desk, DeskHead, DeskVersionNote, DocFrame, Panel, PrivateNote, deskPosition } from '../../../../src/ui/desk.tsx';
import { KeyValueList } from '../../../../src/ui/key-value.tsx';
import { ActionOwner } from '../../../../src/ui/status.tsx';
import { keyStatus } from '../../../../src/ui/queue.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { db } from '../../../../src/db/client.ts';
import { vetApplicationForReview, vetApplicationQueue } from '../../../../src/vets/onboarding.ts';
import { APPLICATION_KIND_FA, DOCUMENT_KIND_FA } from '../../../../src/vets/onboarding-model.ts';
import { formatInstantFa } from '../../../../src/content/model.ts';
import { ReviewDecisionForm } from '../../../../src/vets/onboarding-forms.tsx';
import { caseHistory } from '../../case-history.ts';

export const dynamic = 'force-dynamic';

const HISTORY_FA: Record<string, string> = {
  VET_APPLICATION_SUBMITTED: 'ارسال درخواست',
  VET_APPLICATION_RESUBMITTED: 'ارسال اصلاحات',
  VET_APPLICATION_WITHDRAWN: 'انصراف درخواست‌دهنده',
  VET_APPLICATION_APPEALED: 'تجدیدنظر درخواست‌دهنده',
  VET_APPLICATION_DECIDED: 'تصمیم بررسی',
};

/** The recorded outcome, in the words the decision itself reported. */
const OUTCOME_FA: Record<string, string> = {
  APPROVED: 'درخواست تأیید شد.',
  REJECTED: 'درخواست رد شد.',
  NEEDS_CORRECTION: 'درخواست اصلاح ثبت شد.',
};

/** One veterinarian application, its documents and possible duplicates — Requirements-Phase-2 §8, §22 (PROMPT-007). */
export default async function ReviewVetApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/review/vets/' + encodeURIComponent(id));
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const data = await vetApplicationForReview(db(), guard.actor, id);
  if (data === null) notFound();
  const { application, documents, target, candidates } = data;
  const ownApplication = application.accountId === guard.actor.accountId;

  const open = application.status === 'SUBMITTED';
  // ponytail: position within the first 100 open cases (the queue's page ceiling).
  const [queue, history] = await Promise.all([
    open ? vetApplicationQueue(db(), guard.actor, { view: 'OPEN', page: 1, pageSize: 100 }) : null,
    caseHistory('VET_APPLICATION', application.id, HISTORY_FA),
  ]);
  const position = queue ? deskPosition(queue.items.map((item) => item.id), application.id, (other) => '/review/vets/' + other) : null;
  return (
    <OpsShell actor={guard.actor} title="بررسی درخواست دامپزشک" pathname="/review/vets" nav={REVIEW_NAV} headingInPage>
      <DeskHead level={1}
        title={APPLICATION_KIND_FA[application.kind] + ' · ' + application.displayNameFa}
        status={{
          ...keyStatus(application.status),
          testId: 'review-application-status',
        }}
        meta={[
          application.councilCode ? <bdi className="hz-id" dir="ltr">{application.councilCode}</bdi> : null,
          'ارسال: ' + formatInstantFa(application.submittedAt),
          open ? <CaseAge since={application.submittedAt} /> : null,
          'نسخه ' + application.version.toLocaleString('fa-IR'),
        ]}
        position={position}
      >
        {open ? <ActionOwner owner="SYSTEM" label="اپراتور بررسی" you /> : null}
        <Link href="/review/vets" className="hz-link hz-link--standalone">
          بازگشت به درخواست‌ها
        </Link>
      </DeskHead>

      <Desk
        decisionTitle={open && !ownApplication ? 'تصمیم' : 'نتیجه'}
        decision={
          !open ? (
            <div data-testid="review-decision-result">
              <Alert tone={application.status === 'REJECTED' ? 'warning' : 'info'} title={OUTCOME_FA[application.status] ?? 'این درخواست در انتظار بررسی نیست.'}>
                {application.reviewNoteFa ?? undefined}
              </Alert>
            </div>
          ) : ownApplication ? (
            <Alert tone="warning" title="درخواست خودتان را نمی‌توانید بررسی کنید." />
          ) : (
            <>
              <ReviewDecisionForm applicationId={application.id} version={application.version} />
              <DeskVersionNote version={application.version} />
            </>
          )
        }
      >
        {candidates.length > 0 ? (
          <div data-testid="review-duplicates">
            <Alert tone="warning" title="پروفایل مشابه یا کد نظام تکراری">
              <ul className="list-disc space-y-2xs ps-lg">
                {candidates.map((candidate) => (
                  <li key={candidate.id}>
                    {candidate.displayNameFa + (candidate.councilCode ? ' · ' + candidate.councilCode : '') + (candidate.accountId ? ' · دارای مالک' : ' · بدون مالک')}
                  </li>
                ))}
              </ul>
            </Alert>
          </div>
        ) : null}

        <Panel title="مدارک" aside={<PrivateNote />}>
          <ul className="hz-desk__docs" data-testid="review-documents">
            {documents.map((document) => (
              <li key={document.id}>
                <DocFrame
                  href={'/api/files/' + document.fileId}
                  label={DOCUMENT_KIND_FA[document.kind]}
                  linkLabel="مشاهده فایل"
                  meta={document.mime}
                  testId={'review-document-' + document.kind}
                />
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="اطلاعات اعلام‌شده">
          <KeyValueList
            twoCol
            rows={[
              { key: 'نام در پرونده هویتی حساب', value: data.applicantNameFa },
              { key: 'کد نظام دامپزشکی', value: application.councilCode ? <bdi dir="ltr">{application.councilCode}</bdi> : null },
              { key: 'تلفن', value: application.phone ? <bdi dir="ltr">{application.phone}</bdi> : null },
              { key: 'شهر', value: [data.provinceNameFa, data.cityNameFa].filter(Boolean).join(' · ') || null },
              { key: 'ارسال', value: formatInstantFa(application.submittedAt) },
            ].filter((row) => row.value)}
          />
          {application.statementFa ? <p className="whitespace-pre-line text-body-sm">{application.statementFa}</p> : null}
          {application.appealFa ? (
            <div data-testid="review-appeal">
              <Alert tone="info" title="تجدیدنظر درخواست‌دهنده">
                {application.appealFa}
              </Alert>
            </div>
          ) : null}
          {application.reviewNoteFa ? (
            <p className="text-caption text-text-secondary" data-testid="review-last-note">
              {'آخرین تصمیم: ' + application.reviewNoteFa + (application.reviewedAt ? ' · ' + formatInstantFa(application.reviewedAt) : '')}
            </p>
          ) : null}
        </Panel>

        {target ? (
          <Panel title="پروفایل بدون مالک مورد Claim">
            <p className="text-body-sm" data-testid="review-claim-target">
              {target.displayNameFa + (target.councilCode ? ' · کد نظام ثبت‌شده ' + target.councilCode : ' · کد نظامی ثبت نشده است')}
            </p>
            {target.publicSlug ? (
              <Link href={'/veterinarians/' + target.publicSlug} className="hz-link hz-link--standalone">
                صفحه عمومی پروفایل
              </Link>
            ) : null}
          </Panel>
        ) : null}

        <Panel title="سابقه پرونده">
          <CaseHistory entries={history} />
        </Panel>
      </Desk>
    </OpsShell>
  );
}
