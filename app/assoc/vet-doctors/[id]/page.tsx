import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { Identifier } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { doctorCaseForReview } from '../../../../src/vets/doctor-application.ts';
import { DecideDoctorCaseForm } from '../../../../src/vets/doctor-forms.tsx';
import { DOCUMENT_KIND_FA, type ProfessionalDocumentKind } from '../../../../src/vets/professional-profile-model.ts';
import { formatInstantFa } from '../../../../src/content/model.ts';

export const dynamic = 'force-dynamic';

const SCOPE_FA: Record<string, string> = { GENERAL: 'عمومی', SPECIALIST: 'متخصص' };

/**
 * One council-code case: the submitted versions, the private documents through the
 * authorized file route, the page being claimed, the same code elsewhere, the
 * history and, while it waits, the decision (Phase 2.5 PROMPT-005).
 */
export default async function AssocVetDoctorCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/assoc/vet-doctors/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const detail = await doctorCaseForReview(db(), guard.actor, id);

  if (!detail) {
    return (
      <OpsShell actor={guard.actor} title="پرونده دامپزشک" pathname="/assoc/vet-doctors" nav={ASSOC_NAV}>
        <Alert tone="error" title="پرونده پیدا نشد" />
      </OpsShell>
    );
  }
  const latest = detail.submissions.at(-1)?.fields;
  const waiting = detail.case.status === 'SUBMITTED' || detail.case.status === 'UNDER_REVIEW';
  const duplicates = detail.duplicates.profiles.length + detail.duplicates.cases.length;

  return (
    <OpsShell actor={guard.actor} title="بررسی کد نظام دامپزشک" pathname="/assoc/vet-doctors" nav={ASSOC_NAV}>
      <div className="space-y-lg">
        <Card>
          <h2 className="text-label-lg">اطلاعات متقاضی</h2>
          <dl className="mt-md grid grid-cols-2 gap-sm text-body-sm">
            <dt className="text-text-secondary">نام در حساب</dt>
            <dd>{detail.applicantNameFa ?? '—'}</dd>
            <dt className="text-text-secondary">کد ملی</dt>
            <dd>{detail.applicantNationalId ? <Identifier value={detail.applicantNationalId} /> : '—'}</dd>
            <dt className="text-text-secondary">نام اعلام‌شده</dt>
            <dd>{latest?.displayNameFa ?? '—'}</dd>
            <dt className="text-text-secondary">عمومی یا متخصص</dt>
            <dd data-testid="review-doctor-scope">{latest ? SCOPE_FA[latest.practiceScope] ?? '—' : '—'}</dd>
            <dt className="text-text-secondary">کد نظام</dt>
            <dd dir="ltr" data-testid="review-doctor-council-code">
              {latest?.councilCode ?? '—'}
            </dd>
            <dt className="text-text-secondary">وضعیت</dt>
            <dd data-testid="doctor-case-status">{detail.case.statusFa}</dd>
          </dl>
          {latest?.statementFa ? <p className="mt-md text-body-sm">{latest.statementFa}</p> : null}
        </Card>

        {detail.claimTarget ? (
          <Card>
            <h2 className="text-label-lg">پروفایل موردِ Claim</h2>
            <p className="mt-md text-body-sm" data-testid="doctor-claim-target">
              {detail.claimTarget.displayNameFa + (detail.claimTarget.cityNameFa ? ' · ' + detail.claimTarget.cityNameFa : '')}
              {detail.claimTarget.accountId ? ' — این پروفایل اکنون مالک دارد و Claim دیگر تأیید نمی‌شود.' : ' — بدون مالک'}
            </p>
            {detail.claimTarget.publicSlug ? (
              <a href={'/veterinarians/' + detail.claimTarget.publicSlug} target="_blank" rel="noreferrer" className="mt-xs inline-block text-label-md text-text-brand underline underline-offset-4">
                صفحه عمومی
              </a>
            ) : null}
          </Card>
        ) : null}

        {duplicates > 0 ? (
          <div data-testid="doctor-duplicates">
            <Alert tone="warning" title="همین کد نظام در جای دیگری هم آمده است">
              {detail.duplicates.profiles.map((row) => row.displayNameFa).join('، ') || detail.duplicates.cases.length.toLocaleString('fa-IR') + ' پرونده دیگر'}
            </Alert>
          </div>
        ) : null}

        <Card>
          <h2 className="text-label-lg">مدارک</h2>
          <ul className="mt-md space-y-2xs text-body-sm">
            {detail.documents.map((document) => (
              <li key={document.id}>
                <a
                  href={'/api/files/' + document.fileId}
                  target="_blank"
                  rel="noreferrer"
                  className="text-text-brand underline underline-offset-4"
                  data-testid={'doctor-document-link-' + document.kind}
                >
                  {DOCUMENT_KIND_FA[document.kind as ProfessionalDocumentKind] + ' — نسخه ' + document.submissionVersion.toLocaleString('fa-IR')}
                </a>
              </li>
            ))}
          </ul>
        </Card>

        {detail.submissions.length > 1 ? (
          <Card>
            <h2 className="text-label-lg">نسخه‌های ارسال</h2>
            <ol className="mt-md space-y-sm text-body-sm" data-testid="doctor-submissions">
              {detail.submissions.map((submission) => (
                <li key={submission.version}>
                  {'نسخه ' + submission.version.toLocaleString('fa-IR') + ' · ' + formatInstantFa(submission.submittedAt) + ' · ' + (SCOPE_FA[submission.fields.practiceScope] ?? '') + ' · '}
                  <span dir="ltr">{submission.fields.councilCode}</span>
                </li>
              ))}
            </ol>
          </Card>
        ) : null}

        <Card>
          <h2 className="text-label-lg">تاریخچه</h2>
          <ol className="mt-md space-y-sm text-body-sm" data-testid="doctor-case-history">
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
              <DecideDoctorCaseForm caseId={detail.case.id} version={detail.case.version} />
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
