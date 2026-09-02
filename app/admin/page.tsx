import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { OpsShell, ADMIN_NAV } from '../../src/ui/shell.tsx';
import { Card } from '../../src/ui/card.tsx';
import { ButtonLink } from '../../src/ui/button.tsx';
import { db } from '../../src/db/client.ts';
import { healthReport } from '../../src/health/service.ts';

export const dynamic = 'force-dynamic';

/**
 * Superadmin environment (§21.4, D11). It opens on the real state of managed
 * data, because the first operational job is entering the values that are still
 * missing rather than admiring a summary.
 */
export default async function AdminPage() {
  const guard = await guardRoute('/admin');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const report = await healthReport(db());

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
      </div>
    </OpsShell>
  );
}
