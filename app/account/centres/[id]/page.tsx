import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { db } from '../../../../src/db/client.ts';
import { centreEditor } from '../../../../src/centres/service.ts';
import { CentreEditor } from '../../../../src/centres/editor.tsx';

export const dynamic = 'force-dynamic';

/** One centre, managed by its own account (P2-D07; PROMPT-008). */
export default async function AccountCentrePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // The real address, so signing in returns to this centre.
  const guard = await guardRoute('/account/centres/' + encodeURIComponent(id));
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const data = await centreEditor(db(), guard.actor, id);
  if (data === null) notFound();

  return (
    <PublicShell actor={guard.actor} title={data.facts.centre.displayNameFa} pathname="/account/centres">
      <div className="space-y-lg">
        <Link href="/account/centres" className="text-label-md text-text-brand underline underline-offset-4">
          بازگشت به مراکز من
        </Link>
        <CentreEditor data={data} surface="owner" />
      </div>
    </PublicShell>
  );
}
