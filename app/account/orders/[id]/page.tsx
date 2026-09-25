import { notFound } from 'next/navigation';
import Link from 'next/link';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { db } from '../../../../src/db/client.ts';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { Alert } from '../../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { AppError } from '../../../../src/domain/errors.ts';
import { orderForBuyer, subOrderHistory } from '../../../../src/commerce/orders.ts';
import {
  ORDER_STATUS_FA,
  SUB_ORDER_STATUS_FA,
  type OrderStatus,
  type SubOrderStatus,
} from '../../../../src/commerce/order-model.ts';
import { OrderActionForm, SubOrderMoveForm } from '../../../../src/commerce/order-forms.tsx';
import { cancelOrderAction, moveAsBuyerAction, retryOrderPaymentAction } from '../actions.ts';

export const dynamic = 'force-dynamic';

const fa = (value: number | bigint): string => value.toLocaleString('fa-IR');

/**
 * One order, with each shop's part shown separately — PROMPT-010.
 *
 * The parent says what was paid and where it is going. Everything that can
 * still move — accepted, preparing, shipped, returned — belongs to a shop's
 * own sub-order and is shown and acted on there, because that is where those
 * facts actually live.
 */
export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const guard = await guardRoute('/account/orders');
  if (!guard.ok) throw guard.denied;
  const { id } = await params;

  let view;
  try {
    view = await orderForBuyer(db(), guard.actor, id);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
  const { order, parts } = view;
  const histories = await Promise.all(
    parts.map(
      async (part) => [part.subOrder.id, await subOrderHistory(db(), guard.actor, part.subOrder.id)] as const,
    ),
  );
  const historyOf = new Map(histories);

  return (
    <PublicShell actor={guard.actor} title={'سفارش ' + order.reference} pathname="/account/orders">
      <div className="space-y-lg p-lg">
      <p className="text-caption">
        <Link href="/account/orders" className="text-text-brand" data-testid="back-to-orders">
          بازگشت به سفارش‌ها
        </Link>
      </p>

      <header className="space-y-sm">
        <h1 className="text-h2" data-testid="order-reference">
          سفارش {order.reference}
        </h1>
        <StatusBadge tone={order.status === 'PAID' ? 'success' : 'neutral'}>
          <span data-testid="order-status">{ORDER_STATUS_FA[order.status as OrderStatus]}</span>
        </StatusBadge>
        <p className="text-body-sm" data-testid="order-total">
          مبلغ پرداخت: {fa(order.grandTotalToman)} تومان
          {order.shippingTotalToman > 0n ? ' (شامل ' + fa(order.shippingTotalToman) + ' تومان ارسال)' : ''}
        </p>
        {view.refundedToman > 0n ? (
          <p className="text-body-sm" data-testid="order-refunded">
            بازگردانده‌شده: {fa(view.refundedToman)} تومان
          </p>
        ) : null}
      </header>

      {order.status === 'PENDING_PAYMENT' ? (
        <Alert tone="warning" title="این سفارش هنوز پرداخت نشده است">
          <div className="space-y-sm">
            <p className="text-body-sm" data-testid="order-hold-note">
              کالاها تا {order.holdsExpireAt.toLocaleString('fa-IR')} برای شما نگه داشته شده‌اند.
            </p>
            <OrderActionForm
              action={retryOrderPaymentAction}
              orderId={order.id}
              labelFa="پرداخت سفارش"
              testPrefix="order-pay"
              tone="primary"
            />
            <OrderActionForm
              action={cancelOrderAction}
              orderId={order.id}
              labelFa="لغو سفارش"
              testPrefix="order-cancel"
              tone="ghost"
            />
          </div>
        </Alert>
      ) : null}

      <section className="space-y-sm rounded-lg border border-border-subtle p-lg">
        <h2 className="text-label-lg">نشانی تحویل</h2>
        <p className="text-body-sm" data-testid="order-address">
          {order.recipientNameFa} — {order.recipientPhone}
          <br />
          {[order.provinceFa, order.cityFa].filter(Boolean).join('، ')} {order.addressFa}
          {order.postalCode ? ' — کد پستی ' + order.postalCode : ''}
        </p>
      </section>

      <div className="space-y-lg" data-testid="order-parts">
        {parts.map((part) => (
          <section
            key={part.subOrder.id}
            className="space-y-md rounded-lg border border-border-subtle p-lg"
            data-testid={'order-part-' + part.subOrder.id}
          >
            <header className="flex flex-wrap items-center justify-between gap-sm">
              <h2 className="text-label-lg">{part.sellerNameFa}</h2>
              <StatusBadge tone={part.subOrder.status === 'DELIVERED' ? 'success' : 'neutral'}>
                <span data-testid={'suborder-status-' + part.subOrder.id}>
                  {SUB_ORDER_STATUS_FA[part.subOrder.status as SubOrderStatus]}
                </span>
              </StatusBadge>
            </header>
            <p className="text-caption text-text-secondary" data-testid={'suborder-ref-' + part.subOrder.id}>
              شماره زیرسفارش: {part.subOrder.reference}
            </p>
            {part.subOrder.statusReasonFa ? (
              <p className="text-caption" data-testid={'suborder-reason-' + part.subOrder.id}>
                توضیح: {part.subOrder.statusReasonFa}
              </p>
            ) : null}
            {part.subOrder.trackingCode ? (
              <p className="text-caption" data-testid={'suborder-tracking-' + part.subOrder.id}>
                کد رهگیری: {part.subOrder.trackingCode}
              </p>
            ) : null}

            <ul className="space-y-2xs text-body-sm" data-testid={'suborder-items-' + part.subOrder.id}>
              {part.items.map((item) => (
                <li key={item.id}>
                  {item.productNameFa}
                  {item.variantLabelFa ? ' — ' + item.variantLabelFa : ''} × {fa(item.quantity)} ={' '}
                  {fa(item.lineTotalToman)} تومان
                </li>
              ))}
            </ul>
            <p className="text-body-sm" data-testid={'suborder-total-' + part.subOrder.id}>
              جمع این فروشگاه: {fa(part.subOrder.buyerTotalToman)} تومان
              {part.subOrder.shippingWaived ? ' (ارسال رایگان)' : ''}
            </p>

            <SubOrderMoveForm
              action={moveAsBuyerAction}
              subOrderId={part.subOrder.id}
              moves={part.moves}
              testPrefix="buyer-move"
            />

            <details>
              <summary className="text-caption text-text-secondary">سابقه این زیرسفارش</summary>
              <ol className="mt-sm space-y-2xs text-caption" data-testid={'suborder-history-' + part.subOrder.id}>
                {(historyOf.get(part.subOrder.id) ?? []).map((event) => (
                  <li key={event.id}>
                    {event.createdAt.toLocaleString('fa-IR')} —{' '}
                    {SUB_ORDER_STATUS_FA[event.toStatus as SubOrderStatus]}
                    {event.reasonFa ? ' — ' + event.reasonFa : ''}
                  </li>
                ))}
              </ol>
            </details>
          </section>
        ))}
      </div>
      </div>
    </PublicShell>
  );
}
