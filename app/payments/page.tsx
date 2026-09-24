import Link from 'next/link';
import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { PublicShell } from '../../src/ui/shell.tsx';
import { Card } from '../../src/ui/card.tsx';
import { EmptyState } from '../../src/ui/states.tsx';
import { StatusBadge } from '../../src/ui/status.tsx';
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
 * Everything this account has paid for — Phase 2.5 §9 (PROMPT-015).
 *
 * Until now a payment could only be read one batch at a time, from inside the
 * flow that made it, so there was nowhere to answer "what did I pay, and did it
 * go through". Only the account's own payments are listed; the filter is the
 * account id, not a parameter.
 */
export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const guard = await guardRoute('/payments');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const raw = (await searchParams).page;
  const requested = Number(Array.isArray(raw) ? raw[0] : raw);
  const page = Number.isInteger(requested) && requested >= 1 ? requested : 1;
  const result = await myPayments(db(), guard.actor, { page, pageSize: 20 });

  return (
    <PublicShell actor={guard.actor} title="پرداخت‌ها و رسیدها" pathname="/payments">
      <div className="space-y-lg">
        <Card>
          <h1 className="text-h4">پرداخت‌ها و رسیدها</h1>
          <p className="mt-xs text-body-sm text-text-secondary">
            هر پرداخت با مبلغی که در لحظه شروع آن قفل شده ثبت می‌شود. پرداخت وقتی «پرداخت‌شده» است که سرور آن را با درگاه تأیید کرده باشد، نه وقتی مرورگر از درگاه برگشته باشد.
          </p>
        </Card>

        {result.items.length === 0 ? (
          <EmptyState title="هنوز پرداختی ثبت نشده است" description="پرداخت‌های شما پس از شروع، همین‌جا با وضعیت و رسیدشان دیده می‌شوند." />
        ) : (
          <ul className="space-y-sm" data-testid="payment-list">
            {result.items.map((line) => (
              <li key={line.batchId}>
                <Link
                  href={'/payments/' + line.batchId}
                  className="block rounded-lg border border-border-subtle bg-bg-surface p-lg hover:border-border-brand"
                  data-testid={'payment-' + line.batchId}
                >
                  <div className="flex flex-wrap items-start justify-between gap-sm">
                    <div className="min-w-0">
                      <p className="text-label-lg">{line.serviceFa}</p>
                      <p className="mt-2xs text-caption text-text-secondary">{formatInstantFa(line.createdAt)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-xs">
                      <span className="text-body-sm">{fa(line.totalToman) + ' تومان'}</span>
                      <StatusBadge tone={TONE[line.status] ?? 'neutral'}>{line.statusFa}</StatusBadge>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {result.totalPages > 1 ? (
          <nav aria-label="صفحه‌بندی پرداخت‌ها" className="flex items-center justify-between gap-md">
            {result.page > 1 ? (
              <Link href={'/payments?page=' + (result.page - 1)} className="text-body-sm text-text-brand">
                صفحه قبل
              </Link>
            ) : (
              <span />
            )}
            <span className="text-body-sm text-text-secondary">{'صفحه ' + fa(result.page) + ' از ' + fa(result.totalPages)}</span>
            {result.page < result.totalPages ? (
              <Link href={'/payments?page=' + (result.page + 1)} className="text-body-sm text-text-brand">
                صفحه بعد
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </div>
    </PublicShell>
  );
}
