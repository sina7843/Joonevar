import { notFound as pageNotFound } from 'next/navigation';
import { isUuid } from '../../../../src/domain/ids.ts';
import { inArray } from 'drizzle-orm';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../src/ui/access-denied.tsx';
import { notFound as notFoundError } from '../../../../src/domain/errors.ts';
import { GENETICS_NAV, OpsShell } from '../../../../src/ui/shell.tsx';
import { CaseAge, CaseHistory, Desk, DeskHead, DeskVersionNote, DocFrame, Panel, PrivateNote, deskPosition, whenFa } from '../../../../src/ui/desk.tsx';
import { keyStatus } from '../../../../src/ui/queue.tsx';
import { auditSteps, historyFromAudit } from '../../../assoc/audit-history.ts';
import { Alert } from '../../../../src/ui/alert.tsx';
import { Identifier } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { animals } from '../../../../src/db/schema/animals.ts';
import { samples } from '../../../../src/db/schema/clinical.ts';
import { findReceipt, receiptItems, receiptQueue, RECEIPT_STATUS_FA } from '../../../../src/genetics/service.ts';
import { ReceiptReviewForm } from '../../forms.tsx';

export const dynamic = 'force-dynamic';

const HISTORY_FA: Record<string, string> = {
  GENETICS_RECEIPT_CREATED: 'ثبت فیش',
  GENETICS_RECEIPT_SUBMITTED: 'ارسال برای بررسی',
  GENETICS_RECEIPT_REVIEWED: 'تصمیم مرکز',
};

/**
 * One receipt at the centre — §14.1, §14.2.
 *
 * The centre sees the evidence and the sample codes it maps to. It has no
 * authority over ownership, the microchip or a permit, and no action here
 * offers one.
 */
export default async function GeneticsReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // A segment that cannot be an id is a missing page, not a server error.
  if (!isUuid(id)) pageNotFound();
  const guard = await guardRoute('/genetics/receipts/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const receipt = await findReceipt(db(), id);
  if (!receipt) return <RecordNotFound error={notFoundError('فیش پیدا نشد.')} />;

  const [items, steps, queue] = await Promise.all([
    receiptItems(db(), receipt.id),
    auditSteps('GENETICS_RECEIPT', receipt.id),
    receiptQueue(db(), guard.actor),
  ]);
  const animalRows = items.length
    ? await db()
        .select({ id: animals.id, name: animals.name, generation: animals.generation })
        .from(animals)
        .where(inArray(animals.id, items.map((i) => i.animalId)))
    : [];
  const sampleRows = items.length
    ? await db().select().from(samples).where(inArray(samples.id, items.map((i) => i.sampleId)))
    : [];

  const open = receipt.status === 'UNDER_REVIEW';
  const firstSubmittedAt = steps.filter((step) => step.action === 'GENETICS_RECEIPT_SUBMITTED').at(-1)?.at ?? receipt.submittedAt;
  return (
    <OpsShell actor={guard.actor} title="بررسی فیش" pathname={'/genetics/receipts/' + id} nav={GENETICS_NAV} headingInPage>
      <DeskHead level={1}
        title="فیش پرداخت مستقیم"
        status={{ ...keyStatus(receipt.status), testId: 'centre-receipt-status' }}
        position={deskPosition(
          queue.map((row) => row.id),
          receipt.id,
          (receiptId) => '/genetics/receipts/' + receiptId,
        )}
        meta={[
          'ارسال: ' + (whenFa(receipt.submittedAt) ?? '—'),
          open && firstSubmittedAt ? <CaseAge since={firstSubmittedAt} /> : null,
          'نسخه ' + receipt.version.toLocaleString('fa-IR'),
        ]}
        owner={open ? 'GENETICS_CENTRE' : receipt.status === 'NEEDS_CORRECTION' ? 'USER' : null}
      />
      <Desk
        decisionTitle={open ? 'تصمیم مرکز' : 'نتیجه'}
        decision={
          open ? (
            <>
              <p className="text-caption text-text-secondary">
                تأیید فیش، از دامپزشک نگهدارنده هر نمونه می‌خواهد آن را ارسال کند. این تأیید پرداخت صدور سند در
                هم‌زیست نیست.
              </p>
              <ReceiptReviewForm receiptId={receipt.id} version={receipt.version} />
              <DeskVersionNote version={receipt.version} />
            </>
          ) : (
            <Alert tone="info" title="این فیش در انتظار بررسی نیست">
              وضعیت فعلی: {RECEIPT_STATUS_FA[receipt.status]}
              {receipt.reasonFa ? ' — ' + receipt.reasonFa : ''}
            </Alert>
          )
        }
      >
        <Panel title="مدارک" aside={<PrivateNote />}>
          <div className="hz-desk__docs">
            <DocFrame
              href={receipt.fileId ? '/api/files/' + receipt.fileId : null}
              label="تصویر فیش"
              linkLabel="مشاهده تصویر فیش"
              testId="centre-receipt-file"
              icon="receipt"
            />
          </div>
          {receipt.payerNoteFa ? <p className="text-body-sm">{'توضیح پرداخت‌کننده: ' + receipt.payerNoteFa}</p> : null}
        </Panel>

        <Panel title="کدهای نمونه این فیش" count={items.length.toLocaleString('fa-IR')}>
          <ul className="hz-kv" data-testid="centre-receipt-samples">
            {items.map((item) => {
              const sample = sampleRows.find((s) => s.id === item.sampleId);
              const animal = animalRows.find((a) => a.id === item.animalId);
              return (
                <li key={item.id} className="hz-kv__row">
                  <span className="hz-kv__key">{(animal?.name ?? 'بدون نام') + ' · '}<bdi dir="ltr">{'G' + (animal?.generation ?? 0)}</bdi></span>
                  <span className="hz-kv__value">{sample ? <Identifier value={sample.trackingCode} /> : '—'}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
        <Panel title="سابقه پرونده">
          <CaseHistory entries={historyFromAudit(steps, HISTORY_FA, open)} />
        </Panel>
      </Desk>
    </OpsShell>
  );
}
