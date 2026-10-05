import Link from 'next/link';
import { OpsShell, marketNav } from '../../../src/ui/shell.tsx';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { Alert } from '../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { QueueMeta } from '../../../src/ui/desk.tsx';
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
 *
 * DS P09 table (cards below 768); money end-aligned in تومان.
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
      <QueueMeta total={rows.length} noun="سفارش" />

      {expired > 0 ? (
        <Alert tone="info" title="زیرسفارش‌های بی‌پاسخ لغو شدند">
          <span data-testid="orders-expired-note">
            {fa(expired)} زیرسفارش که در مهلت پذیرش بی‌پاسخ مانده بود لغو شد و مبلغش برای بازپرداخت ثبت شد.
          </span>
        </Alert>
      ) : null}

      {rows.length === 0 ? (
        <div data-testid="market-orders-empty">
          <EmptyState title="هنوز سفارشی ثبت نشده است" description="هر سفارشی که پس از پرداخت ثبت شود، اینجا می‌آید." />
        </div>
      ) : (
        <div className="hz-table-wrap">
          <table className="hz-table hz-table--dense hz-table--stack">
            <caption className="hz-visually-hidden">سفارش‌های فروشگاه کالا</caption>
            <thead>
              <tr>
                <th scope="col">کد سفارش</th>
                <th scope="col">تاریخ</th>
                <th scope="col">فروشگاه‌ها</th>
                <th scope="col" className="text-end">
                  مبلغ
                </th>
                <th scope="col">وضعیت</th>
              </tr>
            </thead>
            <tbody data-testid="market-orders">
              {rows.map((row) => (
                <tr key={row.order.id} data-testid={'market-order-' + row.order.id}>
                  <td className="hz-table__lead">
                    <Link
                      href={'/account/orders/' + row.order.id}
                      className="hz-case__name"
                      data-testid={'market-order-link-' + row.order.id}
                    >
                      <bdi dir="ltr">{row.order.reference}</bdi>
                    </Link>
                  </td>
                  <td data-label="تاریخ">{row.order.createdAt.toLocaleDateString('fa-IR')}</td>
                  <td data-label="فروشگاه‌ها">{fa(Number(row.subOrders))}</td>
                  <td data-label="مبلغ" className="hz-num text-end">
                    {fa(row.order.grandTotalToman)} تومان
                  </td>
                  <td data-label="وضعیت">
                    <StatusBadge tone={row.order.status === 'PAID' ? 'success' : 'neutral'} size="sm">
                      <span data-testid={'market-order-status-' + row.order.id}>
                        {ORDER_STATUS_FA[row.order.status as OrderStatus]}
                      </span>
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </OpsShell>
  );
}
