import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { ADMIN_NAV, OpsShell } from '../../../../src/ui/shell.tsx';
import { Panel, whenFa } from '../../../../src/ui/desk.tsx';
import { KeyValueList } from '../../../../src/ui/key-value.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { communityEditor } from '../../../../src/communities/service.ts';
import { communityPosts } from '../../../../src/communities/posts.ts';
import { COMMUNITY_KIND_FA, COMMUNITY_SCOPE_FA, type CommunityKind, type CommunityScope } from '../../../../src/communities/model.ts';
import { LICENCE_STATUS_FA, type LicenceStatusName } from '../../../../src/centres/model.ts';
import { CommunityEditor } from '../../../../src/communities/editor.tsx';

export const dynamic = 'force-dynamic';

/**
 * One association or club in the superadmin environment (PROMPT-010): a
 * read-only record summary (DS P06) above the editor the superadmin uses.
 */
export default async function AdminCommunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/admin/communities/' + encodeURIComponent(id));
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const data = await communityEditor(db(), guard.actor, id);
  if (data === null) notFound();
  // Posts are listed only for a club that may publish; the service refuses otherwise.
  const posts = data.posting === null ? await communityPosts(db(), guard.actor, id) : [];
  const { community } = data.facts;

  return (
    <OpsShell actor={guard.actor} title="انجمن و کلاب" pathname="/admin/communities" nav={ADMIN_NAV}>
      <Link href="/admin/communities" className="hz-link hz-link--standalone hz-hide-md">
        بازگشت به انجمن‌ها و کلاب‌ها
      </Link>
      <div className="space-y-lg">
        <Panel
          title={community.displayNameFa}
          aside={
            <span data-testid="community-public-status">
              <StatusBadge status={community.publicStatus} />
            </span>
          }
        >
          <KeyValueList
            twoCol
            rows={[
              { key: 'نوع', value: COMMUNITY_KIND_FA[community.kind as CommunityKind] },
              { key: 'حوزه', value: COMMUNITY_SCOPE_FA[community.scope as CommunityScope] },
              { key: 'مالکیت', value: community.ownerAccountId ? 'دارای مدیر' : 'بدون مالک' },
              { key: 'شماره ثبت', value: community.registrationNumber ? <bdi dir="ltr">{community.registrationNumber}</bdi> : null },
              { key: 'وضعیت مجوز', value: LICENCE_STATUS_FA[community.licenceStatus as LicenceStatusName] },
              { key: 'نسخه', value: community.version.toLocaleString('fa-IR') },
              { key: 'آخرین تغییر', value: whenFa(community.updatedAt) },
            ]}
          />
        </Panel>
        <CommunityEditor data={data} surface="admin" posts={posts} headless />
      </div>
    </OpsShell>
  );
}
