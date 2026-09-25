import Link from 'next/link';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { db } from '../../../../src/db/client.ts';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { myStores } from '../../../../src/commerce/sellers.ts';
import { financeFor } from '../../../../src/commerce/ledger.ts';
import {
  CADENCE_FA,
  LEDGER_BUCKET_FA,
  LEDGER_KIND_FA,
  PAYOUT_BLOCKER_FA,
  SETTLEMENT_STATUS_FA,
  type Cadence,
  type LedgerBucket,
  type LedgerKind,
  type PayoutBlocker,
  type SettlementStatus,
} from '../../../../src/commerce/fulfilment-model.ts';
import { CadenceForm } from '../../../../src/commerce/finance-forms.tsx';
import { requestCadenceAction } from '../../orders/finance-actions.ts';

export const dynamic = 'force-dynamic';

const fa = (value: number | bigint): string => value.toLocaleString('fa-IR');

/**
 * One shop's own money — PROMPT-011.
 *
 * Four balances, every one of them the sum of the entries below it rather
 * than a number anybody wrote, so any figure here can be traced to the event
 * that made it.
 */
export default async function SellerFinancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const guard = await guardRoute('/account/seller/finance');
  if (!guard.ok) throw guard.denied;

  const stores = await myStores(db(), guard.actor);
  const requested = String((await searchParams).store ?? '');
  const store = stores.find((row) => row.id === requested) ?? stores[0] ?? null;
  if (store === null) {
    return (
      <PublicShell actor={guard.actor} title="مالی فروشگاه" pathname="/account/seller">
        <div className="space-y-lg p-lg">
          <p className="text-body-sm text-text-secondary" data-testid="finance-no-store">
            هنوز فروشگاهی ندارید.
          </p>
        </div>
      </PublicShell>
    );
  }

  const view = await financeFor(db(), guard.actor, store.id);

  return (
    <PublicShell actor={guard.actor} title="مالی فروشگاه" pathname="/account/seller">
      <div className="space-y-lg p-lg">
        <p className="text-caption">
          <Link href="/account/seller" className="text-text-brand" data-testid="back-to-store">
            بازگشت به فروشگاه من
          </Link>
        </p>

        <Card>
          <h2 className="text-label-lg">موجودی‌ها</h2>
          <p className="mt-2xs text-caption text-text-secondary" data-testid="balances-note">
            هیچ‌کدام از این عددها جایی نوشته نشده‌اند؛ هرکدام جمع ردیف‌های دفتر زیر است.
          </p>
          <dl className="mt-md grid gap-sm md:grid-cols-4" data-testid="balances">
            {(['PENDING', 'HELD', 'AVAILABLE', 'DEBT'] as LedgerBucket[]).map((bucket) => (
              <div key={bucket} className="rounded-md border border-border-subtle p-md">
                <dt className="text-caption text-text-secondary">{LEDGER_BUCKET_FA[bucket]}</dt>
                <dd className="text-label-lg" data-testid={'balance-' + bucket}>
                  {fa(view.balances[bucket])} تومان
                </dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card>
          <h2 className="text-label-lg">تسویه</h2>
          <p className="mt-2xs text-body-sm" data-testid="settlement-preview">
            دوره فعلی: {CADENCE_FA[view.preview.cadence as Cadence]} — پایان دوره جاری{' '}
            {view.preview.periodEnd.toLocaleDateString('fa-IR')} — قابل واریز {fa(view.preview.payoutToman)} تومان
          </p>
          {view.preview.blockers.length > 0 ? (
            <Alert tone="info" title="در حال حاضر تسویه انجام نمی‌شود">
              <ul data-testid="settlement-blockers">
                {view.preview.blockers.map((blocker) => (
                  <li key={blocker} className="text-body-sm">
                    {PAYOUT_BLOCKER_FA[blocker as PayoutBlocker] ?? blocker}
                  </li>
                ))}
              </ul>
            </Alert>
          ) : null}
          {view.accountLocked ? (
            <Alert tone="warning" title="حساب بانکی تا پایان تسویه جاری قفل است">
              <span data-testid="account-locked">
                تا ثبت واریز و مغایرت‌گیری دسته باز، تغییر شماره شبا ممکن نیست.
              </span>
            </Alert>
          ) : null}
          <div className="mt-lg">
            <CadenceForm
              action={requestCadenceAction}
              sellerId={store.id}
              current={view.preview.cadence}
            />
          </div>
        </Card>

        <Card>
          <h2 className="text-label-lg">دسته‌های تسویه</h2>
          {view.batches.length === 0 ? (
            <p className="mt-2xs text-caption text-text-secondary" data-testid="batches-empty">
              هنوز دسته تسویه‌ای ساخته نشده است.
            </p>
          ) : (
            <ul className="mt-md space-y-sm" data-testid="batches">
              {view.batches.map((batch) => (
                <li
                  key={batch.id}
                  className="flex flex-wrap items-center justify-between gap-sm text-body-sm"
                  data-testid={'batch-' + batch.id}
                >
                  <span>
                    {batch.reference} — {fa(batch.totalToman)} تومان
                    {batch.bankReference ? ' — پیگیری ' + batch.bankReference : ''}
                  </span>
                  <StatusBadge tone={batch.status === 'RECONCILED' ? 'success' : 'neutral'}>
                    <span data-testid={'batch-status-' + batch.id}>
                      {SETTLEMENT_STATUS_FA[batch.status as SettlementStatus]}
                    </span>
                  </StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="text-label-lg">دفتر مالی</h2>
          {view.entries.length === 0 ? (
            <p className="mt-2xs text-caption text-text-secondary" data-testid="ledger-empty">
              هنوز ردیفی در دفتر مالی این فروشگاه ثبت نشده است.
            </p>
          ) : (
            <ul className="mt-md space-y-2xs text-body-sm" data-testid="ledger">
              {view.entries.map((entry) => (
                <li key={entry.id} data-testid={'ledger-entry-' + entry.id}>
                  {entry.createdAt.toLocaleDateString('fa-IR')} — {LEDGER_BUCKET_FA[entry.bucket as LedgerBucket]} —{' '}
                  {LEDGER_KIND_FA[entry.kind as LedgerKind]} — {fa(entry.amountToman)} تومان — {entry.descriptionFa}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PublicShell>
  );
}
