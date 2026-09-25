import { OpsShell, marketNav } from '../../../src/ui/shell.tsx';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { analyticsFor } from '../../../src/analytics/service.ts';
import { cellFa, type RedactedBreakdown } from '../../../src/analytics/metrics.ts';

export const dynamic = 'force-dynamic';

const fa = (value: number | bigint): string => value.toLocaleString('fa-IR');
const pct = (value: number | null): string => (value === null ? '—' : fa(value) + '٪');

function Breakdown({
  titleFa,
  rows,
  testId,
}: {
  titleFa: string;
  rows: readonly RedactedBreakdown[];
  testId: string;
}) {
  return (
    <div>
      <h3 className="text-label-sm">{titleFa}</h3>
      {rows.length === 0 ? (
        <p className="mt-2xs text-caption text-text-secondary">—</p>
      ) : (
        <ul className="mt-2xs space-y-2xs text-body-sm" data-testid={testId}>
          {rows.map((row) => (
            <li key={row.labelFa}>
              {row.labelFa}: {cellFa(row)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * What the marketplace did — PROMPT-013.
 *
 * Aggregates only. A breakdown small enough to be about one identifiable
 * person reads as «کمتر از حد نمایش» rather than as a number, because a
 * province with one sale in it is not a statistic — it is a fact about
 * somebody, and this screen's capability is not the one that may see it.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const guard = await guardRoute('/market/analytics');
  if (!guard.ok) throw guard.denied;
  const days = Number(String((await searchParams).days ?? '30')) || 30;
  const view = await analyticsFor(db(), guard.actor, { sinceDays: days });

  return (
    <OpsShell actor={guard.actor} title="گزارش‌ها" nav={marketNav(guard.actor)} pathname="/market/analytics">
      <div className="space-y-lg p-lg">
        <Alert tone="info" title="این صفحه فقط جمع و شمار نشان می‌دهد">
          <span data-testid="analytics-privacy-note">
            تفکیکی که کمتر از {fa(view.minimumCohort)} رکورد داشته باشد با «کمتر از حد نمایش» نشان داده می‌شود؛
            نام، شماره و نشانی در این صفحه نمی‌آید.
          </span>
        </Alert>

        <Card>
          <h2 className="text-label-lg">فروشگاه کالا</h2>
          <dl className="mt-md grid gap-sm md:grid-cols-4" data-testid="analytics-shop">
            <div>
              <dt className="text-caption text-text-secondary">ارزش سفارش‌ها</dt>
              <dd className="text-label-lg" data-testid="analytics-gmv">
                {fa(view.shop.gmv.totalToman)} تومان
              </dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">تعداد سفارش</dt>
              <dd className="text-label-lg" data-testid="analytics-orders">
                {fa(view.shop.gmv.count)}
              </dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">میانگین سفارش</dt>
              <dd className="text-label-lg">{fa(view.shop.gmv.averageToman)} تومان</dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">کارمزد همزیست</dt>
              <dd className="text-label-lg" data-testid="analytics-commission">
                {fa(view.shop.commissionToman)} تومان
              </dd>
            </div>
          </dl>
          <p className="mt-md text-body-sm" data-testid="analytics-returns">
            مرجوعی: {fa(view.shop.returns.count)} — بازپرداخت {fa(view.shop.returns.refundedToman)} تومان — نرخ{' '}
            {pct(view.shop.returns.rate)} از تحویل‌شده‌ها
          </p>
          <div className="mt-md">
            <Breakdown titleFa="وضعیت زیرسفارش‌ها" rows={view.shop.subOrders} testId="analytics-suborders" />
          </div>
        </Card>

        <Card>
          <h2 className="text-label-lg">بازار حیوان</h2>
          <dl className="mt-md grid gap-sm md:grid-cols-3" data-testid="analytics-animals">
            <div>
              <dt className="text-caption text-text-secondary">ارزش معامله‌های کامل‌شده</dt>
              <dd className="text-label-lg" data-testid="analytics-deals">
                {fa(view.animals.deals.totalToman)} تومان
              </dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">بیعانه‌های دریافتی</dt>
              <dd className="text-label-lg">{fa(view.animals.depositsToman)} تومان</dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">بازپرداخت‌ها</dt>
              <dd className="text-label-lg">{fa(view.animals.refundsToman)} تومان</dd>
            </div>
          </dl>

          <h3 className="mt-lg text-label-sm">قیف معامله</h3>
          <ul className="mt-2xs space-y-2xs text-body-sm" data-testid="analytics-funnel">
            {view.animals.funnel.map((step) => (
              <li key={step.labelFa}>
                {step.labelFa}: {fa(step.count)}
                {step.ofPrevious !== null ? ' — ' + pct(step.ofPrevious) + ' از مرحله قبل' : ''}
                {step.ofTop !== null ? ' — ' + pct(step.ofTop) + ' از آغاز' : ''}
              </li>
            ))}
          </ul>

          <div className="mt-lg grid gap-lg md:grid-cols-3">
            <Breakdown titleFa="به تفکیک گونه" rows={view.animals.bySpecies} testId="analytics-species" />
            <Breakdown titleFa="به تفکیک نژاد" rows={view.animals.byBreed} testId="analytics-breed" />
            <Breakdown titleFa="به تفکیک استان" rows={view.animals.byProvince} testId="analytics-province" />
          </div>
        </Card>

        <Card>
          <h2 className="text-label-lg">گزارش‌ها و moderation</h2>
          <div className="mt-md">
            <Breakdown titleFa="نتیجه گزارش‌ها" rows={view.moderation} testId="analytics-reports" />
          </div>
        </Card>

        <Card>
          <h2 className="text-label-lg">مالی فروشندگان</h2>
          <dl className="mt-md grid gap-sm md:grid-cols-4" data-testid="analytics-balances">
            <div>
              <dt className="text-caption text-text-secondary">در جریان</dt>
              <dd className="text-label-lg">{fa(view.sellers.balances.pendingToman)} تومان</dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">نگه‌داشته</dt>
              <dd className="text-label-lg">{fa(view.sellers.balances.heldToman)} تومان</dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">قابل تسویه</dt>
              <dd className="text-label-lg">{fa(view.sellers.balances.availableToman)} تومان</dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">بدهی</dt>
              <dd className="text-label-lg">{fa(view.sellers.balances.debtToman)} تومان</dd>
            </div>
          </dl>
          <p className="mt-md text-body-sm" data-testid="analytics-settlements">
            تسویه‌های واریزشده: {fa(view.sellers.settlements.count)} — جمع {fa(view.sellers.settlements.paidToman)}{' '}
            تومان
          </p>
        </Card>

        <Card>
          <h2 className="text-label-lg">تبلیغ</h2>
          <p className="mt-sm text-body-sm" data-testid="analytics-advertising">
            بسته‌های خریداری‌شده: {fa(view.advertising.promotions)} — فعال در این لحظه:{' '}
            {fa(view.advertising.activeNow)}
          </p>
        </Card>
      </div>
    </OpsShell>
  );
}
