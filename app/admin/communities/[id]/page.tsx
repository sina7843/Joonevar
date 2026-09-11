import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { ADMIN_NAV, OpsShell } from '../../../../src/ui/shell.tsx';
import { db } from '../../../../src/db/client.ts';
import { communityEditor } from '../../../../src/communities/service.ts';
import { communityPosts } from '../../../../src/communities/posts.ts';
import { CommunityEditor } from '../../../../src/communities/editor.tsx';

export const dynamic = 'force-dynamic';

/** One association or club in the superadmin environment (PROMPT-010). */
export default async function AdminCommunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/admin/communities/' + encodeURIComponent(id));
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const data = await communityEditor(db(), guard.actor, id);
  if (data === null) notFound();
  // Posts are listed only for a club that may publish; the service refuses otherwise.
  const posts = data.posting === null ? await communityPosts(db(), guard.actor, id) : [];

  return (
    <OpsShell actor={guard.actor} title="هم‌زیست — سوپرادمین" pathname="/admin/communities" nav={ADMIN_NAV}>
      <div className="space-y-lg">
        <Link href="/admin/communities" className="text-label-md text-text-brand underline underline-offset-4">
          بازگشت به انجمن‌ها و کلاب‌ها
        </Link>
        <CommunityEditor data={data} surface="admin" posts={posts} />
      </div>
    </OpsShell>
  );
}
