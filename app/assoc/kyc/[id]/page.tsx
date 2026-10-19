import { notFound as pageNotFound } from 'next/navigation';
import { isUuid } from '../../../../src/domain/ids.ts';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../../src/ui/shell.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { Identifier } from '../../../../src/ui/status.tsx';
import { CaseAge, CaseHistory, Desk, DeskHead, DeskVersionNote, DocFrame, Panel, PrivateNote, deskPosition, whenFa } from '../../../../src/ui/desk.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';
import { KeyValueList } from '../../../../src/ui/key-value.tsx';
import { db } from '../../../../src/db/client.ts';
import { and, eq } from 'drizzle-orm';
import { kycCases } from '../../../../src/db/schema/identity.ts';
import { accountRoles, accounts } from '../../../../src/db/schema/core.ts';
import { findProfile, findResidence } from '../../../../src/identity/account.ts';
import { kycQueueIds, type KycStatus } from '../../../../src/identity/kyc.ts';
import { isValidNationalId } from '../../../../src/domain/identity.ts';
import { auditSteps, stepMeta } from '../../audit-history.ts';
import { formatCivilDateFa } from '../../../../src/domain/calendar.ts';
import { ReviewForm } from '../review-form.tsx';

export const dynamic = 'force-dynamic';

/** KYC values whose dictionary key has another name (dictionary READY is a payout state). */
const kycKey = (status: KycStatus): string => (status === 'READY' ? 'READY_TO_SUBMIT' : status);

const OPTIONAL_EMPTY = '— اختیاری؛ وارد نشده';
/** Roles that describe the applicant's account; operator roles are not part of it. */
const ROLE_FA: Partial<Record<string, string>> = { BREEDER: 'پرورش‌دهنده', TRUSTED_VET: 'دامپزشک معتمد' };

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

  const [profile, residence, accountRows, roleRows, steps, queueIds] = await Promise.all([
    findProfile(db(), record.accountId),
    findResidence(db(), record.accountId),
    db().select({ mobile: accounts.mobile }).from(accounts).where(eq(accounts.id, record.accountId)).limit(1),
    db()
      .select({ role: accountRoles.role })
      .from(accountRoles)
      .where(and(eq(accountRoles.accountId, record.accountId), eq(accountRoles.status, 'ACTIVE'))),
    auditSteps('KYC_CASE', record.id),
    kycQueueIds(db(), guard.actor),
  ]);
  const mobile = accountRows[0]?.mobile ?? null;
  const status = record.status as KycStatus;
  const name = profile ? profile.firstName + ' ' + profile.lastName : '—';
  const open = status === 'UNDER_REVIEW';
  // Submissions and decisions from the audit trail: one row per version, newest first.
  const history = steps.filter((step) => step.action === 'KYC_SUBMITTED' || step.action === 'KYC_REVIEWED');
  const submissions = history.filter((step) => step.action === 'KYC_SUBMITTED');
  const firstSubmittedAt = submissions.at(-1)?.at ?? record.submittedAt;
  const resubmitted = submissions.length > 1;
  const accountType = ['کاربر', ...roleRows.map((row) => ROLE_FA[row.role]).filter(Boolean)].join('، ');
  const nationalIdValid = profile ? isValidNationalId(profile.nationalId) : false;

  return (
    <OpsShell actor={guard.actor} title="بررسی احراز هویت" pathname="/assoc/kyc" nav={ASSOC_NAV}>
      <DeskHead
        title={'احراز هویت · ' + name}
        status={{ key: kycKey(status), testId: 'case-status' }}
        position={deskPosition(queueIds, record.id, (caseId) => '/assoc/kyc/' + caseId)}
        meta={[
          profile ? (
            <>
              {'کد ملی '}
              <Identifier value={profile.nationalId} />
            </>
          ) : null,
          mobile ? (
            <>
              {'موبایل '}
              <Identifier value={mobile} />
            </>
          ) : null,
          (resubmitted ? 'ارسال دوباره: ' : 'ارسال: ') + (whenFa(record.submittedAt) ?? '—'),
          open && firstSubmittedAt ? <CaseAge since={firstSubmittedAt} /> : null,
          'نسخه ' + record.version.toLocaleString('fa-IR'),
        ]}
        owner={open ? 'ASSOCIATION' : status === 'NEEDS_CORRECTION' ? 'USER' : null}
      >
        {/* A closed case shows its final outcome in the head, with no decision panel (P10 › States). */}
        {!open ? (
          <p className="text-body-sm" data-testid="case-final-reason">
            {'این پرونده در انتظار بررسی نیست' + (record.reasonFa ? '؛ دلیل: ' + record.reasonFa : '.')}
          </p>
        ) : null}
      </DeskHead>

      <Desk
        decision={
          open ? (
            <>
              <ReviewForm caseId={record.id} version={record.version} />
              <DeskVersionNote version={record.version} />
            </>
          ) : undefined
        }
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

        <Panel
          title="اطلاعات اعلام‌شده"
          aside={
            profile ? (
              <span className={nationalIdValid ? 'text-status-success-text' : 'text-status-error-text'}>
                <Icon name={nationalIdValid ? 'check' : 'warningCircle'} size="xs" />{' '}
                {nationalIdValid ? 'رقم کنترل کد ملی معتبر است' : 'رقم کنترل کد ملی معتبر نیست'}
              </span>
            ) : null
          }
        >
          <KeyValueList
            twoCol
            rows={[
              { key: 'نام و نام خانوادگی', value: profile ? name : null },
              { key: 'کد ملی', value: profile ? <Identifier value={profile.nationalId} /> : null },
              { key: 'تاریخ تولد', value: profile ? formatCivilDateFa(profile.birthDate) : null },
              { key: 'موبایل', value: mobile ? <Identifier value={mobile} /> : null },
              { key: 'شهر', value: [residence?.province, residence?.city].filter(Boolean).join('، '), empty: OPTIONAL_EMPTY },
              { key: 'نوع حساب', value: accountType },
              { key: 'نخستین ارسال', value: whenFa(firstSubmittedAt, false) },
              { key: 'نشانی سکونت', value: residence?.address ?? null, empty: OPTIONAL_EMPTY },
            ]}
          />
        </Panel>

        <Panel title="سابقه تصمیم‌ها" aside="جدیدترین بالا، یک ردیف برای هر نسخه">
          <CaseHistory
            entries={history.map((step, index) => {
              const submit = step.action === 'KYC_SUBMITTED';
              const first = submit && step === submissions.at(-1);
              return {
                id: step.id,
                title:
                  (submit ? (first ? 'ارسال درخواست' : 'ارسال دوباره') : 'تصمیم انجمن') +
                  (step.version !== null ? '، نسخه ' + step.version.toLocaleString('fa-IR') : ''),
                whenFa: stepMeta(step),
                status: step.status ? kycKey(step.status as KycStatus) : undefined,
                body: step.reason ?? undefined,
                current: open && index === 0,
              };
            })}
          />
        </Panel>
      </Desk>
    </OpsShell>
  );
}
