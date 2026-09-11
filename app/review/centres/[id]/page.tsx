import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, REVIEW_NAV } from '../../../../src/ui/shell.tsx';
import { db } from '../../../../src/db/client.ts';
import { centreEditor } from '../../../../src/centres/service.ts';
import { CentreEditor } from '../../../../src/centres/editor.tsx';

export const dynamic = 'force-dynamic';

/** One centre in the review environment: publication and licence only (PROMPT-008). */
export default async function ReviewCentrePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/review/centres/' + encodeURIComponent(id));
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const data = await centreEditor(db(), guard.actor, id);
  if (data === null) notFound();

  return (
    <OpsShell actor={guard.actor} title="اپراتور بررسی" pathname="/review/centres" nav={REVIEW_NAV}>
      <div className="space-y-lg">
        <Link href="/review/centres" className="text-label-md text-text-brand underline underline-offset-4">
          بازگشت به مراکز
        </Link>
        <CentreEditor data={data} surface="review" />
      </div>
    </OpsShell>
  );
}
