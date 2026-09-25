import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import Link from 'next/link';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { myOrders } from '../../../src/commerce/cart.ts';
import { ORDER_STATUS_FA, type OrderStatus } from '../../../src/commerce/order-model.ts';

export const dynamic = 'force-dynamic';

const fa = (value: number | bigint): string => value.toLocaleString('fa-IR');

const TONE: Record<OrderStatus, 'success' | 'warning' | 'neutral'> = {
  PENDING_PAYMENT: 'warning',
  PAID: 'success',
  CANCELLED: 'neutral',
  REFUNDED: 'neutral',
};

/** Everything this person has ordered from the shop — PROMPT-010. */
export default async function MyOrdersPage() {
  const guard = await guardRoute('/account/orders');
  if (!guard.ok) throw guard.denied;
  const orders = await myOrders(db(), guard.actor);

  return (
    <PublicShell actor={guard.actor} title="سفارش‌های فروشگاه" pathname="/account/orders">
      <div className="space-y-lg p-lg">
      <h1 className="text-h2">سفارش‌های فروشگاه</h1>
      {orders.length === 0 ? (
        <p className="text-body-sm text-text-secondary" data-testid="orders-empty">
          هنوز سفارشی ثبت نکرده‌اید.
        </p>
      ) : (
        <ul className="space-y-md" data-testid="orders-list">
          {orders.map((order) => (
            <li
              key={order.id}
              className="flex flex-wrap items-center justify-between gap-sm rounded-lg border border-border-subtle p-lg"
              data-testid={'order-row-' + order.id}
            >
              <div className="space-y-2xs">
                <Link
                  href={'/account/orders/' + order.id}
                  className="text-text-brand text-body-sm"
                  data-testid={'order-link-' + order.id}
                >
                  {order.reference}
                </Link>
                <p className="text-caption text-text-secondary">
                  {order.createdAt.toLocaleDateString('fa-IR')} — {fa(order.grandTotalToman)} تومان
                </p>
              </div>
              <StatusBadge tone={TONE[order.status as OrderStatus]}>
                <span data-testid={'order-status-' + order.id}>{ORDER_STATUS_FA[order.status as OrderStatus]}</span>
              </StatusBadge>
            </li>
          ))}
        </ul>
      )}
      </div>
    </PublicShell>
  );
}
