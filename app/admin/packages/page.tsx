import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { ADMIN_NAV, OpsShell } from '../../../src/ui/shell.tsx';
import { Panel } from '../../../src/ui/desk.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { allPackages, listPlans } from '../../../src/advertising/service.ts';
import { AD_PERIOD_FA, AD_STATE_FA, AD_TIER_FA, adState, type AdPeriod, type AdTier } from '../../../src/advertising/model.ts';
import { formatInstantFa } from '../../../src/content/model.ts';
import { CancelPackageForm, PlanForm, UnpricedNotice } from '../../../src/advertising/forms.tsx';

export const dynamic = 'force-dynamic';

const fa = (value: number): string => value.toLocaleString('fa-IR');

/**
 * The advertising catalogue — §14, P2-D03 (PROMPT-011).
 *
 * Features, slot capacity and availability are set here; the price of each plan
 * is a managed setting, edited in /admin/settings with its own reason and
 * version, so one figure is never charged from two places.
 *
 * DS P11: one config card per plan (key, price, capacity, edit form), then the
 * purchases as a list.
 */
export default async function AdminPackagesPage() {
  const guard = await guardRoute('/admin/packages');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const now = new Date();
  const [plans, subscriptions] = await Promise.all([listPlans(db(), now), allPackages(db(), guard.actor)]);

  return (
    <OpsShell actor={guard.actor} title="بسته‌های تبلیغاتی" pathname="/admin/packages" nav={ADMIN_NAV}>
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">
          پروفایل پایه رایگان است. قیمت هر بسته از{' '}
          <Link href="/admin/settings" className="hz-link" data-testid="packages-settings-link">
            تنظیمات محصول
          </Link>{' '}
          خوانده می‌شود و تا ثبت‌نشدن مبلغ، آن بسته فروخته نمی‌شود. بسته تبلیغاتی هیچ تأیید حرفه‌ای یا معتمدبودنی نمی‌سازد.
        </span>
      </p>

      <div className="grid items-start gap-lg lg:grid-cols-2">
        {plans.map((entry) => (
          <section key={entry.plan.id} className="hz-card space-y-md" aria-labelledby={'plan-title-' + entry.plan.id}>
            <div className="flex flex-wrap items-start justify-between gap-sm">
              <div className="hz-setting__label">
                <h2 className="hz-card__title" id={'plan-title-' + entry.plan.id}>
                  {entry.tierFa + ' ' + entry.periodFa}
                </h2>
                <bdi className="hz-setting__key" dir="ltr">
                  {entry.plan.priceSettingKey}
                </bdi>
              </div>
              <StatusBadge tone={entry.plan.isActive === 1 ? 'success' : 'neutral'} size="sm">
                {entry.plan.isActive === 1 ? 'ارائه می‌شود' : 'ارائه نمی‌شود'}
              </StatusBadge>
            </div>
            <dl className="hz-kv">
              <div className="hz-kv__row">
                <dt className="hz-kv__key">قیمت</dt>
                <dd
                  className={entry.price.configured ? 'hz-kv__value' : 'hz-kv__value hz-setting__value--unset'}
                  data-testid={'plan-price-badge-' + entry.plan.id}
                >
                  {entry.priceFa ?? 'قیمت ثبت‌نشده'}
                </dd>
              </div>
              <div className="hz-kv__row">
                <dt className="hz-kv__key">ظرفیت فعال</dt>
                <dd className="hz-kv__value">
                  <StatusBadge tone={entry.full ? 'warning' : 'neutral'} size="sm">
                    {'فعال: ' + fa(entry.activeCount) + (entry.plan.slotCapacity === null ? '' : ' از ' + fa(entry.plan.slotCapacity))}
                  </StatusBadge>
                </dd>
              </div>
            </dl>
            {entry.price.configured ? null : <UnpricedNotice testId={'plan-unpriced-' + entry.plan.id} />}
            <PlanForm
              plan={{
                id: entry.plan.id,
                version: entry.plan.version,
                featuresFa: entry.plan.featuresFa,
                slotCapacity: entry.plan.slotCapacity,
                isActive: entry.plan.isActive === 1,
              }}
            />
          </section>
        ))}
      </div>

      <Panel title="خریدهای ثبت‌شده" count={fa(subscriptions.length)}>
        {subscriptions.length === 0 ? (
          <EmptyState title="هنوز بسته‌ای خریداری نشده است" description="هر خرید پس از تأیید پرداخت اینجا می‌آید." />
        ) : (
          <ul className="divide-y divide-border-subtle" data-testid="package-subscriptions">
            {subscriptions.map((row) => {
              const state = adState(row, now);
              return (
                <li key={row.id} className="py-md first:pt-0 last:pb-0" data-testid={'subscription-' + row.id}>
                  <div className="flex flex-wrap items-start justify-between gap-sm">
                    <div className="hz-case min-w-0">
                      <span className="hz-case__name">{row.target?.nameFa ?? 'پرونده حذف‌شده'}</span>
                      <span className="hz-case__sub">
                        {[
                          row.target?.kindFa,
                          AD_TIER_FA[row.plan.tier as AdTier] + ' ' + AD_PERIOD_FA[row.plan.period as AdPeriod],
                          row.startsAt ? 'از ' + formatInstantFa(row.startsAt) : null,
                          row.endsAt ? 'تا ' + formatInstantFa(row.endsAt) : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      {row.cancelReasonFa ? <span className="hz-case__sub">{'دلیل لغو: ' + row.cancelReasonFa}</span> : null}
                    </div>
                    <StatusBadge
                      size="sm"
                      tone={
                        state === 'ACTIVE'
                          ? 'success'
                          : state === 'PENDING_PAYMENT'
                            ? 'info'
                            : state === 'PAYMENT_FAILED'
                              ? 'error'
                              : 'neutral'
                      }
                    >
                      {AD_STATE_FA[state]}
                    </StatusBadge>
                  </div>
                  {state === 'ACTIVE' || state === 'PENDING_PAYMENT' ? (
                    <CancelPackageForm surface="admin" subscription={{ id: row.id, version: row.version }} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </OpsShell>
  );
}
