import Link from 'next/link';
import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { PublicShell } from '../../src/ui/shell.tsx';
import { EmptyState } from '../../src/ui/states.tsx';
import { StatusBadge } from '../../src/ui/status.tsx';
import { PageHeader } from '../../src/ui/section-header.tsx';
import { Pagination } from '../../src/ui/pagination.tsx';
import { db } from '../../src/db/client.ts';
import { myPayments } from '../../src/billing/receipts.ts';
import { formatInstantFa } from '../../src/content/model.ts';

export const dynamic = 'force-dynamic';

const fa = (value: bigint | number): string => value.toLocaleString('fa-IR');

const TONE: Record<string, 'success' | 'warning' | 'neutral' | 'error'> = {
  PAID: 'success',
  AWAITING_PAYMENT: 'warning',
  DRAFT: 'neutral',
  FAILED: 'error',
  CANCELLED: 'neutral',
};

/**
 * Everything this account has paid for — Phase 2.5 §9 (PROMPT-015), P05
 * DataTable with PaymentRow cells, restacked as cards below 768.
 *
 * Only the account's own payments are listed; the filter is the account id,
 * not a parameter.
 */
export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const guard = await guardRoute('/payments');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const raw = (await searchParams).page;
  const requested = Number(Array.isArray(raw) ? raw[0] : raw);
  const page = Number.isInteger(requested) && requested >= 1 ? requested : 1;
  const result = await myPayments(db(), guard.actor, { page, pageSize: 20 });

  return (
    <PublicShell
      actor={guard.actor}
      title="پرداخت‌ها و رسیدها"
      pathname="/payments"
      header={
        <PageHeader title="پرداخت‌ها و رسیدها" meta={result.total > 0 ? [fa(result.total) + ' پرداخت'] : undefined} />
      }
    >
      <p className="text-body-sm text-text-secondary">
        هر پرداخت با مبلغی که در لحظه شروع آن قفل شده ثبت می‌شود. پرداخت وقتی «پرداخت‌شده» است که سرور آن را با درگاه
        تأیید کرده باشد، نه وقتی مرورگر از درگاه برگشته باشد.
      </p>

      {result.items.length === 0 ? (
        <EmptyState
          title="هنوز پرداختی ثبت نشده است"
          description="پرداخت‌های شما پس از شروع، همین‌جا با وضعیت و رسیدشان دیده می‌شوند."
        />
      ) : (
        <div className="hz-table-wrap" data-testid="payment-list">
          <table className="hz-table hz-table--stack">
            <caption className="hz-visually-hidden">پرداخت‌های من</caption>
            <thead>
              <tr>
                <th scope="col">خدمت</th>
                <th scope="col">کد پیگیری درگاه</th>
                <th scope="col" className="hz-num">
                  مبلغ
                </th>
                <th scope="col">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((line) => (
                <tr key={line.batchId}>
                  <td className="hz-table__lead">
                    <span className="hz-payment">
                      <Link
                        href={'/payments/' + line.batchId}
                        className="hz-case__name hz-payment__service"
                        data-testid={'payment-' + line.batchId}
                      >
                        {line.serviceFa}
                      </Link>
                      <span className="hz-payment__date">{formatInstantFa(line.createdAt)}</span>
                    </span>
                  </td>
                  <td data-label="کد پیگیری درگاه">
                    {line.providerRef ? (
                      <bdi className="hz-id hz-payment__id" dir="ltr">
                        {line.providerRef}
                      </bdi>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td data-label="مبلغ" className="hz-num hz-payment__amount">
                    {fa(line.totalToman) + ' تومان'}
                  </td>
                  <td data-label="وضعیت">
                    <StatusBadge size="sm" tone={TONE[line.status] ?? 'neutral'}>
                      {line.statusFa}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        totalPages={result.totalPages}
        hrefFor={(n) => '/payments?page=' + n}
        label="صفحه‌بندی پرداخت‌ها"
      />
    </PublicShell>
  );
}
