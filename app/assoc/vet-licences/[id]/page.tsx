import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { Identifier } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { licenceCaseForReview } from '../../../../src/vets/licence-application.ts';
import { DecideLicenceCaseForm } from '../../../../src/vets/licence-forms.tsx';
import { reviewStateFor } from '../../../../src/vets/review-workbench.ts';
import { DocumentPreview, ReviewPanel } from '../../../../src/vets/review-forms.tsx';
import { DOCUMENT_KIND_FA, type ProfessionalDocumentKind } from '../../../../src/vets/professional-profile-model.ts';
import { formatCivilDateFa } from '../../../../src/domain/calendar.ts';
import { formatInstantFa } from '../../../../src/content/model.ts';

export const dynamic = 'force-dynamic';

const SCOPE_FA: Record<string, string> = { GENERAL: 'عمومی', SPECIALIST: 'متخصص', NOT_DECLARED: 'اعلام‌نشده' };

/**
 * One licence case: every submitted version side by side with its files, the
 * applicant's verified standing, the same licence code elsewhere, the history
 * and, while it waits, the decision (Phase 2.5 PROMPT-006).
 */
export default async function AssocVetLicenceCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/assoc/vet-licences/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const [detail, review] = await Promise.all([licenceCaseForReview(db(), guard.actor, id), reviewStateFor(db(), guard.actor, id)]);

  if (!detail) {
    return (
      <OpsShell actor={guard.actor} title="پرونده پروانه" pathname="/assoc/vet-licences" nav={ASSOC_NAV}>
        <Alert tone="error" title="پرونده پیدا نشد" />
      </OpsShell>
    );
  }
  const latest = detail.submissions.at(-1)?.fields;
  const waiting = detail.case.status === 'SUBMITTED' || detail.case.status === 'UNDER_REVIEW';
  const duplicates = detail.duplicates.profiles.length + detail.duplicates.cases.length;

  return (
    <OpsShell actor={guard.actor} title="بررسی پروانه فعالیت" pathname="/assoc/vet-licences" nav={ASSOC_NAV}>
      <div className="space-y-lg">
        <Card>
          <h2 className="text-label-lg">متقاضی</h2>
          <dl className="mt-md grid grid-cols-2 gap-sm text-body-sm">
            <dt className="text-text-secondary">نام در حساب</dt>
            <dd>{detail.applicantNameFa ?? '—'}</dd>
            <dt className="text-text-secondary">کد ملی</dt>
            <dd>{detail.applicantNationalId ? <Identifier value={detail.applicantNationalId} /> : '—'}</dd>
            <dt className="text-text-secondary">پروفایل</dt>
            <dd data-testid="licence-applicant-standing">
              {detail.profile ? detail.profile.displayNameFa + ' · کد نظام تأییدشده' : 'دکتر تازه؛ کد نظام هم در همین پرونده بررسی می‌شود'}
            </dd>
            <dt className="text-text-secondary">Tag فعلی</dt>
            <dd>{detail.currentTagFa ?? '—'}</dd>
            <dt className="text-text-secondary">وضعیت</dt>
            <dd data-testid="licence-case-status">{detail.case.statusFa}</dd>
          </dl>
        </Card>

        {latest ? (
          <Card>
            <h2 className="text-label-lg">{'نسخه جاری (' + detail.case.currentSubmissionVersion.toLocaleString('fa-IR') + ')'}</h2>
            <dl className="mt-md grid grid-cols-2 gap-sm text-body-sm">
              <dt className="text-text-secondary">کد نظام</dt>
              <dd dir="ltr">{latest.councilCode}</dd>
              <dt className="text-text-secondary">عمومی یا متخصص</dt>
              <dd>{SCOPE_FA[latest.practiceScope] ?? '—'}</dd>
              <dt className="text-text-secondary">کد پروانه</dt>
              <dd dir="ltr" data-testid="review-licence-code">
                {latest.licenceCode}
              </dd>
              <dt className="text-text-secondary">تاریخ پروانه</dt>
              <dd data-testid="review-licence-date">{formatCivilDateFa(latest.licenceDate)}</dd>
              {latest.newDoctor ? (
                <>
                  <dt className="text-text-secondary">نام اعلام‌شده</dt>
                  <dd>{latest.displayNameFa}</dd>
                </>
              ) : null}
              <dt className="text-text-secondary">کلینیک</dt>
              <dd>{latest.clinicNameFa ?? '—'}</dd>
              <dt className="text-text-secondary">وب‌سایت و اینستاگرام</dt>
              <dd dir="ltr">{[latest.websiteUrl, latest.instagramHandle ? '@' + latest.instagramHandle : null].filter(Boolean).join(' · ') || '—'}</dd>
            </dl>
          </Card>
        ) : null}

        {duplicates > 0 ? (
          <div data-testid="licence-duplicates">
            <Alert tone="warning" title="همین کد پروانه در حساب دیگری هم آمده است">
              {detail.duplicates.profiles.map((row) => row.displayNameFa).join('، ') || detail.duplicates.cases.length.toLocaleString('fa-IR') + ' پرونده دیگر'}
            </Alert>
          </div>
        ) : null}

        <Card>
          <h2 className="text-label-lg">مدارک همه نسخه‌ها</h2>
          <ul className="mt-md space-y-2xs text-body-sm">
            {detail.documents.map((document) => (
              <li key={document.id}>
                <a
                  href={'/api/files/' + document.fileId}
                  target="_blank"
                  rel="noreferrer"
                  className="text-text-brand underline underline-offset-4"
                  data-testid={'licence-document-link-' + document.kind}
                >
                  {DOCUMENT_KIND_FA[document.kind as ProfessionalDocumentKind] + (document.titleFa ? ' «' + document.titleFa + '»' : '') + ' — نسخه ' + document.submissionVersion.toLocaleString('fa-IR')}
                </a>
                {latest?.licenceFileId === document.fileId ? <span className="text-caption text-text-secondary"> (فایل پروانه نسخه جاری)</span> : null}
                {document.submissionVersion === detail.case.currentSubmissionVersion ? (
                  <DocumentPreview fileId={document.fileId} labelFa={DOCUMENT_KIND_FA[document.kind as ProfessionalDocumentKind]} testId={'licence-document-preview-' + document.kind} />
                ) : null}
              </li>
            ))}
          </ul>
        </Card>

        {detail.submissions.length > 1 ? (
          <Card>
            <h2 className="text-label-lg">نسخه‌ها</h2>
            <ol className="mt-md space-y-sm text-body-sm" data-testid="licence-submissions">
              {detail.submissions.map((submission) => (
                <li key={submission.version}>
                  {'نسخه ' + submission.version.toLocaleString('fa-IR') + ' · ' + formatInstantFa(submission.submittedAt) + ' · کد پروانه '}
                  <span dir="ltr">{submission.fields.licenceCode}</span>
                  {' · تاریخ ' + formatCivilDateFa(submission.fields.licenceDate)}
                </li>
              ))}
            </ol>
          </Card>
        ) : null}

        <Card>
          <h2 className="text-label-lg">تاریخچه</h2>
          <ol className="mt-md space-y-sm text-body-sm" data-testid="licence-case-history">
            {detail.history.map((event, index) => (
              <li key={index}>
                {formatInstantFa(new Date(event.at)) + ' · ' + (event.toStatusFa ?? event.action)}
                {event.reasonFa ? ' — ' + event.reasonFa : ''}
              </li>
            ))}
          </ol>
        </Card>

        {review && waiting ? (
          <Card>
            <h2 className="text-label-lg">بررسی</h2>
            <div className="mt-md">
              <ReviewPanel review={review} isSuperadmin={guard.actor.context === 'SUPERADMIN'} />
            </div>
          </Card>
        ) : null}

        {waiting && !review?.claimedByOther ? (
          <Card>
            <h2 className="text-label-lg">ثبت نتیجه</h2>
            <p className="mt-xs text-caption text-text-secondary">تأیید مدارک، پرونده را «در انتظار پرداخت» می‌کند و Tag دارای پروانه را فعال نمی‌کند.</p>
            <div className="mt-lg">
              <DecideLicenceCaseForm caseId={detail.case.id} version={detail.case.version} />
            </div>
          </Card>
        ) : waiting ? null : (
          <Alert tone="info" title="این پرونده در انتظار بررسی نیست">
            {'وضعیت فعلی: ' + detail.case.statusFa}
            {detail.case.reviewNoteFa ? ' — ' + detail.case.reviewNoteFa : ''}
          </Alert>
        )}
      </div>
    </OpsShell>
  );
}
