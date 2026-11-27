import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../../src/ui/shell.tsx';
import { CaseAge, Desk, DeskHead, DeskVersionNote, deskPosition, Panel, CaseHistory } from '../../../../src/ui/desk.tsx';
import { keyStatus } from '../../../../src/ui/queue.tsx';
import { vetCaseKey } from '../../vet-case-key.ts';
import { KeyValueList } from '../../../../src/ui/key-value.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { db } from '../../../../src/db/client.ts';
import { trustedCaseForReview, trustedCaseQueue } from '../../../../src/vets/trusted-application.ts';
import { reviewStateFor } from '../../../../src/vets/review-workbench.ts';
import { ReviewPanel } from '../../../../src/vets/review-forms.tsx';
import { DecideTrustedCaseForm } from '../../../../src/vets/trusted-forms.tsx';
import { SuspendTrustedForm } from '../../../../src/vets/trusted-period-forms.tsx';
import { DECLARED_EQUIPMENT_FA } from '../../../../src/vets/professional-profile-model.ts';
import { formatInstantFa } from '../../../../src/content/model.ts';

export const dynamic = 'force-dynamic';

/**
 * One trusted application — Phase 2.5 §7.
 *
 * What was declared, in which version of the terms, and whether the two
 * conditions still hold right now. Equipment is shown as declared, never as
 * verified, because no evidence is required for it.
 */
export default async function AssocVetTrustedCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/assoc/vet-trusted/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const [detail, review, queueIds] = await Promise.all([
    trustedCaseForReview(db(), guard.actor, id),
    reviewStateFor(db(), guard.actor, id),
    trustedCaseQueue(db(), guard.actor, { view: 'OPEN' }).then((rows) => rows.map((row) => row.id)),
  ]);

  if (!detail) {
    return (
      <OpsShell actor={guard.actor} title="درخواست معتمد" pathname="/assoc/vet-trusted" nav={ASSOC_NAV}>
        <Alert tone="error" title="درخواست پیدا نشد" />
      </OpsShell>
    );
  }
  const waiting = detail.case.status === 'SUBMITTED' || detail.case.status === 'UNDER_REVIEW';
  // Age in the queue counts from the first submission.
  const firstSubmittedAt = detail.submissions[0] ? new Date(detail.submissions[0].submittedAt) : null;
  const current = detail.declarations.find((declaration) => declaration.submissionVersion === detail.case.currentSubmissionVersion);

  const standing = detail.case.status === 'ACTIVE_TRUSTED_VET' || detail.case.status === 'TRUSTED_APPROVED_AWAITING_PAYMENT';
  return (
    <OpsShell actor={guard.actor} title="بررسی درخواست دامپزشک معتمد" pathname="/assoc/vet-trusted" nav={ASSOC_NAV} headingInPage>
      <DeskHead level={1}
        title={'دامپزشک معتمد · ' + (detail.applicantNameFa ?? '—')}
        status={{ ...keyStatus(vetCaseKey(detail.case.status)), testId: 'trusted-case-status' }}
        position={deskPosition(queueIds, detail.case.id, (caseId) => '/assoc/vet-trusted/' + caseId)}
        meta={[waiting && firstSubmittedAt ? <CaseAge since={firstSubmittedAt} /> : null, 'نسخه ' + detail.case.currentSubmissionVersion.toLocaleString('fa-IR')]}
        owner={waiting ? 'ASSOCIATION' : detail.case.status === 'NEEDS_CORRECTION' ? 'USER' : null}
        ownerExtra={review?.claimedByOther ? 'در دست ' + (review.claimerNameFa ?? 'بررسی‌کننده دیگر') : undefined}
      />
      <Desk
        decisionTitle={waiting ? 'تصمیم' : standing ? 'تعلیق دسترسی معتمد' : 'نتیجه'}
        decision={
          <>
            {review && waiting ? <ReviewPanel review={review} isSuperadmin={guard.actor.context === 'SUPERADMIN'} /> : null}
            {waiting && !review?.claimedByOther ? (
              <>
                <p className="text-caption text-text-secondary">تأیید فقط پرداخت دوره معتمد را باز می‌کند؛ Tag معتمد با پرداخت تأییدشده سرور فعال می‌شود.</p>
                <DecideTrustedCaseForm caseId={detail.case.id} version={detail.case.version} />
                <DeskVersionNote version={detail.case.currentSubmissionVersion} />
              </>
            ) : null}
            {standing ? (
              <>
                <p className="text-caption text-text-secondary">
                  تعلیق، دسترسی معتمد را برمی‌دارد و Tag را به وضعیت پروانه برمی‌گرداند. هیچ کار انجام‌شده‌ای حذف نمی‌شود و پرداخت‌ها سر جای خود می‌مانند.
                </p>
                <SuspendTrustedForm accountId={detail.case.accountId} />
              </>
            ) : null}
            {waiting ? null : (
              <Alert tone="info" title="این درخواست در انتظار بررسی نیست">
                {'وضعیت فعلی: ' + detail.case.statusFa}
                {detail.case.reviewNoteFa ? ' — ' + detail.case.reviewNoteFa : ''}
              </Alert>
            )}
          </>
        }
      >
        <Panel title="شرایط، همین حالا">
          <ul className="space-y-xs text-body-sm" data-testid="trusted-eligibility-now">
            {detail.eligibilityNow.map((requirement) => (
              <li key={requirement.code} className="flex items-start gap-xs">
                <Icon
                  name={requirement.met ? 'checkCircle' : 'xCircle'}
                  size="sm"
                  label={requirement.met ? 'برقرار' : 'برقرار نیست'}
                  className={requirement.met ? 'text-status-success-text' : 'text-status-error-text'}
                />
                <span>
                  {requirement.labelFa}
                  {requirement.reasonFa ? ' — ' + requirement.reasonFa : ''}
                </span>
              </li>
            ))}
          </ul>
          {!detail.stillEligible ? (
            <div data-testid="trusted-no-longer-eligible">
              <Alert tone="warning" title="شرایط متقاضی دیگر برقرار نیست">
                تا وقتی پروانه یا عضویت برقرار نشود، تأیید ثبت نمی‌شود. درخواست اصلاح یا رد همچنان ممکن است.
              </Alert>
            </div>
          ) : null}
        </Panel>

        <Panel title="خوداظهاری نسخه جاری">
          {current ? (
            <div data-testid="trusted-declaration">
              <KeyValueList
                twoCol
                rows={[
                  { key: 'متقاضی', value: detail.applicantNameFa },
                  { key: 'نسخه تعهدنامه پذیرفته‌شده', value: <bdi dir="ltr">{current.termsVersion}</bdi> },
                  { key: 'نسخه متن خوداظهاری', value: <bdi dir="ltr">{current.declarationVersion}</bdi> },
                  { key: 'میکروچیپ‌ریدر', value: current.microchipReaderDeclared ? 'اعلام‌شده (مدرک لازم نیست)' : null },
                  { key: 'زمان اعلام', value: formatInstantFa(new Date(current.declaredAt)) },
                ]}
              />
            </div>
          ) : (
            <p className="text-body-sm text-text-secondary">خوداظهاری این نسخه ثبت نشده است.</p>
          )}
          <h3 className="text-label-sm">{DECLARED_EQUIPMENT_FA}</h3>
          <ul className="space-y-2xs text-body-sm" data-testid="trusted-declared-equipment">
            {detail.declaredEquipment.length === 0 ? (
              <li className="text-text-secondary">تجهیزی اعلام نشده است.</li>
            ) : (
              detail.declaredEquipment.map((item) => <li key={item.code}>{item.nameFa + ' · اعلام‌شده در ' + formatInstantFa(new Date(item.declaredAt))}</li>)
            )}
          </ul>
        </Panel>

        {detail.submissions.length > 1 ? (
          <Panel title="نسخه‌ها">
            <div data-testid="trusted-submissions">
              <CaseHistory
                entries={[...detail.submissions].reverse().map((submission, index) => ({
                  id: String(submission.version),
                  title: 'نسخه ' + submission.version.toLocaleString('fa-IR'),
                  whenFa: formatInstantFa(submission.submittedAt),
                  body: typeof submission.fields.statementFa === 'string' ? submission.fields.statementFa : undefined,
                  current: index === 0,
                }))}
              />
            </div>
          </Panel>
        ) : null}
      </Desk>
    </OpsShell>
  );
}
