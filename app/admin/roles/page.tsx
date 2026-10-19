import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ADMIN_NAV } from '../../../src/ui/shell.tsx';
import { Panel } from '../../../src/ui/desk.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { CONTENT_ROLE_FA, contentRoleHolders, type ContentRoleName } from '../../../src/content/roles.ts';
import { marketplaceRoleHolders, MARKETPLACE_ROLE_FA, type MarketplaceRoleName } from '../../../src/marketplace/roles.ts';
import { ContentRoleForm, MarketplaceRoleForm } from './forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * Content roles — P2-D11 (PROMPT-004). Granted and suspended here, with a reason, never by any other role.
 * DS P11 entity config: per role family, the change form beside its holders table.
 */
export default async function AdminRolesPage() {
  const guard = await guardRoute('/admin/roles');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const [holders, marketHolders] = await Promise.all([
    contentRoleHolders(db(), guard.actor),
    marketplaceRoleHolders(db(), guard.actor),
  ]);

  return (
    <OpsShell actor={guard.actor} title="نقش‌های محتوا" pathname="/admin/roles" nav={ADMIN_NAV}>
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">{holders.length.toLocaleString('fa-IR') + ' نقش محتوا'}</span>
        <span className="hz-page-header__meta-item">{marketHolders.length.toLocaleString('fa-IR') + ' نقش بازار'}</span>
        <span className="hz-page-header__meta-item">هر تغییر با دلیل در تاریخچه می‌ماند</span>
      </p>
      <div className="grid items-start gap-lg lg:grid-cols-2">
        <ContentRoleForm />
        <Panel title="نویسندگان و ادمین‌های محتوا" count={holders.length.toLocaleString('fa-IR')}>
          {holders.length === 0 ? (
            <EmptyState title="هنوز نقشی داده نشده است" description="با فرم کنار این فهرست نقش نویسنده یا ادمین محتوا را فعال کنید." />
          ) : (
            <div className="hz-table-wrap">
              <table className="hz-table hz-table--dense hz-table--stack">
                <caption className="hz-visually-hidden">نویسندگان و ادمین‌های محتوا</caption>
                <thead>
                  <tr>
                    <th scope="col">دارنده نقش</th>
                    <th scope="col">نقش</th>
                    <th scope="col">وضعیت</th>
                  </tr>
                </thead>
                <tbody data-testid="content-role-holders">
                  {holders.map((holder) => (
                    <tr key={holder.accountId + holder.role} data-testid={'role-holder-' + holder.mobile + '-' + holder.role}>
                      <td className="hz-table__lead">
                        <div className="hz-case">
                          <span className="hz-case__name">
                            {holder.firstName ? holder.firstName + ' ' + (holder.lastName ?? '') : 'بدون پروفایل'}
                          </span>
                          <bdi className="hz-case__sub" dir="ltr">
                            {holder.mobile}
                          </bdi>
                        </div>
                      </td>
                      <td data-label="نقش">
                        <span className="hz-tag hz-tag--neutral">{CONTENT_ROLE_FA[holder.role as ContentRoleName]}</span>
                      </td>
                      <td data-label="وضعیت">
                        <StatusBadge status={holder.status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED'} size="sm" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid items-start gap-lg lg:grid-cols-2">
        <MarketplaceRoleForm />
        <Panel title="نقش‌های عملیاتی بازار و فروشگاه" count={marketHolders.length.toLocaleString('fa-IR')}>
          {marketHolders.length === 0 ? (
            <EmptyState title="هنوز نقشی داده نشده است" description="با فرم کنار این فهرست یکی از شش نقش عملیاتی بازار را فعال کنید." />
          ) : (
            <div className="hz-table-wrap">
              <table className="hz-table hz-table--dense hz-table--stack">
                <caption className="hz-visually-hidden">نقش‌های عملیاتی بازار و فروشگاه</caption>
                <thead>
                  <tr>
                    <th scope="col">دارنده نقش</th>
                    <th scope="col">نقش</th>
                    <th scope="col">وضعیت</th>
                  </tr>
                </thead>
                <tbody data-testid="marketplace-role-holders">
                  {marketHolders.map((holder) => (
                    <tr key={holder.accountId + holder.role} data-testid={'market-role-holder-' + holder.mobile + '-' + holder.role}>
                      <td className="hz-table__lead">
                        <div className="hz-case">
                          <span className="hz-case__name">
                            {holder.firstName ? holder.firstName + ' ' + (holder.lastName ?? '') : 'بدون پروفایل'}
                          </span>
                          <bdi className="hz-case__sub" dir="ltr">
                            {holder.mobile}
                          </bdi>
                        </div>
                      </td>
                      <td data-label="نقش">
                        <span className="hz-tag hz-tag--neutral">{MARKETPLACE_ROLE_FA[holder.role as MarketplaceRoleName]}</span>
                      </td>
                      <td data-label="وضعیت">
                        <StatusBadge status={holder.status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED'} size="sm" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </OpsShell>
  );
}
