import { OpsShell, marketNav } from '../../../src/ui/shell.tsx';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { Panel, StatTiles } from '../../../src/ui/desk.tsx';
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
    <div className="min-w-0">
      <h3 className="text-label-md">{titleFa}</h3>
      {rows.length === 0 ? (
        <p className="mt-2xs text-caption text-text-secondary">—</p>
      ) : (
        <dl className="hz-kv mt-2xs" data-testid={testId}>
          {rows.map((row) => (
            <div key={row.labelFa} className="hz-kv__row">
              <dt className="hz-kv__key">{row.labelFa}</dt>
              <dd className="hz-kv__value">{cellFa(row)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

const toman = (value: number | bigint): string => fa(value);

/**
 * What the marketplace did — PROMPT-013.
 *
 * Aggregates only. A breakdown small enough to be about one identifiable
 * person reads as «کمتر از حد نمایش» rather than as a number, because a
 * province with one sale in it is not a statistic — it is a fact about
 * somebody, and this screen's capability is not the one that may see it.
 *
 * DS P09 home shape for volume reports: StatTile rows per area under a small
 * SectionHeader, breakdowns as KeyValue lists.
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
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">{'بازه: ' + fa(days) + ' روز گذشته'}</span>
        <span className="hz-page-header__meta-item">فقط جمع و شمار</span>
      </p>
      <Alert tone="info" title="این صفحه فقط جمع و شمار نشان می‌دهد">
        <span data-testid="analytics-privacy-note">
          تفکیکی که کمتر از {fa(view.minimumCohort)} رکورد داشته باشد با «کمتر از حد نمایش» نشان داده می‌شود؛
          نام، شماره و نشانی در این صفحه نمی‌آید.
        </span>
      </Alert>

      <Panel title="فروشگاه کالا" aside="مبلغ‌ها به تومان">
        <div data-testid="analytics-shop">
          <StatTiles
            tiles={[
              { label: 'ارزش سفارش‌ها', value: toman(view.shop.gmv.totalToman), unit: 'تومان', valueTestId: 'analytics-gmv' },
              { label: 'تعداد سفارش', value: fa(view.shop.gmv.count), valueTestId: 'analytics-orders' },
              { label: 'میانگین سفارش', value: toman(view.shop.gmv.averageToman), unit: 'تومان' },
              { label: 'کارمزد همزیست', value: toman(view.shop.commissionToman), unit: 'تومان', valueTestId: 'analytics-commission' },
            ]}
          />
        </div>
        <p className="text-body-sm" data-testid="analytics-returns">
          مرجوعی: {fa(view.shop.returns.count)} — بازپرداخت {fa(view.shop.returns.refundedToman)} تومان — نرخ{' '}
          {pct(view.shop.returns.rate)} از تحویل‌شده‌ها
        </p>
        <Breakdown titleFa="وضعیت زیرسفارش‌ها" rows={view.shop.subOrders} testId="analytics-suborders" />
      </Panel>

      <Panel title="بازار حیوان" aside="مبلغ‌ها به تومان">
        <div data-testid="analytics-animals">
          <StatTiles
            tiles={[
              { label: 'ارزش معامله‌های کامل‌شده', value: toman(view.animals.deals.totalToman), unit: 'تومان', valueTestId: 'analytics-deals' },
              { label: 'بیعانه‌های دریافتی', value: toman(view.animals.depositsToman), unit: 'تومان' },
              { label: 'بازپرداخت‌ها', value: toman(view.animals.refundsToman), unit: 'تومان' },
            ]}
          />
        </div>

        <div>
          <h3 className="text-label-md">قیف معامله</h3>
          <dl className="hz-kv mt-2xs" data-testid="analytics-funnel">
            {view.animals.funnel.map((step) => (
              <div key={step.labelFa} className="hz-kv__row">
                <dt className="hz-kv__key">{step.labelFa}</dt>
                <dd className="hz-kv__value">
                  {fa(step.count)}
                  {step.ofPrevious !== null ? ' — ' + pct(step.ofPrevious) + ' از مرحله قبل' : ''}
                  {step.ofTop !== null ? ' — ' + pct(step.ofTop) + ' از آغاز' : ''}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="grid gap-lg md:grid-cols-3">
          <Breakdown titleFa="به تفکیک گونه" rows={view.animals.bySpecies} testId="analytics-species" />
          <Breakdown titleFa="به تفکیک نژاد" rows={view.animals.byBreed} testId="analytics-breed" />
          <Breakdown titleFa="به تفکیک استان" rows={view.animals.byProvince} testId="analytics-province" />
        </div>
      </Panel>

      <div className="grid items-start gap-lg lg:grid-cols-2">
        <Panel title="مالی فروشندگان" aside="مبلغ‌ها به تومان">
          <dl className="hz-kv" data-testid="analytics-balances">
            <div className="hz-kv__row">
              <dt className="hz-kv__key">در جریان</dt>
              <dd className="hz-kv__value">{fa(view.sellers.balances.pendingToman)} تومان</dd>
            </div>
            <div className="hz-kv__row">
              <dt className="hz-kv__key">نگه‌داشته</dt>
              <dd className="hz-kv__value">{fa(view.sellers.balances.heldToman)} تومان</dd>
            </div>
            <div className="hz-kv__row">
              <dt className="hz-kv__key">قابل تسویه</dt>
              <dd className="hz-kv__value">{fa(view.sellers.balances.availableToman)} تومان</dd>
            </div>
            <div className="hz-kv__row">
              <dt className="hz-kv__key">بدهی</dt>
              <dd className="hz-kv__value">{fa(view.sellers.balances.debtToman)} تومان</dd>
            </div>
          </dl>
          <p className="text-body-sm" data-testid="analytics-settlements">
            تسویه‌های واریزشده: {fa(view.sellers.settlements.count)} — جمع {fa(view.sellers.settlements.paidToman)}{' '}
            تومان
          </p>
        </Panel>

        <div className="space-y-lg">
          <Panel title="گزارش‌ها و moderation">
            <Breakdown titleFa="نتیجه گزارش‌ها" rows={view.moderation} testId="analytics-reports" />
          </Panel>
          <Panel title="تبلیغ">
            <p className="text-body-sm" data-testid="analytics-advertising">
              بسته‌های خریداری‌شده: {fa(view.advertising.promotions)} — فعال در این لحظه:{' '}
              {fa(view.advertising.activeNow)}
            </p>
          </Panel>
        </div>
      </div>
    </OpsShell>
  );
}
