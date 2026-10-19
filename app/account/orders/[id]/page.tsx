import { notFound as pageNotFound } from 'next/navigation';
import { isUuid } from '../../../../src/domain/ids.ts';
import { notFound } from 'next/navigation';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { db } from '../../../../src/db/client.ts';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { Alert } from '../../../../src/ui/alert.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { PageHeader, SectionHeader } from '../../../../src/ui/section-header.tsx';
import { PageCrumbs } from '../../../../src/ui/page-crumbs.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';
import { ActionOwner, StatusBadge } from '../../../../src/ui/status.tsx';
import { AppError } from '../../../../src/domain/errors.ts';
import { orderForBuyer, subOrderHistory } from '../../../../src/commerce/orders.ts';
import {
  SUB_ORDER_STATUS_FA,
  type SubOrderStatus,
} from '../../../../src/commerce/order-model.ts';
import { OrderActionForm, SubOrderMoveForm } from '../../../../src/commerce/order-forms.tsx';
import { cancelOrderAction, moveAsBuyerAction, retryOrderPaymentAction } from '../actions.ts';
import { ReturnRequestForm } from '../../../../src/commerce/finance-forms.tsx';
import { requestReturnAction } from '../finance-actions.ts';
import { RETURN_RULE_FA, type ReturnRule } from '../../../../src/commerce/fulfilment-model.ts';

export const dynamic = 'force-dynamic';

const fa = (value: number | bigint): string => value.toLocaleString('fa-IR');

/**
 * One order, with each shop's part shown separately — PROMPT-010. P06 record
 * file: the sub-orders (DS *SubOrderCard*) in the main column, the payment
 * status, total and the one next move in the side column.
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
  // A segment that cannot be an id is a missing page, not a server error.
  if (!isUuid(id)) pageNotFound();

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
  const pending = order.status === 'PENDING_PAYMENT';

  return (
    <PublicShell
      actor={guard.actor}
      title={'سفارش ' + order.reference}
      pathname="/account/orders"
      header={
        <div>
          <PageCrumbs items={[{ href: '/dashboard', name: 'خانه' }, { href: '/account/orders', name: 'سفارش‌ها' }, { name: order.reference }]} />
          <PageHeader
            title={
              <span data-testid="order-reference">
                سفارش <bdi dir="ltr">{order.reference}</bdi>
              </span>
            }
            back={{ href: '/account/orders', label: 'بازگشت به سفارش‌ها' }}
            aside={
              <span data-testid="order-status">
                <StatusBadge status={order.status} />
              </span>
            }
            meta={[
              parts.length.toLocaleString('fa-IR') + ' فروشگاه',
              'ثبت ' + order.createdAt.toLocaleDateString('fa-IR'),
            ]}
            actions={
              <a href="/account/orders" className="hz-link hz-link--standalone hz-show-md" data-testid="back-to-orders">
                بازگشت به سفارش‌ها
              </a>
            }
          />
        </div>
      }
    >
      <div className="grid items-start gap-xl lg:grid-cols-12">
        <aside aria-label="وضعیت و اقدام" className="min-w-0 space-y-lg lg:col-span-4 lg:col-start-9 lg:row-start-1">
          <Card variant="compact">
            <SectionHeader size="sm" title="وضعیت و پرداخت" />
            <div className="mt-md space-y-md">
              <p className="text-body-sm" data-testid="order-total">
                مبلغ پرداخت: <b>{fa(order.grandTotalToman)} تومان</b>
                {order.shippingTotalToman > 0n ? ' (شامل ' + fa(order.shippingTotalToman) + ' تومان ارسال)' : ''}
              </p>
              {view.refundedToman > 0n ? (
                <p className="text-body-sm" data-testid="order-refunded">
                  بازگردانده‌شده: {fa(view.refundedToman)} تومان
                </p>
              ) : null}
              {pending ? (
                <>
                  <ActionOwner owner="USER" />
                  <Alert tone="warning" title="این سفارش هنوز پرداخت نشده است">
                    <p className="text-body-sm" data-testid="order-hold-note">
                      کالاها تا {order.holdsExpireAt.toLocaleString('fa-IR')} برای شما نگه داشته شده‌اند.
                    </p>
                  </Alert>
                  <OrderActionForm
                    action={retryOrderPaymentAction}
                    orderId={order.id}
                    labelFa={'پرداخت سفارش'}
                    testPrefix="order-pay"
                    tone="primary"
                  />
                  <OrderActionForm action={cancelOrderAction} orderId={order.id} labelFa="لغو سفارش" testPrefix="order-cancel" tone="ghost" />
                </>
              ) : null}
              {!pending && order.status !== 'CANCELLED' ? (
                <a href={'/account/orders/' + order.id + '/invoice'} className="hz-btn hz-btn--secondary hz-btn--block" data-testid="order-invoice">
                  <Icon name="filePdf" size="sm" />
                  دریافت فاکتور (PDF)
                </a>
              ) : null}
            </div>
          </Card>

          <Card variant="compact">
            <SectionHeader size="sm" title="نشانی تحویل" />
            <p className="mt-sm text-body-sm" data-testid="order-address">
              {order.recipientNameFa} — <bdi dir="ltr">{order.recipientPhone}</bdi>
              <br />
              {[order.provinceFa, order.cityFa].filter(Boolean).join('، ')} {order.addressFa}
              {order.postalCode ? ' — کد پستی ' + order.postalCode : ''}
            </p>
          </Card>
        </aside>

        <div className="min-w-0 space-y-lg lg:col-span-8 lg:col-start-1 lg:row-start-1" data-testid="order-parts">
          <SectionHeader title="زیرسفارش هر فروشگاه" count={fa(parts.length)} />
          {parts.map((part) => (
            <section key={part.subOrder.id} className="hz-card hz-suborder" data-testid={'order-part-' + part.subOrder.id}>
              <div className="hz-suborder__head">
                <div className="hz-suborder__shop">
                  <Icon name="storefront" size="md" />
                  <div className="hz-suborder__shop-text">
                    <h3 className="hz-suborder__name">{part.sellerNameFa}</h3>
                    <span className="hz-suborder__sub" data-testid={'suborder-ref-' + part.subOrder.id}>
                      شماره زیرسفارش: <bdi dir="ltr">{part.subOrder.reference}</bdi>
                    </span>
                  </div>
                </div>
                <span data-testid={'suborder-status-' + part.subOrder.id}>
                  <StatusBadge status={part.subOrder.status} />
                </span>
              </div>
              {part.subOrder.statusReasonFa ? (
                <p className="text-caption" data-testid={'suborder-reason-' + part.subOrder.id}>
                  توضیح: {part.subOrder.statusReasonFa}
                </p>
              ) : null}
              {part.subOrder.trackingCode ? (
                <p className="text-caption" data-testid={'suborder-tracking-' + part.subOrder.id}>
                  کد رهگیری: <bdi dir="ltr">{part.subOrder.trackingCode}</bdi>
                </p>
              ) : null}

              <ul className="hz-suborder__items" data-testid={'suborder-items-' + part.subOrder.id}>
                {part.items.map((item) => (
                  <li key={item.id} className="hz-suborder__item">
                    <span className="hz-suborder__item-text">
                      <span className="hz-suborder__item-name">{item.productNameFa}</span>
                      <span className="hz-suborder__item-meta">
                        {(item.variantLabelFa ? item.variantLabelFa + ' · ' : '') + '× ' + fa(item.quantity)}
                      </span>
                    </span>
                    <span className="hz-suborder__item-amount">{fa(item.lineTotalToman)} تومان</span>
                  </li>
                ))}
              </ul>
              <dl className="hz-suborder__sum">
                <dt>جمع این فروشگاه</dt>
                <dd data-testid={'suborder-total-' + part.subOrder.id}>
                  {fa(part.subOrder.buyerTotalToman)} تومان
                  {part.subOrder.shippingWaived ? ' (ارسال رایگان)' : ''}
                </dd>
              </dl>

              <div className="hz-suborder__foot">
                <SubOrderMoveForm action={moveAsBuyerAction} subOrderId={part.subOrder.id} moves={part.moves} testPrefix="buyer-move" />
              </div>

              {part.subOrder.status === 'DELIVERED' ? (
                <details className="hz-accordion__item" data-testid={'return-open-' + part.subOrder.id}>
                  <summary className="hz-link hz-link--standalone cursor-pointer">مرجوع کردن کالا</summary>
                  <div className="mt-sm">
                    <ReturnRequestForm
                      action={requestReturnAction}
                      subOrderId={part.subOrder.id}
                      items={part.items.map((item) => ({
                        id: item.id,
                        labelFa: item.productNameFa + (item.variantLabelFa ? ' — ' + item.variantLabelFa : ''),
                        remaining: item.quantity - item.returnedQuantity,
                        // The sentence frozen onto this line when it was bought,
                        // not whatever the policy says today (PROMPT-011).
                        blockedFa:
                          item.returnRuleCode === 'NOT_RETURNABLE'
                            ? (item.returnRuleReasonFa ?? RETURN_RULE_FA[item.returnRuleCode as ReturnRule])
                            : null,
                      }))}
                    />
                  </div>
                </details>
              ) : null}

              <details className="hz-accordion__item">
                <summary className="hz-link hz-link--standalone cursor-pointer text-text-secondary">سابقه این زیرسفارش</summary>
                <ol className="mt-sm space-y-2xs text-caption" data-testid={'suborder-history-' + part.subOrder.id}>
                  {(historyOf.get(part.subOrder.id) ?? []).map((event) => (
                    <li key={event.id}>
                      {event.createdAt.toLocaleString('fa-IR')} — {SUB_ORDER_STATUS_FA[event.toStatus as SubOrderStatus]}
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
