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
import { doctorCaseForReview, doctorOpenCaseIds } from '../../../../src/vets/doctor-application.ts';
import { DecideDoctorCaseForm } from '../../../../src/vets/doctor-forms.tsx';
import { reviewStateFor } from '../../../../src/vets/review-workbench.ts';
import { ReviewPanel } from '../../../../src/vets/review-forms.tsx';
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
  const [detail, review, queueIds] = await Promise.all([
    doctorCaseForReview(db(), guard.actor, id),
    reviewStateFor(db(), guard.actor, id),
    doctorOpenCaseIds(db(), guard.actor),
  ]);

  if (!detail) {
    return (
      <OpsShell actor={guard.actor} title="پرونده دامپزشک" pathname="/assoc/vet-doctors" nav={ASSOC_NAV}>
        <Alert tone="error" title="پرونده پیدا نشد" />
      </OpsShell>
    );
  }
  const latest = detail.submissions.at(-1)?.fields;
  const waiting = detail.case.status === 'SUBMITTED' || detail.case.status === 'UNDER_REVIEW';
  // Age in the queue counts from the first submission.
  const firstSubmittedAt = detail.submissions[0] ? new Date(detail.submissions[0].submittedAt) : null;
  const duplicates = detail.duplicates.profiles.length + detail.duplicates.cases.length;

  return (
    <OpsShell actor={guard.actor} title="بررسی کد نظام دامپزشک" pathname="/assoc/vet-doctors" nav={ASSOC_NAV} headingInPage>
      <DeskHead level={1}
        title={'کد نظام دامپزشک · ' + (detail.applicantNameFa ?? latest?.displayNameFa ?? '—')}
        status={keyStatus(vetCaseKey(detail.case.status))}
        position={deskPosition(queueIds, detail.case.id, (caseId) => '/assoc/vet-doctors/' + caseId)}
        meta={[
          latest?.councilCode ? <Identifier label="کد نظام" value={latest.councilCode} /> : null,
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
                <DecideDoctorCaseForm caseId={detail.case.id} version={detail.case.version} />
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
          <div data-testid="doctor-duplicates">
            <Alert tone="warning" title="همین کد نظام در جای دیگری هم آمده است">
              {detail.duplicates.profiles.map((row) => row.displayNameFa).join('، ') || detail.duplicates.cases.length.toLocaleString('fa-IR') + ' پرونده دیگر'}
            </Alert>
          </div>
        ) : null}

        <Panel title="مدارک" aside={<PrivateNote />}>
          {detail.documents.length === 0 ? (
            <p className="text-body-sm text-text-secondary">—</p>
          ) : (
            <ul className="hz-desk__docs">
              {detail.documents.map((document) => (
                <li key={document.id}>
                  <DocFrame
                    href={'/api/files/' + document.fileId}
                    label={DOCUMENT_KIND_FA[document.kind as ProfessionalDocumentKind] + ' — نسخه ' + document.submissionVersion.toLocaleString('fa-IR')}
                    linkLabel={DOCUMENT_KIND_FA[document.kind as ProfessionalDocumentKind] + ' — نسخه ' + document.submissionVersion.toLocaleString('fa-IR')}
                    testId={'doctor-document-link-' + document.kind}
                    icon="identificationBadge"
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
              { key: 'نام اعلام‌شده', value: latest?.displayNameFa },
              { key: 'عمومی یا متخصص', value: latest ? SCOPE_FA[latest.practiceScope] ?? '—' : '—', testId: 'review-doctor-scope' },
              { key: 'کد نظام', value: latest?.councilCode ? <bdi dir="ltr">{latest.councilCode}</bdi> : '—', testId: 'review-doctor-council-code' },
              { key: 'وضعیت', value: detail.case.statusFa, testId: 'doctor-case-status' },
            ]}
          />
          {latest?.statementFa ? <p className="text-body-sm">{latest.statementFa}</p> : null}
        </Panel>

        {detail.claimTarget ? (
          <Panel title="پروفایل موردِ Claim">
            <p className="text-body-sm" data-testid="doctor-claim-target">
              {detail.claimTarget.displayNameFa + (detail.claimTarget.cityNameFa ? ' · ' + detail.claimTarget.cityNameFa : '')}
              {detail.claimTarget.accountId ? ' — این پروفایل اکنون مالک دارد و Claim دیگر تأیید نمی‌شود.' : ' — بدون مالک'}
            </p>
            {detail.claimTarget.publicSlug ? (
              <a href={'/veterinarians/' + detail.claimTarget.publicSlug} target="_blank" rel="noreferrer" className="hz-link hz-link--standalone">
                صفحه عمومی
              </a>
            ) : null}
          </Panel>
        ) : null}

        {detail.submissions.length > 1 ? (
          <Panel title="نسخه‌های ارسال">
            <ol className="space-y-sm text-body-sm" data-testid="doctor-submissions">
              {detail.submissions.map((submission) => (
                <li key={submission.version}>
                  {'نسخه ' + submission.version.toLocaleString('fa-IR') + ' · ' + formatInstantFa(submission.submittedAt) + ' · ' + (SCOPE_FA[submission.fields.practiceScope] ?? '') + ' · '}
                  <bdi dir="ltr">{submission.fields.councilCode}</bdi>
                </li>
              ))}
            </ol>
          </Panel>
        ) : null}

        <Panel title="سابقه پرونده">
          <div data-testid="doctor-case-history">
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
