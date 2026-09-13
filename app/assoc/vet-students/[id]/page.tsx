import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { Identifier } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { studentCaseForReview } from '../../../../src/vets/student-application.ts';
import { DecideStudentCaseForm } from '../../../../src/vets/student-forms.tsx';
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
  const detail = await studentCaseForReview(db(), guard.actor, id);

  if (!detail) {
    return (
      <OpsShell actor={guard.actor} title="پرونده دانشجویی" pathname="/assoc/vet-students" nav={ASSOC_NAV}>
        <Alert tone="error" title="پرونده پیدا نشد" />
      </OpsShell>
    );
  }
  const latest = detail.submissions.at(-1);
  const waiting = detail.case.status === 'SUBMITTED' || detail.case.status === 'UNDER_REVIEW';
  const duplicates = detail.duplicates.profiles.length + detail.duplicates.cases.length;

  return (
    <OpsShell actor={guard.actor} title="بررسی دانشجوی دامپزشکی" pathname="/assoc/vet-students" nav={ASSOC_NAV}>
      <div className="space-y-lg">
        <Card>
          <h2 className="text-label-lg">اطلاعات متقاضی</h2>
          <dl className="mt-md grid grid-cols-2 gap-sm text-body-sm">
            <dt className="text-text-secondary">نام در حساب</dt>
            <dd>{detail.applicantNameFa ?? '—'}</dd>
            <dt className="text-text-secondary">کد ملی</dt>
            <dd>{detail.applicantNationalId ? <Identifier value={detail.applicantNationalId} /> : '—'}</dd>
            <dt className="text-text-secondary">نام اعلام‌شده</dt>
            <dd>{latest?.fields.displayNameFa ?? '—'}</dd>
            <dt className="text-text-secondary">شماره دانشجویی</dt>
            <dd dir="ltr" data-testid="review-student-number">
              {latest?.fields.studentNumber ?? '—'}
            </dd>
            <dt className="text-text-secondary">دانشگاه</dt>
            <dd data-testid="review-student-university">{latest?.fields.universityFa ?? '—'}</dd>
            <dt className="text-text-secondary">وضعیت</dt>
            <dd data-testid="student-case-status">{detail.case.statusFa}</dd>
          </dl>
        </Card>

        {duplicates > 0 ? (
          <Alert tone="warning" title="همین شماره دانشجویی در حساب دیگری هم آمده است">
            {detail.duplicates.profiles.map((row) => (row.displayNameFa ?? '') + ' (' + (row.universityFa ?? '—') + ')').join('، ') ||
              detail.duplicates.cases.length.toLocaleString('fa-IR') + ' پرونده دیگر'}
          </Alert>
        ) : null}

        <Card>
          <h2 className="text-label-lg">مدارک</h2>
          {detail.documents.length === 0 ? (
            <p className="mt-md text-body-sm text-text-disabled">مدرکی پیوست نشده است؛ مدرک در این مسیر اختیاری است.</p>
          ) : (
            <ul className="mt-md space-y-2xs text-body-sm">
              {detail.documents.map((document) => (
                <li key={document.id}>
                  <a href={'/api/files/' + document.fileId} target="_blank" rel="noreferrer" className="text-text-brand underline underline-offset-4" data-testid="student-document-link">
                    {'کارت دانشجویی — نسخه ' + document.submissionVersion.toLocaleString('fa-IR')}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {detail.submissions.length > 1 ? (
          <Card>
            <h2 className="text-label-lg">نسخه‌های ارسال</h2>
            <ol className="mt-md space-y-sm text-body-sm" data-testid="student-submissions">
              {detail.submissions.map((submission) => (
                <li key={submission.version}>
                  {'نسخه ' + submission.version.toLocaleString('fa-IR') + ' · ' + formatInstantFa(submission.submittedAt) + ' · '}
                  {submission.fields.universityFa + ' · '}
                  <span dir="ltr">{submission.fields.studentNumber}</span>
                </li>
              ))}
            </ol>
          </Card>
        ) : null}

        <Card>
          <h2 className="text-label-lg">تاریخچه</h2>
          <ol className="mt-md space-y-sm text-body-sm" data-testid="student-case-history">
            {detail.history.map((event, index) => (
              <li key={index}>
                {formatInstantFa(new Date(event.at)) + ' · ' + (event.toStatusFa ?? event.action)}
                {event.reasonFa ? ' — ' + event.reasonFa : ''}
              </li>
            ))}
          </ol>
        </Card>

        {waiting ? (
          <Card>
            <h2 className="text-label-lg">ثبت نتیجه</h2>
            <div className="mt-lg">
              <DecideStudentCaseForm caseId={detail.case.id} version={detail.case.version} />
            </div>
          </Card>
        ) : (
          <Alert tone="info" title="این پرونده در انتظار بررسی نیست">
            {'وضعیت فعلی: ' + detail.case.statusFa}
            {detail.case.reviewNoteFa ? ' — ' + detail.case.reviewNoteFa : ''}
          </Alert>
        )}
      </div>
    </OpsShell>
  );
}
