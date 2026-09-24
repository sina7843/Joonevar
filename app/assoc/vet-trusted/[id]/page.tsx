import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { db } from '../../../../src/db/client.ts';
import { trustedCaseForReview } from '../../../../src/vets/trusted-application.ts';
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
  const [detail, review] = await Promise.all([trustedCaseForReview(db(), guard.actor, id), reviewStateFor(db(), guard.actor, id)]);

  if (!detail) {
    return (
      <OpsShell actor={guard.actor} title="درخواست معتمد" pathname="/assoc/vet-trusted" nav={ASSOC_NAV}>
        <Alert tone="error" title="درخواست پیدا نشد" />
      </OpsShell>
    );
  }
  const waiting = detail.case.status === 'SUBMITTED' || detail.case.status === 'UNDER_REVIEW';
  const current = detail.declarations.find((declaration) => declaration.submissionVersion === detail.case.currentSubmissionVersion);

  return (
    <OpsShell actor={guard.actor} title="بررسی درخواست دامپزشک معتمد" pathname="/assoc/vet-trusted" nav={ASSOC_NAV}>
      <div className="space-y-lg">
        <Card>
          <h2 className="text-label-lg">متقاضی</h2>
          <dl className="mt-md grid grid-cols-2 gap-sm text-body-sm">
            <dt className="text-text-secondary">نام</dt>
            <dd>{detail.applicantNameFa ?? '—'}</dd>
            <dt className="text-text-secondary">وضعیت</dt>
            <dd data-testid="trusted-case-status">{detail.case.statusFa}</dd>
          </dl>
        </Card>

        <Card>
          <h2 className="text-label-lg">شرایط، همین حالا</h2>
          <ul className="mt-md space-y-2xs text-body-sm" data-testid="trusted-eligibility-now">
            {detail.eligibilityNow.map((requirement) => (
              <li key={requirement.code}>
                {(requirement.met ? '✓ ' : '✗ ') + requirement.labelFa}
                {requirement.reasonFa ? ' — ' + requirement.reasonFa : ''}
              </li>
            ))}
          </ul>
          {!detail.stillEligible ? (
            <div className="mt-md" data-testid="trusted-no-longer-eligible">
              <Alert tone="warning" title="شرایط متقاضی دیگر برقرار نیست">
                تا وقتی پروانه یا عضویت برقرار نشود، تأیید ثبت نمی‌شود. درخواست اصلاح یا رد همچنان ممکن است.
              </Alert>
            </div>
          ) : null}
        </Card>

        <Card>
          <h2 className="text-label-lg">خوداظهاری نسخه جاری</h2>
          {current ? (
            <dl className="mt-md grid grid-cols-2 gap-sm text-body-sm" data-testid="trusted-declaration">
              <dt className="text-text-secondary">نسخه تعهدنامه پذیرفته‌شده</dt>
              <dd dir="ltr">{current.termsVersion}</dd>
              <dt className="text-text-secondary">نسخه متن خوداظهاری</dt>
              <dd dir="ltr">{current.declarationVersion}</dd>
              <dt className="text-text-secondary">میکروچیپ‌ریدر</dt>
              <dd>{current.microchipReaderDeclared ? 'اعلام‌شده (مدرک لازم نیست)' : '—'}</dd>
              <dt className="text-text-secondary">زمان اعلام</dt>
              <dd>{formatInstantFa(new Date(current.declaredAt))}</dd>
            </dl>
          ) : (
            <p className="mt-md text-body-sm text-text-disabled">خوداظهاری این نسخه ثبت نشده است.</p>
          )}
          <h3 className="mt-lg text-label-md">{DECLARED_EQUIPMENT_FA}</h3>
          <ul className="mt-xs space-y-2xs text-body-sm" data-testid="trusted-declared-equipment">
            {detail.declaredEquipment.length === 0 ? (
              <li className="text-text-disabled">تجهیزی اعلام نشده است.</li>
            ) : (
              detail.declaredEquipment.map((item) => <li key={item.code}>{item.nameFa + ' · اعلام‌شده در ' + formatInstantFa(new Date(item.declaredAt))}</li>)
            )}
          </ul>
        </Card>

        {detail.submissions.length > 1 ? (
          <Card>
            <h2 className="text-label-lg">نسخه‌ها</h2>
            <ol className="mt-md space-y-sm text-body-sm" data-testid="trusted-submissions">
              {detail.submissions.map((submission) => (
                <li key={submission.version}>
                  {'نسخه ' + submission.version.toLocaleString('fa-IR') + ' · ' + formatInstantFa(submission.submittedAt)}
                  {typeof submission.fields.statementFa === 'string' ? ' — ' + submission.fields.statementFa : ''}
                </li>
              ))}
            </ol>
          </Card>
        ) : null}

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
            <p className="mt-xs text-caption text-text-secondary">تأیید فقط پرداخت دوره معتمد را باز می‌کند؛ Tag معتمد با پرداخت تأییدشده سرور فعال می‌شود.</p>
            <div className="mt-lg">
              <DecideTrustedCaseForm caseId={detail.case.id} version={detail.case.version} />
            </div>
          </Card>
        ) : null}

        {detail.case.status === 'ACTIVE_TRUSTED_VET' || detail.case.status === 'TRUSTED_APPROVED_AWAITING_PAYMENT' ? (
          <Card>
            <h2 className="text-label-lg">تعلیق دسترسی معتمد</h2>
            <p className="mt-xs text-caption text-text-secondary">
              تعلیق، دسترسی معتمد را برمی‌دارد و Tag را به وضعیت پروانه برمی‌گرداند. هیچ کار انجام‌شده‌ای حذف نمی‌شود و پرداخت‌ها سر جای خود می‌مانند.
            </p>
            <div className="mt-lg">
              <SuspendTrustedForm accountId={detail.case.accountId} />
            </div>
          </Card>
        ) : null}

        {waiting ? null : (
          <Alert tone="info" title="این درخواست در انتظار بررسی نیست">
            {'وضعیت فعلی: ' + detail.case.statusFa}
            {detail.case.reviewNoteFa ? ' — ' + detail.case.reviewNoteFa : ''}
          </Alert>
        )}
      </div>
    </OpsShell>
  );
}
