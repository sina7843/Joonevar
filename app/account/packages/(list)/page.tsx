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
  AD_TIER_FA,
  adState,
  remainingDays,
  type AdPeriod,
  type AdTier,
} from '../../../../src/advertising/model.ts';
import { formatInstantFa } from '../../../../src/content/model.ts';
import { BuyPackageForm, CancelPackageForm } from '../../../../src/advertising/forms.tsx';
import { PageHeader, SectionHeader } from '../../../../src/ui/section-header.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';

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
    <PublicShell
      actor={guard.actor}
      title="بسته‌های تبلیغاتی"
      pathname="/account/packages"
      header={
        <PageHeader
          title="بسته‌های تبلیغاتی"
          back={{ href: '/dashboard' }}
          meta={[
            ...(rows.length > 0 ? [fa(rows.length) + ' پرونده'] : []),
            'پروفایل پایه رایگان است و بسته لازم ندارد. بسته تبلیغاتی فقط جای نمایش را با برچسب «تبلیغ» تغییر می‌دهد؛ تأیید حرفه‌ای، معتمدبودن و کامل‌بودن پرونده را نمی‌سازد و جای آن‌ها را هم نمی‌گیرد.',
          ]}
        />
      }
    >
      <div className="space-y-xl">
        <p className="hz-inline-msg hz-inline-msg--info">
          <Icon name="info" size="xs" />
          <span className="hz-inline-msg__text">
            بسته پس از تأیید پرداخت روی سرور فعال می‌شود و در پایان همان بازه، خودبه‌خود از نمایش می‌افتد. تمدید زودهنگام روزهای
            باقی‌مانده را از بین نمی‌برد: بازه تازه از پایان بازه فعلی شروع می‌شود.
          </span>
        </p>

        {rows.length === 0 ? (
          <EmptyState
            icon="megaphoneSimple"
            title="پرونده‌ای برای تبلیغ ندارید"
            description="بسته تبلیغاتی برای پروفایل دامپزشک، مرکز یا انجمن و کلابی خریداری می‌شود که مدیریتش با شماست."
          />
        ) : (
          rows.map(({ target, live, history }) => {
            const liveState = live ? adState(live, now) : null;
            return (
              <Card key={target.type + target.id} className="space-y-lg">
                <div className="flex flex-wrap items-start justify-between gap-md">
                  <div className="min-w-0">
                    <SectionHeader title={target.nameFa} size="sm" />
                    <p className="hz-caption">{target.kindFa}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-xs">
                    <span data-testid={'package-state-' + target.id}>
                      <StatusBadge status={liveState ?? 'NONE'} />
                    </span>
                    <Link href={target.manageRoute} className="hz-link hz-link--standalone">
                      مدیریت پرونده
                      <Icon name="arrowRight" size="xs" mirror />
                    </Link>
                  </div>
                </div>

                {live ? (
                  <div className="hz-card hz-card--subtle" data-testid={'live-package-' + target.id}>
                    <p className="text-label-sm">
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

                <div>
                  <h3 className="text-label-lg">خرید یا تمدید</h3>
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
                          <li key={entry.plan.id} className="hz-card hz-card--compact flex flex-col gap-xs" data-testid={'plan-card-' + testId}>
                            <p className="text-label-lg">{entry.tierFa + ' ' + entry.periodFa}</p>
                            <p className={entry.priceFa ? 'text-h4' : 'hz-unset text-label-sm'} data-testid={'plan-price-' + testId}>
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
                  <div className="border-t border-border-subtle pt-lg">
                    <h3 className="text-label-lg">تاریخچه</h3>
                    <ul className="hz-cardlist mt-md" data-testid={'history-' + target.id}>
                      {history.map((row) => {
                        const state = adState(row, now);
                        return (
                          <li
                            key={row.id}
                            className="hz-cardlist__item flex-row flex-wrap items-center justify-between"
                            data-testid={'history-row-' + row.id}
                          >
                            <span className="hz-body-sm min-w-0">
                              {AD_TIER_FA[row.tier as AdTier] + ' ' + AD_PERIOD_FA[row.period as AdPeriod]}
                              {row.startsAt ? ' · از ' + formatInstantFa(row.startsAt) : ''}
                              {row.endsAt ? ' تا ' + formatInstantFa(row.endsAt) : ''}
                              {row.cancelReasonFa ? ' · دلیل لغو: ' + row.cancelReasonFa : ''}
                            </span>
                            <StatusBadge status={state} />
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
