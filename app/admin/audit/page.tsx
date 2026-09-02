import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ADMIN_NAV } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { auditHistory, auditTargetTypes } from '../../../src/operations/service.ts';

export const dynamic = 'force-dynamic';

/**
 * The operational history — §21.4, §23.3.
 *
 * It reads the audit rows the feature modules wrote, with the redaction they
 * applied at write time. It is a viewer: nothing here can change a record.
 */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ target?: string }>;
}) {
  const guard = await guardRoute('/admin/audit');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const { target } = await searchParams;
  const [rows, targets] = await Promise.all([
    auditHistory(db(), guard.actor, { targetType: target ?? null, limit: 50 }),
    auditTargetTypes(db(), guard.actor),
  ]);

  return (
    <OpsShell actor={guard.actor} title="سوپرادمین" pathname="/admin/audit" nav={ADMIN_NAV}>
      <div className="space-y-lg">
        <Alert tone="info" title="این صفحه فقط خواندنی است">
          <span data-testid="audit-readonly">
            رویدادها همان‌جایی ثبت شده‌اند که تغییر رخ داده است؛ از این صفحه هیچ رکوردی تغییر نمی‌کند و مقادیر
            حساس در زمان ثبت حذف شده‌اند.
          </span>
        </Alert>

        <Card>
          <h2 className="text-label-lg">فیلتر بر اساس نوع پرونده</h2>
          <ul className="mt-md flex flex-wrap gap-sm" data-testid="audit-filters">
            <li>
              <a
                href="/admin/audit"
                className="rounded-md border border-border-subtle px-md py-2xs text-caption"
                data-testid="audit-filter-all"
              >
                همه
              </a>
            </li>
            {targets.map((value) => (
              <li key={value}>
                <a
                  href={'/admin/audit?target=' + encodeURIComponent(value)}
                  className="rounded-md border border-border-subtle px-md py-2xs text-caption"
                  data-testid={'audit-filter-' + value}
                >
                  {value}
                </a>
              </li>
            ))}
          </ul>
        </Card>

        {rows.length === 0 ? (
          <EmptyState title="رویدادی ثبت نشده است" description="با انجام اولین عملیات، سوابق اینجا دیده می‌شوند." />
        ) : (
          <ul className="space-y-md" data-testid="audit-list">
            {rows.map((row) => (
              <li key={row.id}>
                <Card>
                  <h3 className="text-label-md" data-testid="audit-action">
                    {row.action}
                  </h3>
                  <p className="mt-2xs text-caption text-text-secondary">
                    {row.targetType} · {row.occurredAt.toISOString()} ·{' '}
                    {row.actorType === 'SYSTEM' ? 'سامانه' : (row.actorContext ?? 'کاربر')}
                  </p>
                  {row.reason ? <p className="mt-sm text-body-sm">دلیل: {row.reason}</p> : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </OpsShell>
  );
}
