import Link from 'next/link';
import { inArray } from 'drizzle-orm';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../src/ui/access-denied.tsx';
import { notFound as notFoundError } from '../../../../src/domain/errors.ts';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { Identifier, StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { animals } from '../../../../src/db/schema/animals.ts';
import { pedigrees } from '../../../../src/db/schema/pedigree.ts';
import { batchItems, batchTotalToman, findBatch } from '../../../../src/billing/payments.ts';
import { itemsOfBatch } from '../../../../src/documents/pedigree.ts';
import { configuredMoney, formatTomanFa, tomanFromColumn } from '../../../../src/domain/money.ts';
import { PayIssuanceForm, RetryPedigreeIssuanceForm } from '../../forms.tsx';

export const dynamic = 'force-dynamic';

const STATE_FA = {
  AWAITING_PAYMENT: 'در انتظار پرداخت صدور',
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
 * One pedigree issuance checkout — §14.1 step 8, §22, §26.
 *
 * The payment status of the batch and the issuance state of each animal are
 * shown apart, and this payment is stated plainly as a different thing from the
 * direct payment to the genetics centre.
 */
export default async function PedigreeBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/pedigree/batch/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const batch = await findBatch(db(), id);
  if (!batch || batch.accountId !== guard.actor.accountId || batch.service !== 'PEDIGREE') {
    return <RecordNotFound error={notFoundError('درخواست صدور شجره‌نامه پیدا نشد.')} />;
  }

  const [items, lines, total] = await Promise.all([
    itemsOfBatch(db(), batch.id),
    batchItems(db(), batch.id),
    batchTotalToman(db(), batch.id),
  ]);
  const animalRows = items.length
    ? await db()
        .select({ id: animals.id, name: animals.name })
        .from(animals)
        .where(inArray(animals.id, items.map((i) => i.animalId)))
    : [];
  const documents = items.length
    ? await db()
        .select()
        .from(pedigrees)
        .where(inArray(pedigrees.animalId, items.map((i) => i.animalId)))
    : [];

  const blocked = items.filter((i) => i.state === 'BLOCKED');
  const payable = batch.status !== 'PAID';

  return (
    <PublicShell actor={guard.actor} title="درخواست صدور شجره‌نامه" pathname={'/pedigree/batch/' + id}>
      <div className="space-y-lg">
        <Card>
          <div className="flex items-start justify-between gap-md">
            <h2 className="text-label-lg">مرور هزینه صدور</h2>
            <StatusBadge
              tone={batch.status === 'PAID' ? 'success' : batch.status === 'FAILED' ? 'warning' : 'info'}
            >
              <span data-testid="pedigree-batch-status">{BATCH_FA[batch.status]}</span>
            </StatusBadge>
          </div>
          <ul className="mt-lg space-y-sm text-body-sm" data-testid="pedigree-breakdown">
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
            جمع کل: <span data-testid="pedigree-total">{formatTomanFa(configuredMoney(total))}</span>
          </p>
          <p className="mt-2xs text-caption text-text-secondary">
            این پرداخت با پرداخت مستقیم به مرکز ژنتیک یکی نیست؛ تأیید فیش مرکز جای این پرداخت را نمی‌گیرد.
          </p>
          {payable ? <PayIssuanceForm batchId={batch.id} /> : null}
        </Card>

        <Card>
          <h2 className="text-label-lg">وضعیت صدور هر حیوان</h2>
          <ul className="mt-lg space-y-lg" data-testid="pedigree-items">
            {items.map((item) => {
              const name = animalRows.find((a) => a.id === item.animalId)?.name ?? 'بدون نام';
              const document = documents.find((d) => d.animalId === item.animalId);
              return (
                <li key={item.id} className="rounded-lg border border-border-subtle p-lg">
                  <div className="flex items-start justify-between gap-md">
                    <span className="text-body-sm">{name}</span>
                    <StatusBadge
                      tone={item.state === 'ISSUED' ? 'success' : item.state === 'BLOCKED' ? 'warning' : 'info'}
                    >
                      <span data-testid={'pedigree-item-state-' + item.animalId}>{STATE_FA[item.state]}</span>
                    </StatusBadge>
                  </div>
                  {item.blockedReasonFa ? (
                    <p
                      className="mt-sm text-caption text-text-secondary"
                      data-testid={'pedigree-item-reason-' + item.animalId}
                    >
                      {item.blockedReasonFa} پرداخت این قلم محفوظ است.
                    </p>
                  ) : null}
                  {document ? (
                    <p className="mt-sm text-body-sm">
                      <Link
                        href={'/documents/pedigree/' + document.id}
                        className="text-text-brand underline underline-offset-4"
                        data-testid={'open-pedigree-' + item.animalId}
                      >
                        مشاهده شجره‌نامه
                      </Link>{' '}
                      · <Identifier value={document.pedigreeCode} />
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {batch.status === 'PAID' && blocked.length > 0 ? (
            <RetryPedigreeIssuanceForm batchId={batch.id} />
          ) : null}
        </Card>

        {batch.status === 'FAILED' || batch.status === 'CANCELLED' ? (
          <Alert tone="warning" title="پرداخت انجام نشد">
            انتخاب حیوان‌ها و مبلغ هر قلم حفظ شده است؛ نتیجه Parentage همچنان در پرونده دیده می‌شود.
          </Alert>
        ) : null}
      </div>
    </PublicShell>
  );
}
