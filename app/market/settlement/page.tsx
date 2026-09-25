import { OpsShell, marketNav } from '../../../src/ui/shell.tsx';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { settlementQueue } from '../../../src/commerce/ledger.ts';
import {
  PAYOUT_BLOCKER_FA,
  SETTLEMENT_STATUS_FA,
  settlementMovesFrom,
  type PayoutBlocker,
  type SettlementStatus,
} from '../../../src/commerce/fulfilment-model.ts';
import { BatchMoveForm, LedgerEntryForm, OpenBatchForm } from '../../../src/commerce/finance-forms.tsx';
import { ledgerEntryAction, moveBatchAction, openBatchAction } from '../../account/orders/finance-actions.ts';

export const dynamic = 'force-dynamic';

const fa = (value: number | bigint): string => value.toLocaleString('fa-IR');

/**
 * Every shop with money in it — PROMPT-011.
 *
 * Reading this sweeps the holds whose return windows have closed, because
 * nothing in this product runs on a timer and an operator looking at
 * settleable money should be looking at what is settleable now.
 *
 * Paying is recorded here rather than performed: the platform does not move
 * money by itself, so a person sends it and writes down the bank's reference,
 * and only that writes the payout into the ledger.
 */
export default async function SettlementPage() {
  const guard = await guardRoute('/market/settlement');
  if (!guard.ok) throw guard.denied;
  const rows = await settlementQueue(db(), guard.actor);

  return (
    <OpsShell
      actor={guard.actor}
      title="تسویه فروشندگان"
      nav={marketNav(guard.actor)}
      pathname="/market/settlement"
    >
      <div className="space-y-lg p-lg">
        <Alert tone="info" title="واریز در این صفحه ثبت می‌شود، نه انجام">
          <span data-testid="settlement-manual-note">
            پرداخت بانکی بیرون از همزیست انجام می‌شود و شماره پیگیری آن اینجا ثبت می‌شود؛ تا ثبت واریز، مبلغ از
            موجودی قابل تسویه فروشنده کم نمی‌شود.
          </span>
        </Alert>

        {rows.length === 0 ? (
          <p className="text-body-sm text-text-secondary" data-testid="settlement-empty">
            هیچ فروشگاهی مبلغ در جریان یا قابل تسویه ندارد.
          </p>
        ) : (
          <ul className="space-y-lg" data-testid="settlement-queue">
            {rows.map((row) => (
              <li key={row.sellerId}>
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-sm">
                    <h2 className="text-label-lg" data-testid={'settlement-seller-' + row.sellerId}>
                      {row.sellerNameFa}
                    </h2>
                    <span className="text-body-sm" data-testid={'settlement-available-' + row.sellerId}>
                      قابل تسویه: {fa(row.availableToman)} تومان
                      {row.debtToman > 0n ? ' — بدهی: ' + fa(row.debtToman) + ' تومان' : ''}
                    </span>
                  </div>

                  {row.blockers.length > 0 ? (
                    <ul className="mt-sm space-y-2xs text-caption" data-testid={'settlement-blockers-' + row.sellerId}>
                      {row.blockers.map((blocker) => (
                        <li key={blocker}>{PAYOUT_BLOCKER_FA[blocker as PayoutBlocker] ?? blocker}</li>
                      ))}
                    </ul>
                  ) : null}

                  {row.openBatch === null ? (
                    <div className="mt-lg">
                      {row.blockers.length === 0 ? (
                        <OpenBatchForm action={openBatchAction} sellerId={row.sellerId} />
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-lg space-y-sm">
                      <p className="text-body-sm" data-testid={'settlement-batch-' + row.sellerId}>
                        {row.openBatch.reference} — {fa(row.openBatch.totalToman)} تومان — به{' '}
                        {row.openBatch.ibanSnapshot} به نام {row.openBatch.holderNameSnapshot}
                      </p>
                      <StatusBadge tone={row.openBatch.status === 'PAID' ? 'success' : 'neutral'}>
                        <span data-testid={'settlement-batch-status-' + row.sellerId}>
                          {SETTLEMENT_STATUS_FA[row.openBatch.status as SettlementStatus]}
                        </span>
                      </StatusBadge>
                      <BatchMoveForm
                        action={moveBatchAction}
                        batchId={row.openBatch.id}
                        moves={settlementMovesFrom(row.openBatch.status as SettlementStatus)}
                      />
                    </div>
                  )}

                  <details className="mt-lg">
                    <summary className="text-caption text-text-secondary">ثبت دستی در دفتر این فروشگاه</summary>
                    <div className="mt-sm">
                      <LedgerEntryForm action={ledgerEntryAction} sellerId={row.sellerId} />
                    </div>
                  </details>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </OpsShell>
  );
}
