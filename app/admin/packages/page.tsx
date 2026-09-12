import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { ADMIN_NAV, OpsShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
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
 */
export default async function AdminPackagesPage() {
  const guard = await guardRoute('/admin/packages');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const now = new Date();
  const [plans, subscriptions] = await Promise.all([listPlans(db(), now), allPackages(db(), guard.actor)]);

  return (
    <OpsShell actor={guard.actor} title="هم‌زیست — سوپرادمین" pathname="/admin/packages" nav={ADMIN_NAV}>
      <div className="space-y-lg">
        <Card>
          <h1 className="text-h4">بسته‌های تبلیغاتی</h1>
          <p className="mt-xs text-body-sm text-text-secondary">
            پروفایل پایه رایگان است. قیمت هر بسته از{' '}
            <Link href="/admin/settings" className="text-text-brand underline underline-offset-4" data-testid="packages-settings-link">
              تنظیمات محصول
            </Link>{' '}
            خوانده می‌شود و تا ثبت‌نشدن مبلغ، آن بسته فروخته نمی‌شود. بسته تبلیغاتی هیچ تأیید حرفه‌ای یا معتمدبودنی نمی‌سازد.
          </p>
        </Card>

        {plans.map((entry) => (
          <Card key={entry.plan.id}>
            <div className="flex flex-wrap items-start justify-between gap-md">
              <div className="min-w-0">
                <h2 className="text-label-lg">{entry.tierFa + ' ' + entry.periodFa}</h2>
                <p className="mt-2xs text-caption text-text-secondary">
                  <bdi className="hz-ltr font-mono">{entry.plan.priceSettingKey}</bdi>
                </p>
              </div>
              <div className="flex flex-wrap gap-xs">
                <StatusBadge tone={entry.plan.isActive === 1 ? 'success' : 'neutral'}>
                  {entry.plan.isActive === 1 ? 'ارائه می‌شود' : 'ارائه نمی‌شود'}
                </StatusBadge>
                <span data-testid={'plan-price-badge-' + entry.plan.id}>
                  <StatusBadge tone={entry.price.configured ? 'info' : 'warning'}>
                    {entry.priceFa ?? 'قیمت ثبت‌نشده'}
                  </StatusBadge>
                </span>
                <StatusBadge tone={entry.full ? 'warning' : 'neutral'}>
                  {'فعال: ' + fa(entry.activeCount) + (entry.plan.slotCapacity === null ? '' : ' از ' + fa(entry.plan.slotCapacity))}
                </StatusBadge>
              </div>
            </div>
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
          </Card>
        ))}

        <Card>
          <h2 className="text-label-lg">خریدهای ثبت‌شده</h2>
          {subscriptions.length === 0 ? (
            <div className="mt-lg">
              <EmptyState title="هنوز بسته‌ای خریداری نشده است" description="هر خرید پس از تأیید پرداخت اینجا می‌آید." />
            </div>
          ) : (
            <ul className="mt-lg space-y-sm" data-testid="package-subscriptions">
              {subscriptions.map((row) => {
                const state = adState(row, now);
                return (
                  <li key={row.id} className="rounded-lg border border-border-subtle p-md" data-testid={'subscription-' + row.id}>
                    <div className="flex flex-wrap items-start justify-between gap-sm">
                      <div className="min-w-0">
                        <p className="text-label-md">{row.target?.nameFa ?? 'پرونده حذف‌شده'}</p>
                        <p className="mt-2xs text-caption text-text-secondary">
                          {[
                            row.target?.kindFa,
                            AD_TIER_FA[row.plan.tier as AdTier] + ' ' + AD_PERIOD_FA[row.plan.period as AdPeriod],
                            row.startsAt ? 'از ' + formatInstantFa(row.startsAt) : null,
                            row.endsAt ? 'تا ' + formatInstantFa(row.endsAt) : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        {row.cancelReasonFa ? (
                          <p className="mt-2xs text-caption text-text-secondary">{'دلیل لغو: ' + row.cancelReasonFa}</p>
                        ) : null}
                      </div>
                      <StatusBadge
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
        </Card>
      </div>
    </OpsShell>
  );
}
