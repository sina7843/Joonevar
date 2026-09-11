import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, CONTENT_NAV } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { restrictionHistory } from '../../../src/moderation/service.ts';
import { formatInstantFa } from '../../../src/content/model.ts';
import { LiftRestrictionForm } from '../../../src/moderation/forms.tsx';

export const dynamic = 'force-dynamic';

/** Publisher restrictions — §13. Each ends by its date or when lifted with a reason. */
export default async function ContentRestrictionsPage() {
  const guard = await guardRoute('/content/restrictions');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const rows = await restrictionHistory(db(), guard.actor);

  return (
    <OpsShell actor={guard.actor} title="ادمین محتوا" pathname="/content/restrictions" nav={CONTENT_NAV}>
      <div className="space-y-lg">
        <Card>
          <h1 className="text-h4">محدودیت ناشر</h1>
          <p className="mt-xs text-body-sm text-text-secondary">
            نویسنده محدودشده نمی‌تواند محتوا منتشر کند یا محتوای منتشرشده را تغییر دهد؛ پیش‌نویس‌هایش قابل ویرایش
            می‌مانند. محدودیت از صفحه گزارش یک محتوا ثبت می‌شود.
          </p>
        </Card>
        {rows.length === 0 ? (
          <EmptyState title="هیچ محدودیتی ثبت نشده است" description="محدودیت‌های ثبت‌شده و برداشته‌شده اینجا می‌مانند." />
        ) : (
          <ul className="space-y-sm" data-testid="restriction-list">
            {rows.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border border-border-subtle bg-bg-surface p-lg"
                data-testid={'restriction-' + row.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-sm">
                  <p className="text-label-lg">{row.authorName}</p>
                  <StatusBadge tone={row.active ? 'warning' : 'neutral'}>
                    {row.active ? 'فعال' : row.liftedAt ? 'برداشته‌شده' : 'پایان‌یافته'}
                  </StatusBadge>
                </div>
                <p className="mt-xs text-body-sm">{row.reason}</p>
                <p className="mt-xs text-caption text-text-secondary">
                  {'از ' + formatInstantFa(row.startsAt) + ' · ' + (row.endsAt ? 'تا ' + formatInstantFa(row.endsAt) : 'تا برداشتن')}
                  {row.liftedAt ? ' · برداشته شد: ' + formatInstantFa(row.liftedAt) + ' — ' + (row.liftReason ?? '') : ''}
                </p>
                {row.active ? <LiftRestrictionForm restrictionId={row.id} /> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </OpsShell>
  );
}
