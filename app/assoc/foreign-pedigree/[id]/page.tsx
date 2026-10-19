import { notFound as pageNotFound } from 'next/navigation';
import { isUuid } from '../../../../src/domain/ids.ts';
import { eq } from 'drizzle-orm';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../../src/ui/shell.tsx';
import { CaseAge, CaseHistory, Desk, DeskHead, DeskVersionNote, DocFrame, Panel, PrivateNote, deskPosition, whenFa } from '../../../../src/ui/desk.tsx';
import { auditSteps, historyFromAudit } from '../../audit-history.ts';
import { keyStatus } from '../../../../src/ui/queue.tsx';
import { KeyValueList } from '../../../../src/ui/key-value.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { Identifier } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { animals } from '../../../../src/db/schema/animals.ts';
import { pedigreeIssuers } from '../../../../src/db/schema/core.ts';
import {
  foreignCaseById,
  foreignQueueIds,
  FOREIGN_STATUS_FA,
  type ForeignPedigreeStatus,
} from '../../../../src/animals/foreign-pedigree.ts';
import { generationLabel } from '../../../../src/domain/lineage.ts';
import { ForeignReviewForm } from '../review-form.tsx';

export const dynamic = 'force-dynamic';

const HISTORY_FA: Record<string, string> = {
  FOREIGN_PEDIGREE_SUBMITTED: 'ارسال برای بررسی',
  FOREIGN_PEDIGREE_REVIEWED: 'تصمیم انجمن',
};

/**
 * Case detail (§21.5): data and permitted documents → history → action.
 *
 * Both sides of the document are fetched through the authorized private-file
 * route, which re-checks this operator's permission; nothing is inlined.
 */
export default async function AssocForeignCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // A segment that cannot be an id is a missing page, not a server error.
  if (!isUuid(id)) pageNotFound();
  const guard = await guardRoute('/assoc/foreign-pedigree/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const record = await foreignCaseById(db(), id);
  if (!record) {
    return (
      <OpsShell actor={guard.actor} title="پرونده Export Pedigree" pathname="/assoc/foreign-pedigree" nav={ASSOC_NAV}>
        <Alert tone="error" title="پرونده پیدا نشد" />
      </OpsShell>
    );
  }

  const [[animal], steps, queueIds] = await Promise.all([
    db().select().from(animals).where(eq(animals.id, record.animalId)),
    auditSteps('FOREIGN_PEDIGREE_CASE', record.id),
    foreignQueueIds(db(), guard.actor),
  ]);
  const [issuer] = record.issuerId
    ? await db().select().from(pedigreeIssuers).where(eq(pedigreeIssuers.id, record.issuerId))
    : [];

  const status = record.status as ForeignPedigreeStatus;
  const open = status === 'UNDER_REVIEW';
  const firstSubmittedAt = steps.filter((step) => step.action === 'FOREIGN_PEDIGREE_SUBMITTED').at(-1)?.at ?? record.submittedAt;
  return (
    <OpsShell actor={guard.actor} title="بررسی Export Pedigree" pathname="/assoc/foreign-pedigree" nav={ASSOC_NAV}>
      <DeskHead
        title={'Export Pedigree · ' + (animal?.name ?? 'بدون نام')}
        status={keyStatus(status)}
        position={deskPosition(queueIds, record.id, (caseId) => '/assoc/foreign-pedigree/' + caseId)}
        meta={[
          record.documentCode ? <Identifier label="کد مدرک" value={record.documentCode} /> : null,
          'ارسال: ' + (whenFa(record.submittedAt) ?? '—'),
          open && firstSubmittedAt ? <CaseAge since={firstSubmittedAt} /> : null,
          'نسخه ' + record.version.toLocaleString('fa-IR'),
        ]}
        owner={open ? 'ASSOCIATION' : status === 'NEEDS_CORRECTION' ? 'USER' : null}
      />
      <Desk
        decisionTitle={open ? 'تصمیم' : 'نتیجه'}
        decision={
          open ? (
            <>
              <p className="text-caption text-text-secondary">
                مبنای تأیید، فهرست صادرکنندگان موردتأیید انجمن است. زمان ثابتی برای پایان بررسی وعده داده نمی‌شود.
              </p>
              <ForeignReviewForm caseId={record.id} version={record.version} />
              <DeskVersionNote version={record.version} />
            </>
          ) : (
            <Alert tone="info" title="این پرونده در انتظار بررسی نیست">
              وضعیت فعلی: {FOREIGN_STATUS_FA[status]}
              {record.reasonFa ? ' — ' + record.reasonFa : ''}
            </Alert>
          )
        }
      >
        <Panel title="مدارک" aside={<PrivateNote />}>
          <div className="hz-desk__docs">
            <DocFrame
              href={record.frontFileId ? '/api/files/' + record.frontFileId : null}
              label="روی برگه"
              linkLabel="مشاهده تصویر روی برگه"
              testId="foreign-front-link"
              icon="certificate"
            />
            <DocFrame
              href={record.backFileId ? '/api/files/' + record.backFileId : null}
              label="پشت برگه"
              linkLabel="مشاهده تصویر پشت برگه"
              testId="foreign-back-link"
              icon="certificate"
            />
          </div>
        </Panel>
        <Panel title="اطلاعات پرونده">
          <KeyValueList
            twoCol
            rows={[
              { key: 'حیوان', value: animal?.name ?? 'بدون نام' },
              { key: 'نسل فعلی', value: animal ? generationLabel(animal.generation) : null },
              { key: 'صادرکننده', value: issuer?.name ?? '—', testId: 'case-issuer' },
              { key: 'کد مدرک', value: record.documentCode ? <Identifier value={record.documentCode} /> : null },
              { key: 'وضعیت', value: FOREIGN_STATUS_FA[status], testId: 'foreign-case-status' },
            ]}
          />
        </Panel>
        <Panel title="سابقه پرونده">
          <CaseHistory entries={historyFromAudit(steps, HISTORY_FA, open)} />
        </Panel>
      </Desk>
    </OpsShell>
  );
}
