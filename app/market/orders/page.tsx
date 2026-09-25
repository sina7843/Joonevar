import Link from 'next/link';
import { OpsShell, marketNav } from '../../../src/ui/shell.tsx';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { Alert } from '../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { operatorOrders, expireUnacceptedSubOrders } from '../../../src/commerce/orders.ts';
import { ORDER_STATUS_FA, type OrderStatus } from '../../../src/commerce/order-model.ts';

export const dynamic = 'force-dynamic';

const fa = (value: number | bigint): string => value.toLocaleString('fa-IR');

/**
 * The shop's orders, for the people who answer for them — PROMPT-010.
 *
 * Reading is all this does. Moving a sub-order happens on the record itself,
 * where the reason has to be written down, and the money rails — refunds and
 * settlement — are their own screens with their own capability.
 */
export default async function MarketOrdersPage() {
  const guard = await guardRoute('/market/orders');
  if (!guard.ok) throw guard.denied;

  const rows = await operatorOrders(db(), guard.actor);
  // Sub-orders nobody answered are swept when this queue is read, so an
  // operator opening it never sees a deadline that passed days ago still
  // counting: nothing in the product runs on a timer.
  const expired = await expireUnacceptedSubOrders(db());

  return (
    <OpsShell actor={guard.actor} title="سفارش‌های فروشگاه کالا" nav={marketNav(guard.actor)} pathname="/market/orders">
      <div className="space-y-lg p-lg">
      <h1 className="text-h2">سفارش‌های فروشگاه کالا</h1>

      {expired > 0 ? (
        <Alert tone="info" title="زیرسفارش‌های بی‌پاسخ لغو شدند">
          <span data-testid="orders-expired-note">
            {fa(expired)} زیرسفارش که در مهلت پذیرش بی‌پاسخ مانده بود لغو شد و مبلغش برای بازپرداخت ثبت شد.
          </span>
        </Alert>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-body-sm text-text-secondary" data-testid="market-orders-empty">
          هنوز سفارشی ثبت نشده است.
        </p>
      ) : (
        <ul className="space-y-sm" data-testid="market-orders">
          {rows.map((row) => (
            <li
              key={row.order.id}
              className="flex flex-wrap items-center justify-between gap-sm rounded-lg border border-border-subtle p-lg"
              data-testid={'market-order-' + row.order.id}
            >
              <div className="space-y-2xs">
                <Link
                  href={'/account/orders/' + row.order.id}
                  className="text-text-brand text-body-sm"
                  data-testid={'market-order-link-' + row.order.id}
                >
                  {row.order.reference}
                </Link>
                <p className="text-caption text-text-secondary">
                  {row.order.createdAt.toLocaleDateString('fa-IR')} — {fa(row.order.grandTotalToman)} تومان —{' '}
                  {fa(Number(row.subOrders))} فروشگاه
                </p>
              </div>
              <StatusBadge tone={row.order.status === 'PAID' ? 'success' : 'neutral'}>
                <span data-testid={'market-order-status-' + row.order.id}>
                  {ORDER_STATUS_FA[row.order.status as OrderStatus]}
                </span>
              </StatusBadge>
            </li>
          ))}
        </ul>
      )}
      </div>
    </OpsShell>
  );
}
