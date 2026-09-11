import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { ADMIN_NAV, OpsShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { manageableCommunities } from '../../../../src/communities/service.ts';
import { COMMUNITY_KIND_FA, COMMUNITY_SCOPE_FA, type CommunityKind, type CommunityScope } from '../../../../src/communities/model.ts';
import { VET_PUBLIC_STATUS_FA, type VetPublicStatus } from '../../../../src/vets/directory-model.ts';
import { CommunityCreateForm } from '../../../../src/communities/forms.tsx';

export const dynamic = 'force-dynamic';

/** Associations and clubs in the superadmin environment — §11, §21 (PROMPT-010). */
export default async function AdminCommunitiesPage() {
  const guard = await guardRoute('/admin/communities');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const rows = await manageableCommunities(db(), guard.actor);

  return (
    <OpsShell actor={guard.actor} title="هم‌زیست — سوپرادمین" pathname="/admin/communities" nav={ADMIN_NAV}>
      <div className="space-y-lg">
        <CommunityCreateForm surface="admin" />

        <Card>
          <h2 className="text-label-lg">انجمن‌ها و کلاب‌ها</h2>
          {rows.length === 0 ? (
            <div className="mt-lg">
              <EmptyState title="هنوز رکوردی ثبت نشده است" description="با فرم بالا اولین انجمن یا کلاب را ثبت کنید." />
            </div>
          ) : (
            <ul className="mt-lg space-y-sm" data-testid="community-list">
              {rows.map((row) => (
                <li key={row.community.id}>
                  <Link
                    href={'/admin/communities/' + row.community.id}
                    className="block rounded-lg border border-border-subtle p-lg hover:border-border-brand"
                    data-testid={'community-row-' + row.community.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-sm">
                      <div className="min-w-0">
                        <p className="text-label-lg">{row.community.displayNameFa}</p>
                        <p className="mt-2xs text-caption text-text-secondary">
                          {[
                            COMMUNITY_KIND_FA[row.community.kind as CommunityKind],
                            'حوزه ' + COMMUNITY_SCOPE_FA[row.community.scope as CommunityScope],
                            row.cityNameFa ?? row.provinceNameFa,
                            row.eventCount > 0 ? row.eventCount.toLocaleString('fa-IR') + ' رویداد' : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-xs">
                        <StatusBadge tone={row.community.publicStatus === 'PUBLISHED' ? 'success' : row.community.publicStatus === 'HIDDEN' ? 'warning' : 'neutral'}>
                          {VET_PUBLIC_STATUS_FA[row.community.publicStatus as VetPublicStatus]}
                        </StatusBadge>
                        {row.community.canPublishPosts ? <StatusBadge tone="info">ناشر مجاز</StatusBadge> : null}
                        {row.community.ownerAccountId ? null : <StatusBadge tone="warning">بدون مالک</StatusBadge>}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </OpsShell>
  );
}
