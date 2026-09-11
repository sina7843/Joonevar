import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ADMIN_NAV } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { CONTENT_ROLE_FA, contentRoleHolders, type ContentRoleName } from '../../../src/content/roles.ts';
import { ContentRoleForm } from './forms.tsx';

export const dynamic = 'force-dynamic';

/** Content roles — P2-D11 (PROMPT-004). Granted and suspended here, with a reason, never by any other role. */
export default async function AdminRolesPage() {
  const guard = await guardRoute('/admin/roles');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const holders = await contentRoleHolders(db(), guard.actor);

  return (
    <OpsShell actor={guard.actor} title="سوپرادمین" pathname="/admin/roles" nav={ADMIN_NAV}>
      <div className="space-y-lg">
        <ContentRoleForm />
        <Card>
          <h2 className="text-label-lg">نویسندگان و ادمین‌های محتوا</h2>
          {holders.length === 0 ? (
            <div className="mt-lg">
              <EmptyState title="هنوز نقشی داده نشده است" description="با فرم بالا نقش نویسنده یا ادمین محتوا را فعال کنید." />
            </div>
          ) : (
            <ul className="mt-lg space-y-sm" data-testid="content-role-holders">
              {holders.map((holder) => (
                <li
                  key={holder.accountId + holder.role}
                  className="flex flex-wrap items-center justify-between gap-sm rounded-lg border border-border-subtle p-md"
                  data-testid={'role-holder-' + holder.mobile + '-' + holder.role}
                >
                  <div className="min-w-0">
                    <p className="text-label-md">
                      {holder.firstName ? holder.firstName + ' ' + (holder.lastName ?? '') : 'بدون پروفایل'}
                    </p>
                    <p className="text-caption text-text-secondary">
                      <bdi dir="ltr">{holder.mobile}</bdi>
                    </p>
                  </div>
                  <div className="flex gap-xs">
                    <StatusBadge tone="info">{CONTENT_ROLE_FA[holder.role as ContentRoleName]}</StatusBadge>
                    <StatusBadge tone={holder.status === 'ACTIVE' ? 'success' : 'neutral'}>
                      {holder.status === 'ACTIVE' ? 'فعال' : 'تعلیق‌شده'}
                    </StatusBadge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </OpsShell>
  );
}
