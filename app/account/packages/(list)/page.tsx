import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { listPlans, livePackage, myTargets, subscriptionsOf } from '../../../../src/advertising/service.ts';
import {
  AD_PERIOD_FA,
  AD_STATE_FA,
  AD_TIER_FA,
  adState,
  remainingDays,
  type AdPeriod,
  type AdTier,
} from '../../../../src/advertising/model.ts';
import { formatInstantFa } from '../../../../src/content/model.ts';
import { BuyPackageForm, CancelPackageForm } from '../../../../src/advertising/forms.tsx';

export const dynamic = 'force-dynamic';

const fa = (value: number): string => value.toLocaleString('fa-IR');

/**
 * Advertising packages of the records this account manages — §14, P2-D03,
 * P2-D05, P2-D07 (PROMPT-011).
 *
 * The base profile is free and needs nothing here. A package is bought per
 * record, activates only after the server verifies the payment, and expires by
 * its own end date without any job. It is its own axis: it neither verifies a
 * licence nor makes a profile trusted.
 */
export default async function AccountPackagesPage() {
  const guard = await guardRoute('/account/packages');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const now = new Date();
  const [targets, plans] = await Promise.all([myTargets(db(), guard.actor), listPlans(db(), now)]);
  const rows = await Promise.all(
    targets.map(async (target) => ({
      target,
      live: await livePackage(db(), target.type, target.id, now),
      history: await subscriptionsOf(db(), target.type, target.id),
    })),
  );
  const sellable = plans.filter((entry) => entry.plan.isActive === 1);

  return (
    <PublicShell actor={guard.actor} title="بسته‌های تبلیغاتی" pathname="/account/packages">
      <div className="space-y-lg">
        <Card>
          <h1 className="text-h4">بسته‌های تبلیغاتی</h1>
          <p className="mt-xs text-body-sm text-text-secondary">
            پروفایل پایه رایگان است و بسته لازم ندارد. بسته تبلیغاتی فقط جای نمایش را با برچسب «تبلیغ» تغییر می‌دهد؛
            تأیید حرفه‌ای، معتمدبودن و کامل‌بودن پرونده را نمی‌سازد و جای آن‌ها را هم نمی‌گیرد.
          </p>
          <p className="mt-sm text-caption text-text-secondary">
            بسته پس از تأیید پرداخت روی سرور فعال می‌شود و در پایان همان بازه، خودبه‌خود از نمایش می‌افتد. تمدید زودهنگام
            روزهای باقی‌مانده را از بین نمی‌برد: بازه تازه از پایان بازه فعلی شروع می‌شود.
          </p>
        </Card>

        {rows.length === 0 ? (
          <EmptyState
            title="پرونده‌ای برای تبلیغ ندارید"
            description="بسته تبلیغاتی برای پروفایل دامپزشک، مرکز یا انجمن و کلابی خریداری می‌شود که مدیریتش با شماست."
          />
        ) : (
          rows.map(({ target, live, history }) => {
            const liveState = live ? adState(live, now) : null;
            return (
              <Card key={target.type + target.id}>
                <div className="flex flex-wrap items-start justify-between gap-md">
                  <div className="min-w-0">
                    <h2 className="text-label-lg">{target.nameFa}</h2>
                    <p className="mt-2xs text-caption text-text-secondary">{target.kindFa}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-xs">
                    <span data-testid={'package-state-' + target.id}>
                      <StatusBadge tone={liveState === 'ACTIVE' ? 'success' : 'neutral'}>
                        {liveState === 'ACTIVE' ? 'بسته فعال' : 'بسته فعالی ندارد'}
                      </StatusBadge>
                    </span>
                    <Link href={target.manageRoute} className="text-label-md text-text-brand underline underline-offset-4">
                      مدیریت پرونده
                    </Link>
                  </div>
                </div>

                {live ? (
                  <div className="mt-lg rounded-lg border border-border-subtle p-lg" data-testid={'live-package-' + target.id}>
                    <p className="text-label-md">
                      {'بسته فعال: ' +
                        AD_TIER_FA[history.find((row) => row.id === live.id)?.tier as AdTier] +
                        ' ' +
                        AD_PERIOD_FA[history.find((row) => row.id === live.id)?.period as AdPeriod]}
                    </p>
                    <p className="mt-2xs text-caption text-text-secondary">
                      {'پایان: ' +
                        (live.endsAt ? formatInstantFa(live.endsAt) : '—') +
                        ' · ' +
                        fa(remainingDays(live.endsAt, now)) +
                        ' روز باقی مانده'}
                    </p>
                    <CancelPackageForm surface="owner" subscription={{ id: live.id, version: live.version }} />
                  </div>
                ) : null}

                <div className="mt-lg">
                  <h3 className="text-label-md">خرید یا تمدید</h3>
                  {sellable.length === 0 ? (
                    <div className="mt-md">
                      <Alert tone="info" title="بسته‌ای برای فروش نیست">
                        در حال حاضر هیچ بسته‌ای ارائه نمی‌شود.
                      </Alert>
                    </div>
                  ) : (
                    <ul className="mt-md grid gap-md sm:grid-cols-2 lg:grid-cols-3" data-testid={'plans-' + target.id}>
                      {sellable.map((entry) => {
                        const testId = entry.plan.id + '-' + target.id;
                        const blocked = !entry.price.configured
                          ? 'قیمت این بسته هنوز ثبت نشده است؛ خرید ممکن نیست.'
                          : entry.full
                            ? 'ظرفیت این بسته تکمیل است.'
                            : null;
                        return (
                          <li key={entry.plan.id} className="rounded-lg border border-border-subtle p-lg" data-testid={'plan-card-' + testId}>
                            <p className="text-label-lg">{entry.tierFa + ' ' + entry.periodFa}</p>
                            <p className="mt-2xs text-label-md" data-testid={'plan-price-' + testId}>
                              {entry.priceFa ?? 'قیمت ثبت‌نشده'}
                            </p>
                            {entry.plan.featuresFa ? (
                              <p className="mt-xs text-caption text-text-secondary">{entry.plan.featuresFa}</p>
                            ) : null}
                            {entry.plan.slotCapacity !== null ? (
                              <p className="mt-xs text-caption text-text-secondary">
                                {'ظرفیت: ' + fa(entry.activeCount) + ' از ' + fa(entry.plan.slotCapacity)}
                              </p>
                            ) : null}
                            <BuyPackageForm
                              targetType={target.type}
                              targetId={target.id}
                              planId={entry.plan.id}
                              label={live ? 'تمدید با این بسته' : 'خرید این بسته'}
                              disabledReasonFa={blocked}
                              testId={testId}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {history.length === 0 ? null : (
                  <div className="mt-lg border-t border-border-subtle pt-lg">
                    <h3 className="text-label-md">تاریخچه</h3>
                    <ul className="mt-md space-y-sm" data-testid={'history-' + target.id}>
                      {history.map((row) => {
                        const state = adState(row, now);
                        return (
                          <li
                            key={row.id}
                            className="flex flex-wrap items-center justify-between gap-sm rounded-md border border-border-subtle px-md py-sm"
                            data-testid={'history-row-' + row.id}
                          >
                            <span className="text-body-sm">
                              {AD_TIER_FA[row.tier as AdTier] + ' ' + AD_PERIOD_FA[row.period as AdPeriod]}
                              {row.startsAt ? ' · از ' + formatInstantFa(row.startsAt) : ''}
                              {row.endsAt ? ' تا ' + formatInstantFa(row.endsAt) : ''}
                              {row.cancelReasonFa ? ' · دلیل لغو: ' + row.cancelReasonFa : ''}
                            </span>
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
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </PublicShell>
  );
}
