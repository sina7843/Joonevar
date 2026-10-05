import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, CONTENT_NAV } from '../../../src/ui/shell.tsx';
import { CaseItem, CaseList } from '../../../src/ui/desk.tsx';
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
    <OpsShell actor={guard.actor} title="محدودیت ناشر" pathname="/content/restrictions" nav={CONTENT_NAV}>
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">
          نویسنده محدودشده نمی‌تواند محتوا منتشر کند یا محتوای منتشرشده را تغییر دهد؛ پیش‌نویس‌هایش قابل ویرایش
          می‌مانند. محدودیت از صفحه گزارش یک محتوا ثبت می‌شود.
        </span>
      </p>
      {rows.length === 0 ? (
        <EmptyState title="هیچ محدودیتی ثبت نشده است" description="محدودیت‌های ثبت‌شده و برداشته‌شده اینجا می‌مانند." />
      ) : (
        <CaseList label="محدودیت‌های ناشر" testId="restriction-list">
          {rows.map((row) => (
            <CaseItem
              key={row.id}
              testId={'restriction-' + row.id}
              name={row.authorName}
              sub={
                <>
                  <span className="block text-body-sm text-text-primary">{row.reason}</span>
                  {'از ' + formatInstantFa(row.startsAt) + ' · ' + (row.endsAt ? 'تا ' + formatInstantFa(row.endsAt) : 'تا برداشتن')}
                  {row.liftedAt ? ' · برداشته شد: ' + formatInstantFa(row.liftedAt) + ' — ' + (row.liftReason ?? '') : ''}
                </>
              }
              status={{ tone: row.active ? 'warning' : 'neutral', label: row.active ? 'فعال' : row.liftedAt ? 'برداشته‌شده' : 'پایان‌یافته' }}
            >
              {row.active ? <LiftRestrictionForm restrictionId={row.id} /> : null}
            </CaseItem>
          ))}
        </CaseList>
      )}
    </OpsShell>
  );
}
