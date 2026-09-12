import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { OpsShell, ADMIN_NAV } from '../../src/ui/shell.tsx';
import { Card } from '../../src/ui/card.tsx';
import { ButtonLink } from '../../src/ui/button.tsx';
import Link from 'next/link';
import { db } from '../../src/db/client.ts';
import { healthReport } from '../../src/health/service.ts';
import { queueBoard } from '../../src/admin/queues.ts';
import { EmptyState } from '../../src/ui/states.tsx';
import { StatusBadge } from '../../src/ui/status.tsx';

export const dynamic = 'force-dynamic';

/**
 * Superadmin environment (§21.4, D11). It opens on the real state of managed
 * data, because the first operational job is entering the values that are still
 * missing rather than admiring a summary.
 */
export default async function AdminPage() {
  const guard = await guardRoute('/admin');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const [report, queues] = await Promise.all([healthReport(db()), queueBoard(db(), guard.actor)]);

  return (
    <OpsShell actor={guard.actor} title="سوپرادمین" pathname="/admin" nav={ADMIN_NAV}>
      <div className="space-y-lg">
        <Card>
          <h2 className="text-label-lg">وضعیت داده مدیریتی</h2>
          <p className="mt-md text-body-sm">
            {report.settings.total} کلید تنظیم · {report.settings.notConfigured.length} مورد «تعیین‌نشده»
          </p>
          <p className="mt-sm text-caption text-text-secondary">
            مقدار نامعلوم با عدد پیش‌فرض جایگزین نمی‌شود؛ تا ورود داده واقعی، مسیر پرداخت آن قلم باز نمی‌شود.
          </p>
          <div className="mt-lg">
            <ButtonLink href="/admin/settings" block>
              مدیریت تنظیمات
            </ButtonLink>
          </div>
        </Card>

        <Card>
          <h2 className="text-label-lg">صف‌های بررسی</h2>
          <p className="mt-xs text-caption text-text-secondary">
            فقط صف‌هایی که این نقش اجازه خواندنشان را دارد نمایش داده می‌شوند؛ صف بسته‌شده صفر نشان داده نمی‌شود.
          </p>
          {queues.length === 0 ? (
            <div className="mt-lg">
              <EmptyState title="صفی در دسترس این نقش نیست" description="هر صف با مجوز خودش باز می‌شود." />
            </div>
          ) : (
            <ul className="mt-lg space-y-sm" data-testid="queue-board">
              {queues.map((queue) => (
                <li key={queue.key}>
                  <Link
                    href={queue.href}
                    className="flex items-center justify-between gap-md rounded-lg border border-border-subtle p-md hover:border-border-brand"
                    data-testid={'queue-' + queue.key}
                  >
                    <span className="text-label-md">{queue.labelFa}</span>
                    <StatusBadge tone={queue.waiting > 0 ? 'warning' : 'neutral'}>
                      {queue.waiting > 0 ? queue.waiting.toLocaleString('fa-IR') + ' در انتظار' : 'خالی'}
                    </StatusBadge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-lg">
            <ButtonLink tone="secondary" href="/admin/merge" block>
              ادغام رکورد تکراری
            </ButtonLink>
          </div>
        </Card>
      </div>
    </OpsShell>
  );
}
