import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../../src/ui/shell.tsx';
import { CaseAge, Desk, DeskHead, DeskVersionNote, deskPosition, DocFrame, Panel, PrivateNote, CaseHistory } from '../../../../src/ui/desk.tsx';
import { keyStatus } from '../../../../src/ui/queue.tsx';
import { vetCaseKey } from '../../vet-case-key.ts';
import { KeyValueList } from '../../../../src/ui/key-value.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { Identifier } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { studentCaseForReview, studentOpenCaseIds } from '../../../../src/vets/student-application.ts';
import { DecideStudentCaseForm } from '../../../../src/vets/student-forms.tsx';
import { reviewStateFor } from '../../../../src/vets/review-workbench.ts';
import { ReviewPanel } from '../../../../src/vets/review-forms.tsx';
import { formatInstantFa } from '../../../../src/content/model.ts';

export const dynamic = 'force-dynamic';

/**
 * One student case: what was submitted, version by version; the private card
 * through the authorized file route; the same student number elsewhere; the
 * history; and, while it waits, the decision (Phase 2.5 PROMPT-004).
 */
export default async function AssocVetStudentCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/assoc/vet-students/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const [detail, review, queueIds] = await Promise.all([
    studentCaseForReview(db(), guard.actor, id),
    reviewStateFor(db(), guard.actor, id),
    studentOpenCaseIds(db(), guard.actor),
  ]);

  if (!detail) {
    return (
      <OpsShell actor={guard.actor} title="پرونده دانشجویی" pathname="/assoc/vet-students" nav={ASSOC_NAV}>
        <Alert tone="error" title="پرونده پیدا نشد" />
      </OpsShell>
    );
  }
  const latest = detail.submissions.at(-1);
  const waiting = detail.case.status === 'SUBMITTED' || detail.case.status === 'UNDER_REVIEW';
  // Age in the queue counts from the first submission.
  const firstSubmittedAt = detail.submissions[0] ? new Date(detail.submissions[0].submittedAt) : null;
  const duplicates = detail.duplicates.profiles.length + detail.duplicates.cases.length;

  return (
    <OpsShell actor={guard.actor} title="بررسی دانشجوی دامپزشکی" pathname="/assoc/vet-students" nav={ASSOC_NAV}>
      <DeskHead
        title={'دانشجوی دامپزشکی · ' + (detail.applicantNameFa ?? latest?.fields.displayNameFa ?? '—')}
        status={keyStatus(vetCaseKey(detail.case.status))}
        position={deskPosition(queueIds, detail.case.id, (caseId) => '/assoc/vet-students/' + caseId)}
        meta={[
          detail.applicantNationalId ? <Identifier label="کد ملی" value={detail.applicantNationalId} /> : null,
          waiting && firstSubmittedAt ? <CaseAge since={firstSubmittedAt} /> : null,
          'نسخه ' + detail.case.currentSubmissionVersion.toLocaleString('fa-IR'),
        ]}
        owner={waiting ? 'ASSOCIATION' : detail.case.status === 'NEEDS_CORRECTION' ? 'USER' : null}
        ownerExtra={review?.claimedByOther ? 'در دست ' + (review.claimerNameFa ?? 'بررسی‌کننده دیگر') : undefined}
      />
      <Desk
        decisionTitle={waiting ? 'تصمیم' : 'نتیجه'}
        decision={
          <>
            {review && waiting ? <ReviewPanel review={review} isSuperadmin={guard.actor.context === 'SUPERADMIN'} /> : null}
            {waiting && !review?.claimedByOther ? (
              <>
                <DecideStudentCaseForm caseId={detail.case.id} version={detail.case.version} />
                <DeskVersionNote version={detail.case.currentSubmissionVersion} />
              </>
            ) : waiting ? null : (
              <Alert tone="info" title="این پرونده در انتظار بررسی نیست">
                {'وضعیت فعلی: ' + detail.case.statusFa}
                {detail.case.reviewNoteFa ? ' — ' + detail.case.reviewNoteFa : ''}
              </Alert>
            )}
          </>
        }
      >
        {duplicates > 0 ? (
          <Alert tone="warning" title="همین شماره دانشجویی در حساب دیگری هم آمده است">
            {detail.duplicates.profiles.map((row) => (row.displayNameFa ?? '') + ' (' + (row.universityFa ?? '—') + ')').join('، ') ||
              detail.duplicates.cases.length.toLocaleString('fa-IR') + ' پرونده دیگر'}
          </Alert>
        ) : null}

        <Panel title="مدارک" aside={<PrivateNote />}>
          {detail.documents.length === 0 ? (
            <p className="text-body-sm text-text-secondary">مدرکی پیوست نشده است؛ مدرک در این مسیر اختیاری است.</p>
          ) : (
            <ul className="hz-desk__docs">
              {detail.documents.map((document) => (
                <li key={document.id}>
                  <DocFrame
                    href={'/api/files/' + document.fileId}
                    label={'کارت دانشجویی — نسخه ' + document.submissionVersion.toLocaleString('fa-IR')}
                    linkLabel={'کارت دانشجویی — نسخه ' + document.submissionVersion.toLocaleString('fa-IR')}
                    testId="student-document-link"
                    icon="student"
                  >
                  </DocFrame>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="اطلاعات اعلام‌شده">
          <KeyValueList
            twoCol
            rows={[
              { key: 'نام در حساب', value: detail.applicantNameFa },
              { key: 'کد ملی', value: detail.applicantNationalId ? <Identifier value={detail.applicantNationalId} /> : null },
              { key: 'نام اعلام‌شده', value: latest?.fields.displayNameFa },
              { key: 'شماره دانشجویی', value: latest?.fields.studentNumber ? <bdi dir="ltr">{latest.fields.studentNumber}</bdi> : null, testId: 'review-student-number' },
              { key: 'دانشگاه', value: latest?.fields.universityFa, testId: 'review-student-university' },
              { key: 'وضعیت', value: detail.case.statusFa, testId: 'student-case-status' },
            ]}
          />
        </Panel>

        {detail.submissions.length > 1 ? (
          <Panel title="نسخه‌های ارسال">
            <ol className="space-y-sm text-body-sm" data-testid="student-submissions">
              {detail.submissions.map((submission) => (
                <li key={submission.version}>
                  {'نسخه ' + submission.version.toLocaleString('fa-IR') + ' · ' + formatInstantFa(submission.submittedAt) + ' · '}
                  {submission.fields.universityFa + ' · '}
                  <bdi dir="ltr">{submission.fields.studentNumber}</bdi>
                </li>
              ))}
            </ol>
          </Panel>
        ) : null}

        <Panel title="سابقه پرونده">
          <div data-testid="student-case-history">
            <CaseHistory
              entries={[...detail.history].reverse().map((event, index) => ({
                id: String(index),
                title: event.toStatusFa ?? event.action,
                whenFa: formatInstantFa(new Date(event.at)),
                body: event.reasonFa ?? undefined,
                current: index === 0,
              }))}
            />
          </div>
        </Panel>
      </Desk>
    </OpsShell>
  );
}
