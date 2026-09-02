import Link from 'next/link';
import { eq, inArray } from 'drizzle-orm';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../src/ui/access-denied.tsx';
import { notFound as notFoundError } from '../../../src/domain/errors.ts';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { Identifier, StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { animals } from '../../../src/db/schema/animals.ts';
import { registrationSheets } from '../../../src/db/schema/documents.ts';
import { batchItems, batchTotalToman, findBatch, latestAttempt } from '../../../src/billing/payments.ts';
import { itemsOfBatch, SAMPLE_TAKEN_NOTE_FA } from '../../../src/documents/registration-sheet.ts';
import { configuredMoney, formatTomanFa, tomanFromColumn } from '../../../src/domain/money.ts';
import { CancelSheetPaymentForm, PaySheetBatchForm, RetryIssuanceForm } from './batch-forms.tsx';

export const dynamic = 'force-dynamic';

const STATE_FA = {
  AWAITING_PAYMENT: 'در انتظار پرداخت',
  AWAITING_ISSUANCE: 'در انتظار صدور',
  ISSUED: 'صادر شد',
  BLOCKED: 'متوقف',
} as const;

const BATCH_FA = {
  DRAFT: 'پیش‌نویس',
  AWAITING_PAYMENT: 'در انتظار پرداخت',
  PAID: 'پرداخت تأییدشده',
  FAILED: 'پرداخت ناموفق',
  CANCELLED: 'پرداخت لغوشده',
} as const;

/**
 * One registration-sheet checkout — §13, §22, §26.
 *
 * The batch's payment status and each animal's issuance state are shown apart,
 * because they are different facts: a blocked animal never hides the others,
 * and an issued one stays issued whatever happened to its neighbours.
 */
export default async function SheetBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/registration/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const batch = await findBatch(db(), id);
  if (!batch || batch.accountId !== guard.actor.accountId || batch.service !== 'REGISTRATION_SHEET') {
    return <RecordNotFound error={notFoundError('درخواست برگه ثبتی پیدا نشد.')} />;
  }

  const [items, lines, total, attempt] = await Promise.all([
    itemsOfBatch(db(), batch.id),
    batchItems(db(), batch.id),
    batchTotalToman(db(), batch.id),
    latestAttempt(db(), batch.id),
  ]);

  const animalRows = items.length
    ? await db()
        .select({ id: animals.id, name: animals.name })
        .from(animals)
        .where(inArray(animals.id, items.map((i) => i.animalId)))
    : [];
  const sheets = items.length
    ? await db()
        .select()
        .from(registrationSheets)
        .where(inArray(registrationSheets.animalId, items.map((i) => i.animalId)))
    : [];

  const blocked = items.filter((i) => i.state === 'BLOCKED');
  const payable = batch.status === 'DRAFT' || batch.status === 'AWAITING_PAYMENT' || batch.status === 'FAILED' || batch.status === 'CANCELLED';

  return (
    <PublicShell actor={guard.actor} title="درخواست برگه ثبتی" pathname={'/registration/' + id}>
      <div className="space-y-lg">
        <Card>
          <div className="flex items-start justify-between gap-md">
            <h2 className="text-label-lg">مرور هزینه</h2>
            <StatusBadge tone={batch.status === 'PAID' ? 'success' : batch.status === 'FAILED' ? 'warning' : 'info'}>
              <span data-testid="batch-status">{BATCH_FA[batch.status]}</span>
            </StatusBadge>
          </div>

          <ul className="mt-lg space-y-sm text-body-sm" data-testid="sheet-breakdown">
            {items.map((item) => {
              const line = lines.find((l) => l.targetId === item.animalId);
              const name = animalRows.find((a) => a.id === item.animalId)?.name ?? 'بدون نام';
              return (
                <li key={item.id} className="flex items-center justify-between gap-md">
                  <span>{name}</span>
                  <span className="text-text-secondary">
                    {line ? formatTomanFa(tomanFromColumn(line.amountToman)) : '—'}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-lg text-body-sm">
            جمع کل: <span data-testid="sheet-total">{formatTomanFa(configuredMoney(total))}</span>
          </p>
          <p className="mt-2xs text-caption text-text-secondary">
            مبلغ خدمت دامپزشک جدا است و در این پرداخت نیست.
          </p>

          {payable ? (
            <>
              <PaySheetBatchForm batchId={batch.id} />
              {attempt && attempt.status === 'PENDING' ? <CancelSheetPaymentForm batchId={batch.id} /> : null}
            </>
          ) : null}
        </Card>

        {batch.status === 'FAILED' || batch.status === 'CANCELLED' ? (
          <Alert tone="warning" title="پرداخت انجام نشد">
            حیوان‌های انتخاب‌شده و مبلغ هر قلم حفظ شده است؛ می‌توانید دوباره تلاش کنید.
          </Alert>
        ) : null}

        <Card>
          <h2 className="text-label-lg">وضعیت صدور هر حیوان</h2>
          <p className="mt-md text-caption text-text-secondary">
            وضعیت هر حیوان مستقل است؛ توقف یکی، صدور بقیه را متوقف نمی‌کند.
          </p>
          <ul className="mt-lg space-y-lg" data-testid="sheet-items">
            {items.map((item) => {
              const name = animalRows.find((a) => a.id === item.animalId)?.name ?? 'بدون نام';
              const sheet = sheets.find((s) => s.animalId === item.animalId);
              return (
                <li key={item.id} className="rounded-lg border border-border-subtle p-lg">
                  <div className="flex items-start justify-between gap-md">
                    <span className="text-body-sm">{name}</span>
                    <StatusBadge
                      tone={item.state === 'ISSUED' ? 'success' : item.state === 'BLOCKED' ? 'warning' : 'info'}
                    >
                      <span data-testid={'item-state-' + item.animalId}>{STATE_FA[item.state]}</span>
                    </StatusBadge>
                  </div>
                  {item.blockedReasonFa ? (
                    <p className="mt-sm text-caption text-text-secondary" data-testid={'item-reason-' + item.animalId}>
                      {item.blockedReasonFa} پرداخت این قلم محفوظ است.
                    </p>
                  ) : null}
                  {sheet ? (
                    <p className="mt-sm text-body-sm">
                      <Link
                        href={'/documents/' + sheet.id}
                        className="text-text-brand underline underline-offset-4"
                        data-testid={'open-sheet-' + item.animalId}
                      >
                        مشاهده برگه ثبتی
                      </Link>{' '}
                      · <Identifier value={sheet.sheetNo} />
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {batch.status === 'PAID' && blocked.length > 0 ? <RetryIssuanceForm batchId={batch.id} /> : null}
        </Card>

        {batch.status === 'PAID' ? (
          <Alert tone="info" title="برگه ثبتی نتیجه ژنتیک نیست">
            <span data-testid="sheet-parentage-note">{SAMPLE_TAKEN_NOTE_FA}</span>
          </Alert>
        ) : null}
      </div>
    </PublicShell>
  );
}
