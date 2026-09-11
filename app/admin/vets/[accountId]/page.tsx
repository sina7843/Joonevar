import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { ADMIN_NAV, OpsShell } from '../../../../src/ui/shell.tsx';
import { db } from '../../../../src/db/client.ts';
import { vetDirectoryEditor } from '../../../../src/vets/directory.ts';
import { VetDirectoryEditor } from '../../../../src/vets/directory-editor.tsx';

export const dynamic = 'force-dynamic';

/**
 * One veterinarian's public directory page, edited by the superadmin —
 * Requirements-Phase-2 §7, §21 (PROMPT-006). The same editor the owner uses
 * from their own account (PROMPT-007), with a reason required for each change.
 */
export default async function AdminVetDirectoryPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const guard = await guardRoute('/admin/vets/' + encodeURIComponent(accountId));
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const data = await vetDirectoryEditor(db(), guard.actor, accountId);
  if (data === null) notFound();

  return (
    <OpsShell actor={guard.actor} title="هم‌زیست — سوپرادمین" pathname="/admin/vets" nav={ADMIN_NAV}>
      <div className="space-y-lg">
        <Link href="/admin/vets" className="text-label-md text-text-brand underline underline-offset-4">
          بازگشت به دامپزشکان
        </Link>
        <VetDirectoryEditor data={data} surface="admin" />
      </div>
    </OpsShell>
  );
}
