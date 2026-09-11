import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, REVIEW_NAV } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { manageableCommunities } from '../../../../src/communities/service.ts';
import { COMMUNITY_KIND_FA, COMMUNITY_SCOPE_FA, type CommunityKind, type CommunityScope } from '../../../../src/communities/model.ts';
import { VET_PUBLIC_STATUS_FA, type VetPublicStatus } from '../../../../src/vets/directory-model.ts';
import { CommunityCreateForm } from '../../../../src/communities/forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * Associations and clubs in the review environment — §11, §21 (PROMPT-010).
 * The reviewer records a registration and publishes or hides; the content of a
 * record with a manager belongs to that manager.
 */
export default async function ReviewCommunitiesPage() {
  const guard = await guardRoute('/review/communities');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const rows = await manageableCommunities(db(), guard.actor);

  return (
    <OpsShell actor={guard.actor} title="اپراتور بررسی" pathname="/review/communities" nav={REVIEW_NAV}>
      <div className="space-y-lg">
        <CommunityCreateForm surface="review" />

        <Card>
          <h2 className="text-label-lg">انجمن‌ها و کلاب‌ها</h2>
          <p className="mt-xs text-body-sm text-text-secondary">
            مجوز انتشار مستقیم نوشته کلاب را سوپرادمین می‌دهد؛ اینجا فقط ثبت، مجوز و انتشار پرونده انجام می‌شود.
          </p>
          {rows.length === 0 ? (
            <div className="mt-lg">
              <EmptyState title="رکوردی ثبت نشده است" description="با فرم بالا انجمن یا کلاب بررسی‌شده را ثبت کنید." />
            </div>
          ) : (
            <ul className="mt-lg space-y-sm" data-testid="community-list">
              {rows.map((row) => (
                <li key={row.community.id}>
                  <Link
                    href={'/review/communities/' + row.community.id}
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
                            row.community.sourceFa ? 'منبع: ' + row.community.sourceFa : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-xs">
                        <StatusBadge tone={row.community.publicStatus === 'PUBLISHED' ? 'success' : row.community.publicStatus === 'HIDDEN' ? 'warning' : 'neutral'}>
                          {VET_PUBLIC_STATUS_FA[row.community.publicStatus as VetPublicStatus]}
                        </StatusBadge>
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
