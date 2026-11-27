import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import Link from 'next/link';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { PageHeader } from '../../../src/ui/section-header.tsx';
import { ButtonLink } from '../../../src/ui/button.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { Icon } from '../../../src/ui/icon.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { myOrders } from '../../../src/commerce/cart.ts';
import { type OrderStatus } from '../../../src/commerce/order-model.ts';

export const dynamic = 'force-dynamic';

const fa = (value: number | bigint): string => value.toLocaleString('fa-IR');

/**
 * Everything this person has ordered from the shop — PROMPT-010. P05: one
 * DataTable that restacks as the card list below 768 (same row markup, so a
 * row and its link exist once).
 */
export default async function MyOrdersPage() {
  const guard = await guardRoute('/account/orders');
  if (!guard.ok) throw guard.denied;
  const orders = await myOrders(db(), guard.actor);

  return (
    <PublicShell
      actor={guard.actor}
      title="سفارش‌های فروشگاه"
      pathname="/account/orders"
      header={
        <PageHeader
          title="سفارش‌های فروشگاه"
          back={{ href: '/dashboard' }}
          meta={orders.length > 0 ? [fa(orders.length) + ' سفارش'] : undefined}
        />
      }
    >
      {orders.length === 0 ? (
        <div data-testid="orders-empty">
          <EmptyState
            icon="shoppingBag"
            title="هنوز سفارشی ثبت نکرده‌اید."
            description="سفارش‌های فروشگاه پس از پرداخت سبد خرید اینجا می‌آیند."
            action={
              <ButtonLink tone="secondary" href="/shop">
                رفتن به فروشگاه
              </ButtonLink>
            }
          />
        </div>
      ) : (
        <div className="hz-table-wrap">
          <table className="hz-table hz-table--stack" data-testid="orders-list">
            <caption className="hz-visually-hidden">سفارش‌های فروشگاه</caption>
            <thead>
              <tr>
                <th scope="col">سفارش</th>
                <th scope="col">وضعیت</th>
                <th scope="col">اقدام بعدی با</th>
                <th scope="col" className="hz-num">
                  مبلغ
                </th>
                <th scope="col">
                  <span className="hz-visually-hidden">باز کردن</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const status = order.status as OrderStatus;
                return (
                  <tr key={order.id} data-testid={'order-row-' + order.id}>
                    <td className="hz-table__lead">
                      <div className="hz-case">
                        <Link className="hz-case__name" href={'/account/orders/' + order.id} data-testid={'order-link-' + order.id}>
                          <bdi dir="ltr">{order.reference}</bdi>
                        </Link>
                        <span className="hz-case__sub">{order.createdAt.toLocaleDateString('fa-IR-u-ca-persian')}</span>
                      </div>
                    </td>
                    <td data-label="وضعیت">
                      <span data-testid={'order-status-' + order.id}>
                        <StatusBadge status={status} size="sm" />
                      </span>
                    </td>
                    <td data-label="اقدام بعدی با">
                      {status === 'PENDING_PAYMENT' ? (
                        <span className="hz-owner hz-owner--inline hz-owner--you">
                          <span className="hz-owner__who">شما</span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td data-label="مبلغ" className="hz-num">
                      {fa(order.grandTotalToman) + ' تومان'}
                    </td>
                    <td className="hz-table__open">
                      <Link
                        className="hz-icon-btn hz-icon-btn--sm"
                        href={'/account/orders/' + order.id}
                        aria-label={'مشاهده سفارش ' + order.reference}
                        tabIndex={-1}
                      >
                        <Icon name="caretRight" size="sm" mirror />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PublicShell>
  );
}
