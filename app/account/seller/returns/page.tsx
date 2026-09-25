import Link from 'next/link';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { db } from '../../../../src/db/client.ts';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { myStores } from '../../../../src/commerce/sellers.ts';
import { sellerReturns } from '../../../../src/commerce/returns.ts';
import {
  RETURNED_CONDITION_FA,
  RETURN_STATUS_FA,
  type ReturnStatus,
  type ReturnedCondition,
} from '../../../../src/commerce/fulfilment-model.ts';
import { ReturnEvidenceForm, ReturnMoveForm } from '../../../../src/commerce/finance-forms.tsx';
import { addReturnEvidenceAction, moveReturnAsSellerAction } from '../../orders/finance-actions.ts';

export const dynamic = 'force-dynamic';

const fa = (value: number | bigint): string => value.toLocaleString('fa-IR');

/**
 * The returns one shop has to answer — PROMPT-011.
 *
 * Deciding is a shop's, but the right to ask is the buyer's and the platform's:
 * a refusal has to say why, and a buyer who will not accept it can argue,
 * which holds the money until somebody settles it.
 */
export default async function SellerReturnsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const guard = await guardRoute('/account/seller/returns');
  if (!guard.ok) throw guard.denied;

  const stores = await myStores(db(), guard.actor);
  const requested = String((await searchParams).store ?? '');
  const store = stores.find((row) => row.id === requested) ?? stores[0] ?? null;
  if (store === null) {
    return (
      <PublicShell actor={guard.actor} title="مرجوعی‌های فروشگاه" pathname="/account/seller">
        <div className="space-y-lg p-lg">
          <p className="text-body-sm text-text-secondary" data-testid="returns-no-store">
            هنوز فروشگاهی ندارید.
          </p>
        </div>
      </PublicShell>
    );
  }

  const returns = await sellerReturns(db(), guard.actor, store.id);

  return (
    <PublicShell actor={guard.actor} title="مرجوعی‌های فروشگاه" pathname="/account/seller">
      <div className="space-y-lg p-lg">
        <p className="text-caption">
          <Link href="/account/seller/orders" className="text-text-brand" data-testid="back-to-seller-orders">
            بازگشت به سفارش‌ها
          </Link>
        </p>

        <Alert tone="info" title="تا تعیین تکلیف مرجوعی، مبلغ آن زیرسفارش نگه داشته می‌شود">
          <span data-testid="returns-hold-note">
            مبلغ زیرسفارشی که روی آن مرجوعی یا اختلاف باز است، در «نگه‌داشته‌شده» می‌ماند و تسویه نمی‌شود.
          </span>
        </Alert>

        {returns.length === 0 ? (
          <p className="text-body-sm text-text-secondary" data-testid="seller-returns-empty">
            مرجوعی‌ای برای این فروشگاه ثبت نشده است.
          </p>
        ) : (
          <ul className="space-y-lg" data-testid="seller-returns">
            {returns.map((view) => (
              <li key={view.row.id}>
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-sm">
                    <h2 className="text-label-lg" data-testid={'seller-return-ref-' + view.row.id}>
                      {view.row.reference} — زیرسفارش {view.subOrderReference}
                    </h2>
                    <StatusBadge tone={view.row.status === 'REFUNDED' ? 'success' : 'neutral'}>
                      <span data-testid={'seller-return-status-' + view.row.id}>
                        {RETURN_STATUS_FA[view.row.status as ReturnStatus]}
                      </span>
                    </StatusBadge>
                  </div>

                  <p className="mt-sm text-body-sm" data-testid={'seller-return-reason-' + view.row.id}>
                    دلیل خریدار: {view.row.reasonFa}
                  </p>

                  <ul className="mt-sm space-y-2xs text-body-sm" data-testid={'seller-return-items-' + view.row.id}>
                    {view.items.map((item) => (
                      <li key={item.id}>
                        {item.productNameFa} × {fa(item.quantity)} — {fa(item.lineRefundToman)} تومان — {item.reasonFa}
                      </li>
                    ))}
                  </ul>

                  {view.row.receivedCondition ? (
                    <p className="mt-sm text-body-sm" data-testid={'seller-return-condition-' + view.row.id}>
                      وضعیت دریافت: {RETURNED_CONDITION_FA[view.row.receivedCondition as ReturnedCondition]}
                      {view.row.refundAmountToman !== null
                        ? ' — مبلغ بازپرداخت ' + fa(view.row.refundAmountToman) + ' تومان'
                        : ''}
                    </p>
                  ) : null}

                  {view.evidence.length > 0 ? (
                    <p className="mt-sm text-caption text-text-secondary" data-testid={'seller-return-evidence-' + view.row.id}>
                      {fa(view.evidence.length)} مدرک پیوست شده است.
                    </p>
                  ) : null}

                  <div className="mt-lg space-y-md">
                    <ReturnMoveForm
                      action={moveReturnAsSellerAction}
                      returnId={view.row.id}
                      moves={view.moves}
                      testPrefix="seller-return"
                    />
                    <ReturnEvidenceForm action={addReturnEvidenceAction} returnId={view.row.id} />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PublicShell>
  );
}
