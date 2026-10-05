import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { ADMIN_NAV, OpsShell } from '../../../../src/ui/shell.tsx';
import { Panel } from '../../../../src/ui/desk.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { manageableCommunities } from '../../../../src/communities/service.ts';
import { COMMUNITY_KIND_FA, COMMUNITY_SCOPE_FA, type CommunityKind, type CommunityScope } from '../../../../src/communities/model.ts';
import { VET_PUBLIC_STATUS_FA, type VetPublicStatus } from '../../../../src/vets/directory-model.ts';
import { CommunityCreateForm } from '../../../../src/communities/forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * Associations and clubs in the superadmin environment — §11, §21 (PROMPT-010).
 * DS P11: the create form, then the register as a DataTable (cards below 768).
 */
export default async function AdminCommunitiesPage() {
  const guard = await guardRoute('/admin/communities');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const rows = await manageableCommunities(db(), guard.actor);

  return (
    <OpsShell actor={guard.actor} title="انجمن و کلاب" pathname="/admin/communities" nav={ADMIN_NAV}>
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">{rows.length.toLocaleString('fa-IR') + ' انجمن و کلاب'}</span>
      </p>
      <CommunityCreateForm surface="admin" />

      <Panel title="انجمن‌ها و کلاب‌ها" count={rows.length.toLocaleString('fa-IR')}>
        {rows.length === 0 ? (
          <EmptyState title="هنوز رکوردی ثبت نشده است" description="با فرم بالا اولین انجمن یا کلاب را ثبت کنید." />
        ) : (
          <div className="hz-table-wrap">
            <table className="hz-table hz-table--dense hz-table--stack">
              <caption className="hz-visually-hidden">انجمن‌ها و کلاب‌ها</caption>
              <thead>
                <tr>
                  <th scope="col">نام</th>
                  <th scope="col">وضعیت صفحه</th>
                  <th scope="col">انتشار مطلب</th>
                  <th scope="col">مالک</th>
                </tr>
              </thead>
              <tbody data-testid="community-list">
                {rows.map((row) => (
                  <tr key={row.community.id}>
                    <td className="hz-table__lead">
                      <div className="hz-case">
                        <Link
                          href={'/admin/communities/' + row.community.id}
                          className="hz-case__name"
                          data-testid={'community-row-' + row.community.id}
                        >
                          {row.community.displayNameFa}
                        </Link>
                        <span className="hz-case__sub">
                          {[
                            COMMUNITY_KIND_FA[row.community.kind as CommunityKind],
                            'حوزه ' + COMMUNITY_SCOPE_FA[row.community.scope as CommunityScope],
                            row.cityNameFa ?? row.provinceNameFa,
                            row.eventCount > 0 ? row.eventCount.toLocaleString('fa-IR') + ' رویداد' : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </div>
                    </td>
                    <td data-label="وضعیت صفحه">
                      <StatusBadge
                        size="sm"
                        tone={row.community.publicStatus === 'PUBLISHED' ? 'success' : row.community.publicStatus === 'HIDDEN' ? 'warning' : 'neutral'}
                      >
                        {VET_PUBLIC_STATUS_FA[row.community.publicStatus as VetPublicStatus]}
                      </StatusBadge>
                    </td>
                    <td data-label="انتشار مطلب">
                      {row.community.canPublishPosts ? (
                        <StatusBadge size="sm" tone="info">
                          ناشر مجاز
                        </StatusBadge>
                      ) : (
                        <span className="text-body-sm text-text-secondary">—</span>
                      )}
                    </td>
                    <td data-label="مالک">
                      {row.community.ownerAccountId ? (
                        <span className="text-body-sm text-text-secondary">دارای مالک</span>
                      ) : (
                        <StatusBadge size="sm" tone="warning">
                          بدون مالک
                        </StatusBadge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </OpsShell>
  );
}
