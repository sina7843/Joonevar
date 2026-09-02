import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { Identifier } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { eq } from 'drizzle-orm';
import { kycCases } from '../../../../src/db/schema/identity.ts';
import { findProfile } from '../../../../src/identity/account.ts';
import { KYC_STATUS_FA, type KycStatus } from '../../../../src/identity/kyc.ts';
import { formatCivilDateFa } from '../../../../src/domain/calendar.ts';
import { ReviewForm } from '../review-form.tsx';

export const dynamic = 'force-dynamic';

/**
 * Case detail (§21.5): data and permitted documents → history → action.
 *
 * The identity document is never inlined; it is fetched through the authorized
 * private-file route, which re-checks this operator's permission.
 */
export default async function AssocKycCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/assoc/kyc/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const [record] = await db().select().from(kycCases).where(eq(kycCases.id, id)).limit(1);
  if (!record) {
    return (
      <OpsShell actor={guard.actor} title="پرونده احراز هویت" pathname="/assoc/kyc" nav={ASSOC_NAV}>
        <Alert tone="error" title="پرونده پیدا نشد" />
      </OpsShell>
    );
  }

  const profile = await findProfile(db(), record.accountId);

  return (
    <OpsShell actor={guard.actor} title="بررسی احراز هویت" pathname="/assoc/kyc" nav={ASSOC_NAV}>
      <div className="space-y-lg">
        <Card>
          <h2 className="text-label-lg">اطلاعات متقاضی</h2>
          <dl className="mt-md grid grid-cols-2 gap-sm text-body-sm">
            <dt className="text-text-secondary">نام</dt>
            <dd>{profile ? profile.firstName + ' ' + profile.lastName : '—'}</dd>
            <dt className="text-text-secondary">کد ملی</dt>
            <dd>{profile ? <Identifier value={profile.nationalId} /> : '—'}</dd>
            <dt className="text-text-secondary">تاریخ تولد</dt>
            <dd>{profile ? formatCivilDateFa(profile.birthDate) : '—'}</dd>
            <dt className="text-text-secondary">وضعیت</dt>
            <dd data-testid="case-status">{KYC_STATUS_FA[record.status as KycStatus]}</dd>
          </dl>
        </Card>

        <Card>
          <h2 className="text-label-lg">مدرک هویتی</h2>
          {record.documentFileId ? (
            <p className="mt-md text-body-sm">
              <a
                href={'/api/files/' + record.documentFileId}
                className="text-text-brand underline underline-offset-4"
                data-testid="kyc-document-link"
                target="_blank"
                rel="noreferrer"
              >
                مشاهده تصویر کارت ملی
              </a>
            </p>
          ) : (
            <p className="mt-md text-body-sm text-text-disabled">مدرکی بارگذاری نشده است.</p>
          )}
        </Card>

        {record.status === 'UNDER_REVIEW' ? (
          <Card>
            <h2 className="text-label-lg">ثبت نتیجه</h2>
            <div className="mt-lg">
              <ReviewForm caseId={record.id} version={record.version} />
            </div>
          </Card>
        ) : (
          <Alert tone="info" title="این پرونده در انتظار بررسی نیست">
            وضعیت فعلی: {KYC_STATUS_FA[record.status as KycStatus]}
            {record.reasonFa ? ' — ' + record.reasonFa : ''}
          </Alert>
        )}
      </div>
    </OpsShell>
  );
}
