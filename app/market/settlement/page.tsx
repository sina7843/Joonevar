import { OpsShell, marketNav } from '../../../src/ui/shell.tsx';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { CaseItem, CaseList, QueueMeta } from '../../../src/ui/desk.tsx';
import { KeyValueList } from '../../../src/ui/key-value.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
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
    <OpsShell actor={guard.actor} title="تسویه فروشندگان" nav={marketNav(guard.actor)} pathname="/market/settlement">
      <QueueMeta total={rows.length} noun="فروشگاه با مبلغ در جریان یا قابل تسویه" />
      <Alert tone="info" title="واریز در این صفحه ثبت می‌شود، نه انجام">
        <span data-testid="settlement-manual-note">
          پرداخت بانکی بیرون از همزیست انجام می‌شود و شماره پیگیری آن اینجا ثبت می‌شود؛ تا ثبت واریز، مبلغ از
          موجودی قابل تسویه فروشنده کم نمی‌شود.
        </span>
      </Alert>

      {rows.length === 0 ? (
        <div data-testid="settlement-empty">
          <EmptyState
            title="هیچ فروشگاهی مبلغ در جریان یا قابل تسویه ندارد."
            description="سهم فروشنده پس از تحویل و پایان مهلت مرجوعی اینجا قابل تسویه می‌شود."
          />
        </div>
      ) : (
        <CaseList label="تسویه فروشندگان" testId="settlement-queue">
          {rows.map((row) => (
            <CaseItem
              key={row.sellerId}
              type="تسویه"
              name={<span data-testid={'settlement-seller-' + row.sellerId}>{row.sellerNameFa}</span>}
              sub={
                <span className="hz-num" data-testid={'settlement-available-' + row.sellerId}>
                  قابل تسویه: {fa(row.availableToman)} تومان
                  {row.debtToman > 0n ? ' — بدهی: ' + fa(row.debtToman) + ' تومان' : ''}
                </span>
              }
              status={
                row.openBatch === null
                  ? undefined
                  : {
                      tone: row.openBatch.status === 'PAID' ? 'success' : 'info',
                      label: SETTLEMENT_STATUS_FA[row.openBatch.status as SettlementStatus],
                      testId: 'settlement-batch-status-' + row.sellerId,
                    }
              }
              owner="SYSTEM"
              ownerLabel="مالی بازار"
              ownerIsUs
            >
              <div className="space-y-md">
                {row.blockers.length > 0 ? (
                  <ul className="list-inside list-disc text-caption text-text-secondary" data-testid={'settlement-blockers-' + row.sellerId}>
                    {row.blockers.map((blocker) => (
                      <li key={blocker}>{PAYOUT_BLOCKER_FA[blocker as PayoutBlocker] ?? blocker}</li>
                    ))}
                  </ul>
                ) : null}

                {row.openBatch === null ? (
                  row.blockers.length === 0 ? (
                    <OpenBatchForm action={openBatchAction} sellerId={row.sellerId} />
                  ) : null
                ) : (
                  <div className="space-y-sm">
                    <div data-testid={'settlement-batch-' + row.sellerId}>
                      <KeyValueList
                        twoCol
                        rows={[
                          {
                            key: 'دسته تسویه',
                            value: (
                              <bdi className="hz-id" dir="ltr">
                                {row.openBatch.reference}
                              </bdi>
                            ),
                          },
                          { key: 'مبلغ', value: fa(row.openBatch.totalToman) + ' تومان' },
                          {
                            key: 'شبا',
                            value: (
                              <bdi className="hz-id" dir="ltr">
                                {row.openBatch.ibanSnapshot}
                              </bdi>
                            ),
                          },
                          { key: 'به نام', value: row.openBatch.holderNameSnapshot },
                        ]}
                      />
                    </div>
                    <BatchMoveForm
                      action={moveBatchAction}
                      batchId={row.openBatch.id}
                      moves={settlementMovesFrom(row.openBatch.status as SettlementStatus)}
                    />
                  </div>
                )}

                <details>
                  <summary className="hz-link hz-link--standalone cursor-pointer">ثبت دستی در دفتر این فروشگاه</summary>
                  <div className="mt-sm">
                    <LedgerEntryForm action={ledgerEntryAction} sellerId={row.sellerId} />
                  </div>
                </details>
              </div>
            </CaseItem>
          ))}
        </CaseList>
      )}
    </OpsShell>
  );
}
