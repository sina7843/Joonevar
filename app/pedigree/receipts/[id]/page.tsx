import Link from 'next/link';
import { eq, inArray } from 'drizzle-orm';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../src/ui/access-denied.tsx';
import { AppError } from '../../../../src/domain/errors.ts';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { Identifier, StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { animals } from '../../../../src/db/schema/animals.ts';
import { samples } from '../../../../src/db/schema/clinical.ts';
import { ownerReceipt, receiptItems, RECEIPT_STATUS_FA } from '../../../../src/genetics/service.ts';
import { SAMPLE_STATUS_FA, type SampleStatusName } from '../../../../src/domain/microchip.ts';
import { ReceiptForms } from '../../forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * One receipt and the samples it pays for — §14.1, §14.4.
 *
 * A receipt that needs correction is fixed in place: the same record, the same
 * sample codes, with the centre's reason kept beside it.
 */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/pedigree/receipts/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  let receipt;
  try {
    receipt = await ownerReceipt(db(), guard.actor, id);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') return <RecordNotFound error={error} />;
    throw error;
  }

  const items = await receiptItems(db(), receipt.id);
  const animalRows = items.length
    ? await db()
        .select({ id: animals.id, name: animals.name })
        .from(animals)
        .where(inArray(animals.id, items.map((i) => i.animalId)))
    : [];
  const sampleRows = items.length
    ? await db()
        .select()
        .from(samples)
        .where(inArray(samples.id, items.map((i) => i.sampleId)))
    : [];

  const editable = receipt.status === 'DRAFT' || receipt.status === 'NEEDS_CORRECTION';

  return (
    <PublicShell actor={guard.actor} title="فیش مرکز ژنتیک" pathname={'/pedigree/receipts/' + id}>
      <div className="space-y-lg">
        <Card>
          <div className="flex items-start justify-between gap-md">
            <h2 className="text-label-lg">وضعیت فیش</h2>
            <StatusBadge
              tone={
                receipt.status === 'APPROVED'
                  ? 'success'
                  : receipt.status === 'NEEDS_CORRECTION' || receipt.status === 'REJECTED'
                    ? 'warning'
                    : 'info'
              }
            >
              <span data-testid="receipt-status">{RECEIPT_STATUS_FA[receipt.status]}</span>
            </StatusBadge>
          </div>
          {receipt.reasonFa ? (
            <p className="mt-md text-body-sm" data-testid="receipt-reason">
              {receipt.reasonFa}
            </p>
          ) : null}
          {receipt.status === 'NEEDS_CORRECTION' ? (
            <p className="mt-sm text-caption text-text-secondary">
              فایل قبلی شما حفظ شده است؛ همین فیش را اصلاح و دوباره ارسال کنید.
            </p>
          ) : null}
          {receipt.status === 'APPROVED' ? (
            <Alert tone="info" title="پرداخت صدور سند جداست">
              <span data-testid="receipt-approved-note">
                تأیید فیش مرکز، پرداخت صدور شجره‌نامه در هم‌زیست نیست. پردازش نمونه مستقل از آن پرداخت انجام
                می‌شود.
              </span>
            </Alert>
          ) : null}
        </Card>

        <Card>
          <h3 className="text-label-lg">نمونه‌های این فیش</h3>
          <ul className="mt-md space-y-sm text-body-sm" data-testid="receipt-samples">
            {items.map((item) => {
              const sample = sampleRows.find((s) => s.id === item.sampleId);
              const name = animalRows.find((a) => a.id === item.animalId)?.name ?? 'بدون نام';
              return (
                <li key={item.id} className="flex items-center justify-between gap-md">
                  <span>
                    {name} · {sample ? <Identifier value={sample.trackingCode} /> : '—'}
                  </span>
                  <span className="text-text-secondary" data-testid={'sample-state-' + item.animalId}>
                    {sample ? SAMPLE_STATUS_FA[sample.status as SampleStatusName] : '—'}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-lg text-caption text-text-secondary">
            همان کد رهگیری نمونه در تمام مسیر می‌ماند؛ ارسال و دریافت رویدادهای همان کد هستند.
          </p>
        </Card>

        <ReceiptForms receiptId={receipt.id} canEdit={editable} hasFile={receipt.fileId !== null} />

        {receipt.fileId ? (
          <Card>
            <p className="text-body-sm">
              <Link
                href={'/api/files/' + receipt.fileId}
                className="text-text-brand underline underline-offset-4"
                data-testid="receipt-file-link"
              >
                مشاهده فیش بارگذاری‌شده
              </Link>
            </p>
          </Card>
        ) : null}
      </div>
    </PublicShell>
  );
}
