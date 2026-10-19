import { notFound as pageNotFound } from 'next/navigation';
import { isUuid } from '../../../../src/domain/ids.ts';
import { eq } from 'drizzle-orm';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../src/ui/access-denied.tsx';
import { notFound as notFoundError } from '../../../../src/domain/errors.ts';
import { ASSOC_NAV, OpsShell } from '../../../../src/ui/shell.tsx';
import { CaseAge, CaseHistory, Desk, DeskHead, DeskVersionNote, Panel, deskPosition, whenFa } from '../../../../src/ui/desk.tsx';
import { KeyValueList } from '../../../../src/ui/key-value.tsx';
import { keyStatus } from '../../../../src/ui/queue.tsx';
import { auditSteps, historyFromAudit } from '../../audit-history.ts';
import { Alert } from '../../../../src/ui/alert.tsx';
import { db } from '../../../../src/db/client.ts';
import { profiles } from '../../../../src/db/schema/identity.ts';
import { breedsOfKennel, findKennel, kennelQueue, KENNEL_STATUS_FA } from '../../../../src/kennels/service.ts';
import { formatCivilDateFa } from '../../../../src/domain/calendar.ts';
import { KennelReviewForm } from '../review-form.tsx';

export const dynamic = 'force-dynamic';

const HISTORY_FA: Record<string, string> = {
  KENNEL_STARTED: 'شروع پرونده',
  KENNEL_PAYMENT_VERIFIED: 'پرداخت تأیید شد',
  KENNEL_SUBMITTED: 'ارسال برای بررسی',
  KENNEL_REVIEWED: 'تصمیم انجمن',
};

/**
 * One kennel at the association — §15.2, §21.5.
 *
 * The reviewer sees the data the owner submitted and nothing more; no extra
 * breeder document is requested here, because none is required (§15.1).
 */
export default async function AssocKennelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // A segment that cannot be an id is a missing page, not a server error.
  if (!isUuid(id)) pageNotFound();
  const guard = await guardRoute('/assoc/kennels/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const kennel = await findKennel(db(), id);
  if (!kennel) return <RecordNotFound error={notFoundError('پرونده کنل پیدا نشد.')} />;

  const [breeds, owner, steps, queue] = await Promise.all([
    breedsOfKennel(db(), kennel.id),
    db().select().from(profiles).where(eq(profiles.accountId, kennel.ownerAccountId)).limit(1),
    auditSteps('KENNEL', kennel.id),
    kennelQueue(db(), guard.actor),
  ]);

  const open = kennel.status === 'UNDER_REVIEW';
  // Age counts from the first submission (a corrected case keeps its place in time).
  const firstSubmittedAt = steps.filter((step) => step.action === 'KENNEL_SUBMITTED').at(-1)?.at ?? kennel.submittedAt;
  return (
    <OpsShell actor={guard.actor} title="بررسی کنل" pathname={'/assoc/kennels/' + id} nav={ASSOC_NAV}>
      <DeskHead
        title={'کنل · ' + (kennel.nameFa ?? 'کنل بدون نام')}
        status={{ ...keyStatus(kennel.status), testId: 'assoc-kennel-status' }}
        position={deskPosition(
          queue.map((row) => row.id),
          kennel.id,
          (kennelId) => '/assoc/kennels/' + kennelId,
        )}
        meta={[
          'مالک: ' + (owner[0] ? owner[0].firstName + ' ' + owner[0].lastName : '—'),
          'ارسال: ' + (whenFa(kennel.submittedAt) ?? '—'),
          open && firstSubmittedAt ? <CaseAge since={firstSubmittedAt} /> : null,
          'نسخه ' + kennel.version.toLocaleString('fa-IR'),
        ]}
        owner={open ? 'ASSOCIATION' : kennel.status === 'NEEDS_CORRECTION' ? 'USER' : null}
      />
      <Desk
        decisionTitle={open ? 'تصمیم انجمن' : 'نتیجه'}
        decision={
          open ? (
            <>
              <p className="text-caption text-text-secondary">
                تأیید این پرونده، نقش پرورش‌دهنده همین حساب را فعال می‌کند. هیچ پرداخت جداگانه‌ای برای فعال‌سازی
                نقش وجود ندارد.
              </p>
              <KennelReviewForm kennelId={kennel.id} version={kennel.version} />
              <DeskVersionNote version={kennel.version} />
            </>
          ) : (
            <Alert tone="info" title="این پرونده در انتظار بررسی نیست">
              وضعیت فعلی: {KENNEL_STATUS_FA[kennel.status]}
              {kennel.reasonFa ? ' — ' + kennel.reasonFa : ''}
            </Alert>
          )
        }
      >
        <Panel title="اطلاعات اعلام‌شده">
          <div data-testid="assoc-kennel-detail">
            <KeyValueList
              twoCol
              rows={[
                { key: 'نام فارسی', value: kennel.nameFa },
                { key: 'نام لاتین', value: kennel.nameEn ? <bdi dir="ltr">{kennel.nameEn}</bdi> : null },
                { key: 'تلفن', value: kennel.phone ? <bdi className="hz-id" dir="ltr">{kennel.phone}</bdi> : null },
                {
                  key: 'نشانی کنل',
                  value:
                    [kennel.provinceFa, kennel.cityFa].filter(Boolean).join('، ') +
                    (kennel.addressFa ? ' — ' + kennel.addressFa : ''),
                },
                {
                  key: 'زمان ارسال',
                  value: kennel.submittedAt ? formatCivilDateFa(kennel.submittedAt.toISOString().slice(0, 10)) : null,
                },
              ]}
            />
          </div>
        </Panel>
        <Panel title="نژادها" count={breeds.length.toLocaleString('fa-IR')}>
          <p className="text-body-sm" data-testid="assoc-kennel-breeds">
            {breeds.map((row) => row.nameFa).join('، ') || '—'}
          </p>
        </Panel>
        <Panel title="سابقه پرونده">
          <CaseHistory entries={historyFromAudit(steps, HISTORY_FA, open)} />
        </Panel>
      </Desk>
    </OpsShell>
  );
}
