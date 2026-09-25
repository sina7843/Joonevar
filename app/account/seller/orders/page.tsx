import Link from 'next/link';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { db } from '../../../../src/db/client.ts';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { Alert } from '../../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { myStores } from '../../../../src/commerce/sellers.ts';
import { sellerOrders } from '../../../../src/commerce/orders.ts';
import { SUB_ORDER_STATUS_FA, type SubOrderStatus } from '../../../../src/commerce/order-model.ts';
import { SubOrderMoveForm } from '../../../../src/commerce/order-forms.tsx';
import { moveAsSellerAction } from '../../orders/actions.ts';

export const dynamic = 'force-dynamic';

const fa = (value: number | bigint): string => value.toLocaleString('fa-IR');

/**
 * A shop's own queue — PROMPT-010.
 *
 * Each row is one sub-order: what was bought from this shop, what this shop
 * is owed for it, and the name, telephone and address the parcel goes to.
 * What else was in the buyer's basket, which other shops were in it and what
 * the whole order came to are not here, because none of that is needed to
 * send a parcel.
 */
export default async function SellerOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const guard = await guardRoute('/account/seller/orders');
  if (!guard.ok) throw guard.denied;

  const stores = await myStores(db(), guard.actor);
  const requested = String((await searchParams).store ?? '');
  const store = stores.find((row) => row.id === requested) ?? stores[0] ?? null;

  if (store === null) {
    return (
      <div className="space-y-lg">
        <h1 className="text-h2">سفارش‌های فروشگاه</h1>
        <p className="text-body-sm text-text-secondary" data-testid="seller-orders-no-store">
          هنوز فروشگاهی ندارید.
        </p>
      </div>
    );
  }

  const orders = await sellerOrders(db(), guard.actor, store.id);

  return (
    <PublicShell actor={guard.actor} title="سفارش‌های فروشگاه" pathname="/account/seller">
      <div className="space-y-lg p-lg">
      <h1 className="text-h2">سفارش‌های {store.displayNameFa ?? 'فروشگاه'}</h1>

      {stores.length > 1 ? (
        <nav className="hz-rail flex gap-sm" data-testid="seller-order-stores">
          {stores.map((row) => (
            <Link
              key={row.id}
              href={'/account/seller/orders?store=' + row.id}
              className="whitespace-nowrap rounded-full border border-border-subtle px-md py-2xs text-caption"
            >
              {row.displayNameFa ?? 'فروشگاه'}
            </Link>
          ))}
        </nav>
      ) : null}

      <Alert tone="info" title="اطلاعات خریدار فقط برای ارسال همین زیرسفارش در اختیار شماست">
        <span data-testid="seller-privacy-note">
          نام، تلفن و نشانی گیرنده برای تحویل کالا نمایش داده می‌شود. بقیه سبد خرید و خریدهای او از فروشگاه‌های
          دیگر در دسترس شما نیست.
        </span>
      </Alert>

      {orders.length === 0 ? (
        <p className="text-body-sm text-text-secondary" data-testid="seller-orders-empty">
          هنوز سفارشی برای این فروشگاه ثبت نشده است.
        </p>
      ) : (
        <ul className="space-y-lg" data-testid="seller-orders">
          {orders.map((row) => (
            <li
              key={row.subOrder.id}
              className="space-y-md rounded-lg border border-border-subtle p-lg"
              data-testid={'seller-suborder-' + row.subOrder.id}
            >
              <header className="flex flex-wrap items-center justify-between gap-sm">
                <h2 className="text-label-lg" data-testid={'seller-ref-' + row.subOrder.id}>
                  {row.subOrder.reference}
                </h2>
                <StatusBadge tone={row.subOrder.status === 'DELIVERED' ? 'success' : 'neutral'}>
                  <span data-testid={'seller-state-' + row.subOrder.id}>
                    {SUB_ORDER_STATUS_FA[row.subOrder.status as SubOrderStatus]}
                  </span>
                </StatusBadge>
              </header>

              <ul className="space-y-2xs text-body-sm" data-testid={'seller-items-' + row.subOrder.id}>
                {row.items.map((item) => (
                  <li key={item.id}>
                    {item.productNameFa}
                    {item.variantLabelFa ? ' — ' + item.variantLabelFa : ''} ({item.skuCode}) × {fa(item.quantity)}
                  </li>
                ))}
              </ul>

              <dl className="grid gap-2xs text-body-sm" data-testid={'seller-money-' + row.subOrder.id}>
                <div className="flex justify-between">
                  <dt>مبلغ پرداختی خریدار برای این زیرسفارش</dt>
                  <dd>{fa(row.subOrder.buyerTotalToman)} تومان</dd>
                </div>
                <div className="flex justify-between">
                  <dt>کارمزد همزیست ({fa(row.subOrder.commissionPercentBp / 100)}٪)</dt>
                  <dd>{fa(row.subOrder.commissionToman)} تومان</dd>
                </div>
                <div className="flex justify-between text-label-sm">
                  <dt>سهم شما</dt>
                  <dd data-testid={'seller-payout-' + row.subOrder.id}>{fa(row.subOrder.payoutToman)} تومان</dd>
                </div>
              </dl>

              <section className="space-y-2xs">
                <h3 className="text-label-sm">گیرنده</h3>
                <p className="text-body-sm" data-testid={'seller-contact-' + row.subOrder.id}>
                  {row.contact.recipientNameFa} — {row.contact.recipientPhone}
                  <br />
                  {[row.contact.provinceFa, row.contact.cityFa].filter(Boolean).join('، ')} {row.contact.addressFa}
                  {row.contact.postalCode ? ' — کد پستی ' + row.contact.postalCode : ''}
                </p>
                {row.contact.noteFa ? (
                  <p className="text-caption text-text-secondary">توضیح خریدار: {row.contact.noteFa}</p>
                ) : null}
              </section>

              {row.subOrder.acceptanceDueAt && row.subOrder.status === 'PAID' ? (
                <p className="text-caption text-text-danger" data-testid={'seller-due-' + row.subOrder.id}>
                  مهلت پذیرش: {row.subOrder.acceptanceDueAt.toLocaleString('fa-IR')} — پس از آن این زیرسفارش
                  به‌صورت خودکار لغو و مبلغش بازگردانده می‌شود.
                </p>
              ) : null}

              <SubOrderMoveForm
                action={moveAsSellerAction}
                subOrderId={row.subOrder.id}
                moves={row.moves}
                testPrefix="seller-move"
              />
            </li>
          ))}
        </ul>
      )}
      </div>
    </PublicShell>
  );
}
