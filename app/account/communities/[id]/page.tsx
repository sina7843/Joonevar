import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { PageHeader } from '../../../../src/ui/section-header.tsx';
import { PageCrumbs } from '../../../../src/ui/page-crumbs.tsx';
import { db } from '../../../../src/db/client.ts';
import { communityEditor } from '../../../../src/communities/service.ts';
import { communityPosts } from '../../../../src/communities/posts.ts';
import { CommunityEditor } from '../../../../src/communities/editor.tsx';

export const dynamic = 'force-dynamic';

/** One association or club, managed by its own account (P2-D07; PROMPT-010). P06 record file. */
export default async function AccountCommunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // The real address, so signing in returns to this record.
  const guard = await guardRoute('/account/communities/' + encodeURIComponent(id));
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const data = await communityEditor(db(), guard.actor, id);
  if (data === null) notFound();
  const posts = data.posting === null ? await communityPosts(db(), guard.actor, id) : [];
  const name = data.facts.community.displayNameFa;

  return (
    <PublicShell
      actor={guard.actor}
      title={name}
      pathname="/account/communities"
      header={
        <div>
          <PageCrumbs items={[{ href: '/dashboard', name: 'خانه' }, { href: '/account/communities', name: 'انجمن و کلاب من' }, { name }]} />
          <PageHeader title={name} back={{ href: '/account/communities', label: 'بازگشت به انجمن و کلاب من' }} />
        </div>
      }
    >
      <CommunityEditor data={data} surface="owner" posts={posts} />
    </PublicShell>
  );
}
