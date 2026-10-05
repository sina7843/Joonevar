import { notFound as pageNotFound } from 'next/navigation';
import { isUuid } from '../../../../src/domain/ids.ts';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../../src/ui/shell.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { Identifier, type StatusTone } from '../../../../src/ui/status.tsx';
import { ageInDays } from '../../../../src/ui/queue.tsx';
import { Desk, DeskHead, DeskVersionNote, DocFrame, Panel, PrivateNote, CaseHistory, whenFa } from '../../../../src/ui/desk.tsx';
import { KeyValueList } from '../../../../src/ui/key-value.tsx';
import { db } from '../../../../src/db/client.ts';
import { eq } from 'drizzle-orm';
import { kycCases } from '../../../../src/db/schema/identity.ts';
import { findProfile } from '../../../../src/identity/account.ts';
import { KYC_STATUS_FA, type KycStatus } from '../../../../src/identity/kyc.ts';
import { formatCivilDateFa } from '../../../../src/domain/calendar.ts';
import { ReviewForm } from '../review-form.tsx';

export const dynamic = 'force-dynamic';

const TONE: Record<KycStatus, StatusTone> = {
  DRAFT: 'neutral',
  READY: 'neutral',
  UNDER_REVIEW: 'info',
  APPROVED: 'success',
  NEEDS_CORRECTION: 'warning',
  REJECTED: 'error',
};

/**
 * Case detail (§21.5) — DS P10 / K3 decision desk: record head → documents →
 * declared data → history, with the decision column at the end.
 *
 * The identity document is never inlined; it is fetched through the authorized
 * private-file route, which re-checks this operator's permission.
 */
export default async function AssocKycCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // A segment that cannot be an id is a missing page, not a server error.
  if (!isUuid(id)) pageNotFound();
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
  const status = record.status as KycStatus;
  const name = profile ? profile.firstName + ' ' + profile.lastName : '—';
  const open = status === 'UNDER_REVIEW';
  const age = ageInDays(record.submittedAt);

  return (
    <OpsShell actor={guard.actor} title="بررسی احراز هویت" pathname="/assoc/kyc" nav={ASSOC_NAV}>
      <DeskHead
        title={'احراز هویت · ' + name}
        status={{ tone: TONE[status], label: KYC_STATUS_FA[status], testId: 'case-status' }}
        meta={[
          profile ? (
            <>
              {'کد ملی '}
              <Identifier value={profile.nationalId} />
            </>
          ) : null,
          'ارسال: ' + (whenFa(record.submittedAt) ?? '—'),
          open && age !== null ? (
            <span className="hz-age">{age.toLocaleString('fa-IR') + ' روز در صف'}</span>
          ) : null,
          'نسخه ' + record.version.toLocaleString('fa-IR'),
        ]}
        owner={open ? 'ASSOCIATION' : status === 'NEEDS_CORRECTION' ? 'USER' : null}
      />

      <Desk
        decision={
          open ? (
            <>
              <ReviewForm caseId={record.id} version={record.version} />
              <DeskVersionNote version={record.version} />
            </>
          ) : (
            <Alert tone="info" title="این پرونده در انتظار بررسی نیست">
              وضعیت فعلی: {KYC_STATUS_FA[status]}
              {record.reasonFa ? ' — ' + record.reasonFa : ''}
            </Alert>
          )
        }
        decisionTitle={open ? 'تصمیم' : 'نتیجه'}
      >
        <Panel title="مدارک" aside={<PrivateNote />}>
          <div className="hz-desk__docs">
            <DocFrame
              href={record.documentFileId ? '/api/files/' + record.documentFileId : null}
              label="تصویر کارت ملی"
              linkLabel="مشاهده تصویر کارت ملی"
              testId="kyc-document-link"
              icon="identificationCard"
            />
          </div>
        </Panel>

        <Panel title="اطلاعات اعلام‌شده">
          <KeyValueList
            twoCol
            rows={[
              { key: 'نام و نام خانوادگی', value: profile ? name : null },
              { key: 'کد ملی', value: profile ? <Identifier value={profile.nationalId} /> : null },
              { key: 'تاریخ تولد', value: profile ? formatCivilDateFa(profile.birthDate) : null },
              { key: 'وضعیت', value: KYC_STATUS_FA[status] },
            ]}
          />
        </Panel>

        <Panel title="سابقه پرونده">
          <CaseHistory
            entries={[
              record.reviewedAt
                ? {
                    id: 'decision',
                    at: record.reviewedAt,
                    title: 'تصمیم انجمن',
                    whenFa: whenFa(record.reviewedAt),
                    status: open ? undefined : { tone: TONE[status], label: KYC_STATUS_FA[status] },
                    body: record.reasonFa ?? undefined,
                  }
                : null,
              record.submittedAt
                ? {
                    id: 'submit',
                    at: record.submittedAt,
                    title: 'ارسال درخواست، نسخه ' + record.version.toLocaleString('fa-IR'),
                    whenFa: whenFa(record.submittedAt),
                    current: open,
                  }
                : null,
            ]
              .filter((entry) => entry !== null)
              .sort((a, b) => b.at.getTime() - a.at.getTime())}
          />
        </Panel>
      </Desk>
    </OpsShell>
  );
}
