import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { OpsShell, GENETICS_NAV } from '../../src/ui/shell.tsx';
import { CountTiles } from '../../src/ui/desk.tsx';
import { Alert } from '../../src/ui/alert.tsx';
import { db } from '../../src/db/client.ts';
import { geneticsQueues } from '../../src/operations/service.ts';
import { readSetting } from '../../src/settings/service.ts';

export const dynamic = 'force-dynamic';

/**
 * Genetics centre operations — §21.3, D07, D11.
 *
 * The counts are real, and the centre's own details come from managed data: an
 * unset value is shown as unset rather than filled in with an invented one.
 */
export default async function GeneticsPage() {
  const guard = await guardRoute('/genetics');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const [queues, centreName] = await Promise.all([
    geneticsQueues(db(), guard.actor),
    readSetting(db(), 'genetics_centre.name'),
  ]);

  return (
    <OpsShell actor={guard.actor} title="داشبورد مرکز ژنتیک" pathname="/genetics" nav={GENETICS_NAV}>
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">
          {queues.reduce((sum, queue) => sum + queue.waiting, 0).toLocaleString('fa-IR') + ' مورد باز در ' + queues.length.toLocaleString('fa-IR') + ' صف'}
        </span>
      </p>
      <Alert tone="info" title="مرکز نمونه‌گیری نمی‌کند">
        <span data-testid="centre-name">
          {centreName.value === null
            ? 'مشخصات مرکز هنوز در تنظیمات مدیریتی وارد نشده است و «تعیین‌نشده» می‌ماند.'
            : 'مرکز ثابت: ' + String(centreName.value)}
        </span>
      </Alert>
      <CountTiles queues={queues} testId="genetics-queues" countTestId="genetics-count-" linkTestId="open-genetics-" />
    </OpsShell>
  );
}
