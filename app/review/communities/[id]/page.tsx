import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, REVIEW_NAV } from '../../../../src/ui/shell.tsx';
import { db } from '../../../../src/db/client.ts';
import { communityEditor } from '../../../../src/communities/service.ts';
import { CommunityEditor } from '../../../../src/communities/editor.tsx';

export const dynamic = 'force-dynamic';

/** One association or club in the review environment: registration and publication only (PROMPT-010). */
export default async function ReviewCommunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/review/communities/' + encodeURIComponent(id));
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const data = await communityEditor(db(), guard.actor, id);
  if (data === null) notFound();

  return (
    <OpsShell actor={guard.actor} title="اپراتور بررسی" pathname="/review/communities" nav={REVIEW_NAV}>
      <div className="space-y-lg">
        <Link href="/review/communities" className="text-label-md text-text-brand underline underline-offset-4">
          بازگشت به انجمن‌ها و کلاب‌ها
        </Link>
        <CommunityEditor data={data} surface="review" />
      </div>
    </OpsShell>
  );
}
