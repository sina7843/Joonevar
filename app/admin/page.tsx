import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { OpsShell, ADMIN_NAV } from '../../src/ui/shell.tsx';
import { ButtonLink } from '../../src/ui/button.tsx';
import { CountTiles, StatTiles } from '../../src/ui/desk.tsx';
import { SectionHeader } from '../../src/ui/section-header.tsx';
import { db } from '../../src/db/client.ts';
import { healthReport } from '../../src/health/service.ts';
import { queueBoard } from '../../src/admin/queues.ts';
import { EmptyState } from '../../src/ui/states.tsx';

export const dynamic = 'force-dynamic';

/**
 * Superadmin environment (§21.4, D11) — DS P09 home: managed-data tiles, then
 * the review queues this role may read. It opens on the real state of managed
 * data, because the first operational job is entering the values that are still
 * missing rather than admiring a summary.
 */
export default async function AdminPage() {
  const guard = await guardRoute('/admin');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const [report, queues] = await Promise.all([healthReport(db()), queueBoard(db(), guard.actor)]);
  const unset = report.settings.notConfigured.length;

  return (
    <OpsShell
      actor={guard.actor}
      title="مرور"
      pathname="/admin"
      nav={ADMIN_NAV}
      meta={
        <p className="hz-page-header__meta">
          <span className="hz-page-header__meta-item">
            {report.settings.total.toLocaleString('fa-IR') + ' کلید تنظیم، ' + unset.toLocaleString('fa-IR') + ' مورد «تعیین‌نشده»'}
          </span>
        </p>
      }
      actions={
        <>
          <ButtonLink tone="secondary" size="sm" href="/admin/settings">
            مدیریت تنظیمات
          </ButtonLink>
          <ButtonLink tone="secondary" size="sm" href="/admin/merge">
            ادغام رکورد تکراری
          </ButtonLink>
        </>
      }
    >
      <section className="space-y-md" aria-labelledby="admin-data-title">
        <SectionHeader title="وضعیت داده مدیریتی" size="sm" id="admin-data-title" />
        <StatTiles
          tiles={[
            { label: 'کلیدهای تنظیم', value: report.settings.total, sub: 'هر تغییر نسخه‌دار و با دلیل', href: '/admin/settings' },
            {
              label: 'مقادیر تعیین‌نشده',
              value: unset,
              sub: unset === 0 ? 'همه مقادیر ثبت شده‌اند' : undefined,
              alert: unset > 0 ? 'تا ثبت مقدار، مسیر پرداخت آن قلم بسته است' : undefined,
              href: '/admin/settings?unset=1',
            },
          ]}
        />
        <p className="text-caption text-text-secondary">
          مقدار نامعلوم با عدد پیش‌فرض جایگزین نمی‌شود؛ تا ورود داده واقعی، مسیر پرداخت آن قلم باز نمی‌شود.
        </p>
      </section>

      <section className="space-y-md" aria-labelledby="admin-queues-title">
        <SectionHeader title="صف‌های بررسی" size="sm" id="admin-queues-title" />
        <p className="text-caption text-text-secondary">
          فقط صف‌هایی که این نقش اجازه خواندنشان را دارد نمایش داده می‌شوند؛ صف بسته‌شده صفر نشان داده نمی‌شود.
        </p>
        {queues.length === 0 ? (
          <EmptyState title="صفی در دسترس این نقش نیست" description="هر صف با مجوز خودش باز می‌شود." />
        ) : (
          <CountTiles
            testId="queue-board"
            linkTestId="queue-"
            queues={queues.map((queue) => ({ key: queue.key, titleFa: queue.labelFa, href: queue.href, waiting: queue.waiting }))}
          />
        )}
      </section>
    </OpsShell>
  );
}
