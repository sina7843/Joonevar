import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { ADMIN_NAV, OpsShell } from '../../../../src/ui/shell.tsx';
import { db } from '../../../../src/db/client.ts';
import { centreEditor, linkableLocations } from '../../../../src/centres/service.ts';
import { CentreEditor } from '../../../../src/centres/editor.tsx';

export const dynamic = 'force-dynamic';

/** One centre in the superadmin environment (PROMPT-008). */
export default async function AdminCentrePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/admin/centres/' + encodeURIComponent(id));
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const data = await centreEditor(db(), guard.actor, id);
  if (data === null) notFound();
  const locations = await linkableLocations(db(), guard.actor);

  return (
    <OpsShell actor={guard.actor} title="هم‌زیست — سوپرادمین" pathname="/admin/centres" nav={ADMIN_NAV}>
      <div className="space-y-lg">
        <Link href="/admin/centres" className="text-label-md text-text-brand underline underline-offset-4">
          بازگشت به مراکز
        </Link>
        <CentreEditor data={data} surface="admin" unlinkedLocations={locations} />
      </div>
    </OpsShell>
  );
}
