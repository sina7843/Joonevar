/**
 * A Persian invoice for one order — PROMPT-012.
 *
 * A faithful print of what Hamzist holds about a purchase: what was bought,
 * from whom, what came off it and what was paid. It says on its face that it
 * is not a tax document, because a marketplace that quietly implies one is a
 * marketplace whose buyers file it as one.
 *
 * Only the buyer may take it, and only once the payment is verified — an
 * invoice for an order nobody paid for is a receipt for nothing.
 */
import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import { commerceOrderItems, commerceOrders, commerceSubOrders } from '../db/schema/orders.ts';
import { commerceSellers } from '../db/schema/commerce.ts';
import { renderDocumentPdf, type DocumentSpec } from '../documents/render.ts';
import { recordAudit } from '../audit/service.ts';
import { conflict, notFound } from '../domain/errors.ts';
import { hasMarketplaceCapability } from '../marketplace/model.ts';
import type { Actor } from '../authz/actor.ts';
import { redemptionsOfOrder } from './discounts.ts';
import { DISCOUNT_KIND_FA, type DiscountKind } from './trust-model.ts';

const fa = (value: number | bigint): string => value.toLocaleString('fa-IR');

/** Everything the invoice states, gathered from the order and nothing else. */
export async function invoiceSpec(
  database: Database,
  actor: Actor,
  orderId: string,
): Promise<DocumentSpec> {
  const [order] = await database.select().from(commerceOrders).where(eq(commerceOrders.id, orderId)).limit(1);
  if (!order) throw notFound('این سفارش پیدا نشد.');

  const mine = actor.accountId !== null && order.buyerAccountId === actor.accountId;
  if (!mine && !hasMarketplaceCapability(actor, 'ORDER_VIEW')) throw notFound('این سفارش پیدا نشد.');
  if (order.status === 'PENDING_PAYMENT' || order.status === 'CANCELLED') {
    throw conflict('تا تأیید پرداخت، فاکتور این سفارش صادر نمی‌شود.');
  }

  const parts = await database
    .select({ subOrder: commerceSubOrders, sellerNameFa: commerceSellers.displayNameFa })
    .from(commerceSubOrders)
    .innerJoin(commerceSellers, eq(commerceSellers.id, commerceSubOrders.sellerId))
    .where(eq(commerceSubOrders.orderId, order.id))
    .orderBy(commerceSubOrders.reference);

  const rows: string[][] = [];
  for (const part of parts) {
    const items = await database
      .select()
      .from(commerceOrderItems)
      .where(eq(commerceOrderItems.subOrderId, part.subOrder.id));
    for (const item of items) {
      rows.push([
        item.productNameFa + (item.variantLabelFa ? ' — ' + item.variantLabelFa : ''),
        part.sellerNameFa ?? 'فروشگاه',
        fa(item.quantity),
        fa(item.unitPriceToman),
        fa(item.lineTotalToman),
      ]);
    }
    if (part.subOrder.shippingToman > 0n) {
      rows.push([
        'هزینه ارسال — ' + (part.subOrder.shippingMethodLabelFa ?? 'ارسال'),
        part.sellerNameFa ?? 'فروشگاه',
        '۱',
        fa(part.subOrder.shippingToman),
        fa(part.subOrder.shippingToman),
      ]);
    }
  }

  const discounts = await redemptionsOfOrder(database, order.id);
  const fields = [
    { labelFa: 'تاریخ سفارش', value: order.createdAt.toLocaleDateString('fa-IR') },
    { labelFa: 'وضعیت', value: order.status === 'PAID' ? 'پرداخت‌شده' : 'بازپرداخت‌شده' },
    { labelFa: 'گیرنده', value: order.recipientNameFa },
    { labelFa: 'شماره تماس', value: order.recipientPhone },
    {
      labelFa: 'نشانی تحویل',
      value:
        [order.provinceFa, order.cityFa].filter(Boolean).join('، ') +
        ' ' +
        order.addressFa +
        (order.postalCode ? ' — کد پستی ' + order.postalCode : ''),
    },
    { labelFa: 'جمع کالاها', value: fa(order.itemsTotalToman) + ' تومان' },
    { labelFa: 'جمع هزینه ارسال', value: fa(order.shippingTotalToman) + ' تومان' },
  ];
  if (order.discountTotalToman > 0n) {
    fields.push({ labelFa: 'جمع تخفیف', value: fa(order.discountTotalToman) + ' تومان' });
    for (const discount of discounts) {
      fields.push({
        labelFa: DISCOUNT_KIND_FA[discount.kind as DiscountKind] ?? 'تخفیف',
        value: discount.labelFa + ' — ' + fa(discount.amountToman) + ' تومان',
      });
    }
  }
  fields.push({ labelFa: 'مبلغ پرداخت‌شده', value: fa(order.grandTotalToman) + ' تومان' });

  return {
    titleFa: 'فاکتور خرید از فروشگاه همزیست',
    subtitleFa: 'این برگه گزارش همزیست از این خرید است و سند مالیاتی نیست.',
    identifierLabelFa: 'شماره سفارش',
    identifier: order.reference,
    fields,
    table: {
      captionFa: 'اقلام سفارش',
      headersFa: ['کالا', 'فروشنده', 'تعداد', 'قیمت واحد (تومان)', 'جمع (تومان)'],
      rows,
    },
    footerFa:
      'صادرشده از همزیست در ' +
      new Date().toLocaleDateString('fa-IR') +
      '. مبلغ‌ها به تومان و بر اساس همان چیزی است که هنگام خرید ثبت شده است.',
  };
}

/** The invoice as a PDF, recorded as taken because a download of somebody's purchase is a read worth keeping. */
export async function invoicePdf(
  database: Database,
  actor: Actor,
  orderId: string,
): Promise<Uint8Array> {
  const spec = await invoiceSpec(database, actor, orderId);
  const bytes = await renderDocumentPdf(spec);
  await recordAudit(database, actor, {
    action: 'COMMERCE_INVOICE_DOWNLOADED',
    targetType: 'COMMERCE_ORDER',
    targetId: orderId,
    after: { reference: spec.identifier },
  });
  return bytes;
}
