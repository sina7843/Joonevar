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
import { licenceCaseForReview, licenceOpenCaseIds } from '../../../../src/vets/licence-application.ts';
import { DecideLicenceCaseForm } from '../../../../src/vets/licence-forms.tsx';
import { reviewStateFor } from '../../../../src/vets/review-workbench.ts';
import { ReviewPanel } from '../../../../src/vets/review-forms.tsx';
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
  const [detail, review, queueIds] = await Promise.all([
    licenceCaseForReview(db(), guard.actor, id),
    reviewStateFor(db(), guard.actor, id),
    licenceOpenCaseIds(db(), guard.actor),
  ]);

  if (!detail) {
    return (
      <OpsShell actor={guard.actor} title="پرونده پروانه" pathname="/assoc/vet-licences" nav={ASSOC_NAV}>
        <Alert tone="error" title="پرونده پیدا نشد" />
      </OpsShell>
    );
  }
  const latest = detail.submissions.at(-1)?.fields;
  const waiting = detail.case.status === 'SUBMITTED' || detail.case.status === 'UNDER_REVIEW';
  // Age in the queue counts from the first submission.
  const firstSubmittedAt = detail.submissions[0] ? new Date(detail.submissions[0].submittedAt) : null;
  const duplicates = detail.duplicates.profiles.length + detail.duplicates.cases.length;

  const web = [latest?.websiteUrl, latest?.instagramHandle ? '@' + latest.instagramHandle : null].filter(Boolean).join(' · ');
  return (
    <OpsShell actor={guard.actor} title="بررسی پروانه فعالیت" pathname="/assoc/vet-licences" nav={ASSOC_NAV}>
      <DeskHead
        title={'پروانه فعالیت · ' + (detail.applicantNameFa ?? '—')}
        status={keyStatus(vetCaseKey(detail.case.status))}
        position={deskPosition(queueIds, detail.case.id, (caseId) => '/assoc/vet-licences/' + caseId)}
        meta={[
          latest?.licenceCode ? <Identifier label="کد پروانه" value={latest.licenceCode} /> : null,
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
                <p className="text-caption text-text-secondary">تأیید مدارک، پرونده را «در انتظار پرداخت» می‌کند و Tag دارای پروانه را فعال نمی‌کند.</p>
                <DecideLicenceCaseForm caseId={detail.case.id} version={detail.case.version} />
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
          <div data-testid="licence-duplicates">
            <Alert tone="warning" title="همین کد پروانه در حساب دیگری هم آمده است">
              {detail.duplicates.profiles.map((row) => row.displayNameFa).join('، ') || detail.duplicates.cases.length.toLocaleString('fa-IR') + ' پرونده دیگر'}
            </Alert>
          </div>
        ) : null}

        <Panel title="مدارک همه نسخه‌ها" aside={<PrivateNote />}>
          {detail.documents.length === 0 ? (
            <p className="text-body-sm text-text-secondary">—</p>
          ) : (
            <ul className="hz-desk__docs">
              {detail.documents.map((document) => {
                const label =
                  DOCUMENT_KIND_FA[document.kind as ProfessionalDocumentKind] +
                  (document.titleFa ? ' «' + document.titleFa + '»' : '') +
                  ' — نسخه ' +
                  document.submissionVersion.toLocaleString('fa-IR');
                return (
                  <li key={document.id}>
                    <DocFrame
                      href={'/api/files/' + document.fileId}
                      label={label}
                      linkLabel={label}
                      testId={'licence-document-link-' + document.kind}
                      meta={latest?.licenceFileId === document.fileId ? '(فایل پروانه نسخه جاری)' : undefined}
                      icon="stamp"
                    >
                    </DocFrame>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="متقاضی">
          <KeyValueList
            twoCol
            rows={[
              { key: 'نام در حساب', value: detail.applicantNameFa },
              { key: 'کد ملی', value: detail.applicantNationalId ? <Identifier value={detail.applicantNationalId} /> : null },
              {
                key: 'پروفایل',
                value: detail.profile ? detail.profile.displayNameFa + ' · کد نظام تأییدشده' : 'دکتر تازه؛ کد نظام هم در همین پرونده بررسی می‌شود',
                testId: 'licence-applicant-standing',
              },
              { key: 'Tag فعلی', value: detail.currentTagFa },
              { key: 'وضعیت', value: detail.case.statusFa, testId: 'licence-case-status' },
            ]}
          />
        </Panel>

        {latest ? (
          <Panel title={'نسخه جاری (' + detail.case.currentSubmissionVersion.toLocaleString('fa-IR') + ')'}>
            <KeyValueList
              twoCol
              rows={[
                { key: 'کد نظام', value: <bdi dir="ltr">{latest.councilCode}</bdi> },
                { key: 'عمومی یا متخصص', value: SCOPE_FA[latest.practiceScope] ?? '—' },
                { key: 'کد پروانه', value: <bdi dir="ltr">{latest.licenceCode}</bdi>, testId: 'review-licence-code' },
                { key: 'تاریخ پروانه', value: formatCivilDateFa(latest.licenceDate), testId: 'review-licence-date' },
                ...(latest.newDoctor ? [{ key: 'نام اعلام‌شده', value: latest.displayNameFa }] : []),
                { key: 'کلینیک', value: latest.clinicNameFa },
                { key: 'وب‌سایت و اینستاگرام', value: web ? <bdi dir="ltr">{web}</bdi> : null },
              ]}
            />
          </Panel>
        ) : null}

        {detail.submissions.length > 1 ? (
          <Panel title="نسخه‌ها">
            <ol className="space-y-sm text-body-sm" data-testid="licence-submissions">
              {detail.submissions.map((submission) => (
                <li key={submission.version}>
                  {'نسخه ' + submission.version.toLocaleString('fa-IR') + ' · ' + formatInstantFa(submission.submittedAt) + ' · کد پروانه '}
                  <bdi dir="ltr">{submission.fields.licenceCode}</bdi>
                  {' · تاریخ ' + formatCivilDateFa(submission.fields.licenceDate)}
                </li>
              ))}
            </ol>
          </Panel>
        ) : null}

        <Panel title="سابقه پرونده">
          <div data-testid="licence-case-history">
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
