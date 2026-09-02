import Link from 'next/link';
import { inArray } from 'drizzle-orm';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../src/ui/access-denied.tsx';
import { notFound as notFoundError } from '../../../../src/domain/errors.ts';
import { GENETICS_NAV, OpsShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { Identifier, StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { animals } from '../../../../src/db/schema/animals.ts';
import { samples } from '../../../../src/db/schema/clinical.ts';
import { findReceipt, receiptItems, RECEIPT_STATUS_FA } from '../../../../src/genetics/service.ts';
import { ReceiptReviewForm } from '../../forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * One receipt at the centre — §14.1, §14.2.
 *
 * The centre sees the evidence and the sample codes it maps to. It has no
 * authority over ownership, the microchip or a permit, and no action here
 * offers one.
 */
export default async function GeneticsReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/genetics/receipts/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const receipt = await findReceipt(db(), id);
  if (!receipt) return <RecordNotFound error={notFoundError('فیش پیدا نشد.')} />;

  const items = await receiptItems(db(), receipt.id);
  const animalRows = items.length
    ? await db()
        .select({ id: animals.id, name: animals.name, generation: animals.generation })
        .from(animals)
        .where(inArray(animals.id, items.map((i) => i.animalId)))
    : [];
  const sampleRows = items.length
    ? await db().select().from(samples).where(inArray(samples.id, items.map((i) => i.sampleId)))
    : [];

  return (
    <OpsShell actor={guard.actor} title="هم‌زیست — مرکز ژنتیک" pathname={'/genetics/receipts/' + id} nav={GENETICS_NAV}>
      <div className="space-y-lg">
        <Card>
          <div className="flex items-start justify-between gap-md">
            <h2 className="text-label-lg">فیش پرداخت مستقیم</h2>
            <StatusBadge tone="info">
              <span data-testid="centre-receipt-status">{RECEIPT_STATUS_FA[receipt.status]}</span>
            </StatusBadge>
          </div>
          {receipt.payerNoteFa ? <p className="mt-md text-body-sm">{receipt.payerNoteFa}</p> : null}
          {receipt.fileId ? (
            <p className="mt-md text-body-sm">
              <Link
                href={'/api/files/' + receipt.fileId}
                className="text-text-brand underline underline-offset-4"
                data-testid="centre-receipt-file"
              >
                مشاهده تصویر فیش
              </Link>
            </p>
          ) : (
            <p className="mt-md text-caption text-text-secondary">تصویری بارگذاری نشده است.</p>
          )}
        </Card>

        <Card>
          <h3 className="text-label-lg">کدهای نمونه این فیش</h3>
          <ul className="mt-md space-y-sm text-body-sm" data-testid="centre-receipt-samples">
            {items.map((item) => {
              const sample = sampleRows.find((s) => s.id === item.sampleId);
              const animal = animalRows.find((a) => a.id === item.animalId);
              return (
                <li key={item.id} className="flex items-center justify-between gap-md">
                  <span>{animal?.name ?? 'بدون نام'} · G{animal?.generation ?? 0}</span>
                  <span>{sample ? <Identifier value={sample.trackingCode} /> : '—'}</span>
                </li>
              );
            })}
          </ul>
        </Card>

        {receipt.status === 'UNDER_REVIEW' ? (
          <Card>
            <h3 className="text-label-lg">تصمیم مرکز</h3>
            <p className="mt-md text-caption text-text-secondary">
              تأیید فیش، از دامپزشک نگهدارنده هر نمونه می‌خواهد آن را ارسال کند. این تأیید پرداخت صدور سند در
              هم‌زیست نیست.
            </p>
            <ReceiptReviewForm receiptId={receipt.id} version={receipt.version} />
          </Card>
        ) : (
          <Alert tone="info" title="این فیش در انتظار بررسی نیست">
            وضعیت فعلی: {RECEIPT_STATUS_FA[receipt.status]}
            {receipt.reasonFa ? ' — ' + receipt.reasonFa : ''}
          </Alert>
        )}
      </div>
    </OpsShell>
  );
}
