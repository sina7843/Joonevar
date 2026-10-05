import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../src/ui/shell.tsx';
import { Panel, StatTiles } from '../../../src/ui/desk.tsx';
import { db } from '../../../src/db/client.ts';
import { AppError } from '../../../src/domain/errors.ts';
import { BELOW_THRESHOLD_FA, type RedactedBreakdown } from '../../../src/analytics/metrics.ts';
import { finderOverview } from '../../../src/finder/operations.ts';
import { hasFinderCapability } from '../../../src/finder/model.ts';
import { ReconcileForm } from '../../../src/finder/ops-forms.tsx';

export const dynamic = 'force-dynamic';

const fa = (n: number) => n.toLocaleString('fa-IR');

function Rows({ rows, testId }: { rows: readonly RedactedBreakdown[]; testId: string }) {
  if (rows.length === 0) return <p className="text-body-sm text-text-secondary">موردی نیست.</p>;
  return (
    <dl className="hz-kv" data-testid={testId}>
      {rows.map((r) => (
        <div key={r.labelFa} className="hz-kv__row">
          <dt className="hz-kv__key">{r.labelFa}</dt>
          <dd className="hz-kv__value">{r.suppressed ? BELOW_THRESHOLD_FA : fa(r.count)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Finder operations overview — PHASE-4 PROMPT-007. Counts only: no chat or
 * contract text, no phone, address, full chip, code or location; a breakdown
 * row small enough to be one person shows no number.
 *
 * DS P09 home for volume reports: StatTiles, then one panel per area.
 */
export default async function FinderOverviewPage() {
  const guard = await guardRoute('/market/finder');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;
  let view;
  try {
    view = await finderOverview(db(), actor);
  } catch (error) {
    if (error instanceof AppError) return <AccessDenied error={error} />;
    throw error;
  }
  return (
    <OpsShell actor={actor} title="عملیات جفت‌یابی" nav={marketNav(actor)} pathname="/market/finder">
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">فقط شمار؛ بدون متن گفت‌وگو، قرارداد، شماره یا نشانی</span>
      </p>
      <div className="space-y-lg" data-testid="finder-overview">
        <StatTiles
          tiles={[
            { label: 'پروفایل فعال', value: view.capacity.activeProfiles, sub: 'ظرفیت اشتراک‌ها: ' + fa(view.capacity.subscribedCapacity) },
            { label: 'گزارش باز', value: view.reports.open, sub: 'اعتراض باز: ' + fa(view.reports.openAppeals), href: '/market/finder/reports' },
            { label: 'قرارداد تأییدشده', value: view.contracts.confirmed, sub: 'آغازشده: ' + fa(view.contracts.started) },
            {
              label: 'تاریخ با مغایرت',
              value: view.dates.conflicted,
              sub: 'در انتظار تأیید: ' + fa(view.dates.pending),
              alert: view.dates.conflicted > 0 ? 'نیازمند پیگیری' : undefined,
            },
          ]}
        />

        <div className="grid items-start gap-lg lg:grid-cols-2">
          <Panel title="پیکربندی">
            <dl className="hz-kv">
              <div className="hz-kv__row">
                <dt className="hz-kv__key">طرح منتشرشده</dt>
                <dd className="hz-kv__value">{fa(view.config.publishedPlans)}</dd>
              </div>
              <div className="hz-kv__row">
                <dt className="hz-kv__key">قاعده نژاد</dt>
                <dd className="hz-kv__value">{fa(view.config.publishedRules)}</dd>
              </div>
              <div className="hz-kv__row">
                <dt className="hz-kv__key">قالب قرارداد</dt>
                <dd className={view.config.templateVersion === null ? 'hz-kv__value hz-setting__value--unset' : 'hz-kv__value'}>
                  {view.config.templateVersion === null ? 'منتشر نشده' : 'نسخه ' + fa(view.config.templateVersion)}
                </dd>
              </div>
            </dl>
          </Panel>
          <Panel title="ظرفیت">
            <p className="text-body-sm">{'پروفایل فعال: ' + fa(view.capacity.activeProfiles) + ' · ظرفیت اشتراک‌های فعال: ' + fa(view.capacity.subscribedCapacity)}</p>
            <Rows rows={view.capacity.byState} testId="finder-overview-states" />
          </Panel>
          <Panel title={'قیف درخواست (' + fa(view.sinceDays) + ' روز اخیر)'}>
            <dl className="hz-kv" data-testid="finder-overview-funnel">
              {view.funnel.map((f) => (
                <div key={f.labelFa} className="hz-kv__row">
                  <dt className="hz-kv__key">{f.labelFa}</dt>
                  <dd className="hz-kv__value">{fa(f.count)}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          <Panel title="قرارداد و مسیر">
            <p className="text-body-sm">{'آغازشده: ' + fa(view.contracts.started) + ' · تأییدشده: ' + fa(view.contracts.confirmed) + ' · لغوشده: ' + fa(view.contracts.cancelled)}</p>
            <Rows rows={view.handoff} testId="finder-overview-handoff" />
            <p className="text-body-sm">{'تاریخ تأییدشده: ' + fa(view.dates.confirmed) + ' · در انتظار تأیید: ' + fa(view.dates.pending) + ' · مغایرت: ' + fa(view.dates.conflicted)}</p>
          </Panel>
          <Panel title="گزارش‌ها و محدودیت‌ها">
            <p className="text-body-sm">{'باز: ' + fa(view.reports.open) + ' · تصمیم‌گرفته: ' + fa(view.reports.decided) + ' · اعتراض باز: ' + fa(view.reports.openAppeals)}</p>
            <Rows rows={view.reports.byCategory} testId="finder-overview-categories" />
            <p className="text-body-sm">{'تعلیق جفت‌یابی فعال: ' + fa(view.sanctions.finderAccess) + ' · حساب محدود: ' + fa(view.sanctions.account)}</p>
          </Panel>
          <Panel title="سلامت اعلان‌ها">
            <p className="text-caption text-text-secondary">«ارسال‌شده» برای پیامک یعنی ارائه‌دهنده پذیرفته است، نه اینکه به گوشی رسیده باشد؛ در حالت محلی هیچ ارسال واقعی رخ نمی‌دهد.</p>
            <Rows rows={view.notifications} testId="finder-overview-notifications" />
          </Panel>
          {hasFinderCapability(actor, 'FINDER_CONFIG_WRITE') ? (
            <Panel title="هماهنگ‌سازی">
              <p className="text-caption text-text-secondary">
                انقضای درخواست‌ها، خروج پروفایل پس از انتقال، فوت، مفقودی، بایگانی یا پایان اشتراک، یادآوری‌ها و پاک‌کردن کدهای منقضی. اجرای دوباره بی‌خطر است.
              </p>
              <ReconcileForm />
            </Panel>
          ) : null}
        </div>
      </div>
    </OpsShell>
  );
}
