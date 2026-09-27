import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { db } from '../../../src/db/client.ts';
import { AppError } from '../../../src/domain/errors.ts';
import { BELOW_THRESHOLD_FA, type RedactedBreakdown } from '../../../src/analytics/metrics.ts';
import { finderOverview } from '../../../src/finder/operations.ts';
import { hasFinderCapability } from '../../../src/finder/model.ts';
import { ReconcileForm } from '../../../src/finder/ops-forms.tsx';

export const dynamic = 'force-dynamic';

const fa = (n: number) => n.toLocaleString('fa-IR');

function Rows({ rows, testId }: { rows: readonly RedactedBreakdown[]; testId: string }) {
  if (rows.length === 0) return <p className="mt-xs text-body-sm text-text-secondary">موردی نیست.</p>;
  return (
    <ul className="mt-xs space-y-2xs text-body-sm" data-testid={testId}>
      {rows.map((r) => (
        <li key={r.labelFa} className="flex justify-between gap-md">
          <span>{r.labelFa}</span>
          <span>{r.suppressed ? BELOW_THRESHOLD_FA : fa(r.count)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Finder operations overview — PHASE-4 PROMPT-007. Counts only: no chat or
 * contract text, no phone, address, full chip, code or location; a breakdown
 * row small enough to be one person shows no number.
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
      <div className="grid gap-lg md:grid-cols-2" data-testid="finder-overview">
        <Card>
          <h2 className="text-label-lg">پیکربندی</h2>
          <p className="mt-xs text-body-sm">{'طرح منتشرشده: ' + fa(view.config.publishedPlans) + ' · قاعده نژاد: ' + fa(view.config.publishedRules)}</p>
          <p className="mt-xs text-body-sm">{'قالب قرارداد: ' + (view.config.templateVersion === null ? 'منتشر نشده' : 'نسخه ' + fa(view.config.templateVersion))}</p>
        </Card>
        <Card>
          <h2 className="text-label-lg">ظرفیت</h2>
          <p className="mt-xs text-body-sm">{'پروفایل فعال: ' + fa(view.capacity.activeProfiles) + ' · ظرفیت اشتراک‌های فعال: ' + fa(view.capacity.subscribedCapacity)}</p>
          <Rows rows={view.capacity.byState} testId="finder-overview-states" />
        </Card>
        <Card>
          <h2 className="text-label-lg">{'قیف درخواست (' + fa(view.sinceDays) + ' روز اخیر)'}</h2>
          <ul className="mt-xs space-y-2xs text-body-sm" data-testid="finder-overview-funnel">
            {view.funnel.map((f) => (
              <li key={f.labelFa} className="flex justify-between gap-md">
                <span>{f.labelFa}</span>
                <span>{fa(f.count)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="text-label-lg">قرارداد و مسیر</h2>
          <p className="mt-xs text-body-sm">{'آغازشده: ' + fa(view.contracts.started) + ' · تأییدشده: ' + fa(view.contracts.confirmed) + ' · لغوشده: ' + fa(view.contracts.cancelled)}</p>
          <Rows rows={view.handoff} testId="finder-overview-handoff" />
          <p className="mt-sm text-body-sm">{'تاریخ تأییدشده: ' + fa(view.dates.confirmed) + ' · در انتظار تأیید: ' + fa(view.dates.pending) + ' · مغایرت: ' + fa(view.dates.conflicted)}</p>
        </Card>
        <Card>
          <h2 className="text-label-lg">گزارش‌ها و محدودیت‌ها</h2>
          <p className="mt-xs text-body-sm">{'باز: ' + fa(view.reports.open) + ' · تصمیم‌گرفته: ' + fa(view.reports.decided) + ' · اعتراض باز: ' + fa(view.reports.openAppeals)}</p>
          <Rows rows={view.reports.byCategory} testId="finder-overview-categories" />
          <p className="mt-sm text-body-sm">{'تعلیق جفت‌یابی فعال: ' + fa(view.sanctions.finderAccess) + ' · حساب محدود: ' + fa(view.sanctions.account)}</p>
        </Card>
        <Card>
          <h2 className="text-label-lg">سلامت اعلان‌ها</h2>
          <p className="mt-xs text-caption text-text-secondary">«ارسال‌شده» برای پیامک یعنی ارائه‌دهنده پذیرفته است، نه اینکه به گوشی رسیده باشد؛ در حالت محلی هیچ ارسال واقعی رخ نمی‌دهد.</p>
          <Rows rows={view.notifications} testId="finder-overview-notifications" />
        </Card>
        {hasFinderCapability(actor, 'FINDER_CONFIG_WRITE') ? (
          <Card>
            <h2 className="text-label-lg">هماهنگ‌سازی</h2>
            <p className="mt-xs text-caption text-text-secondary">
              انقضای درخواست‌ها، خروج پروفایل پس از انتقال، فوت، مفقودی، بایگانی یا پایان اشتراک، یادآوری‌ها و پاک‌کردن کدهای منقضی. اجرای دوباره بی‌خطر است.
            </p>
            <div className="mt-sm">
              <ReconcileForm />
            </div>
          </Card>
        ) : null}
      </div>
    </OpsShell>
  );
}
