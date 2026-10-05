import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, REVIEW_NAV } from '../../../../src/ui/shell.tsx';
import { CaseItem, CaseList, Panel } from '../../../../src/ui/desk.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
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
    <OpsShell actor={guard.actor} title="انجمن و کلاب" pathname="/review/communities" nav={REVIEW_NAV}>
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">{rows.length.toLocaleString('fa-IR') + ' رکورد'}</span>
        <span className="hz-page-header__meta-item">
          مجوز انتشار مستقیم نوشته کلاب را سوپرادمین می‌دهد؛ اینجا فقط ثبت، مجوز و انتشار پرونده انجام می‌شود.
        </span>
      </p>
      <div className="grid items-start gap-lg lg:grid-cols-2">
        <Panel title="انجمن‌ها و کلاب‌ها" count={rows.length.toLocaleString('fa-IR')}>
          {rows.length === 0 ? (
            <EmptyState title="رکوردی ثبت نشده است" description="با فرم ثبت، انجمن یا کلاب بررسی‌شده را ثبت کنید." />
          ) : (
            <CaseList label="انجمن‌ها و کلاب‌ها" testId="community-list">
              {rows.map((row) => (
                <CaseItem
                  key={row.community.id}
                  type={COMMUNITY_KIND_FA[row.community.kind as CommunityKind] + (row.community.ownerAccountId ? '' : ' · بدون مالک')}
                  name={row.community.displayNameFa}
                  href={'/review/communities/' + row.community.id}
                  linkTestId={'community-row-' + row.community.id}
                  sub={['حوزه ' + COMMUNITY_SCOPE_FA[row.community.scope as CommunityScope], row.community.sourceFa ? 'منبع: ' + row.community.sourceFa : null]
                    .filter(Boolean)
                    .join(' · ')}
                  status={{
                    tone: row.community.publicStatus === 'PUBLISHED' ? 'success' : row.community.publicStatus === 'HIDDEN' ? 'warning' : 'neutral',
                    label: VET_PUBLIC_STATUS_FA[row.community.publicStatus as VetPublicStatus],
                  }}
                />
              ))}
            </CaseList>
          )}
        </Panel>
        <CommunityCreateForm surface="review" />
      </div>
    </OpsShell>
  );
}
