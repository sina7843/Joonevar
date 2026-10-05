import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { PageHeader } from '../../../../src/ui/section-header.tsx';
import { PageCrumbs } from '../../../../src/ui/page-crumbs.tsx';
import { db } from '../../../../src/db/client.ts';
import { centreEditor } from '../../../../src/centres/service.ts';
import { CentreEditor } from '../../../../src/centres/editor.tsx';

export const dynamic = 'force-dynamic';

/** One centre, managed by its own account (P2-D07; PROMPT-008). P06 record file. */
export default async function AccountCentrePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // The real address, so signing in returns to this centre.
  const guard = await guardRoute('/account/centres/' + encodeURIComponent(id));
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const data = await centreEditor(db(), guard.actor, id);
  if (data === null) notFound();
  const name = data.facts.centre.displayNameFa;

  return (
    <PublicShell
      actor={guard.actor}
      title={name}
      pathname="/account/centres"
      header={
        <div>
          <PageCrumbs items={[{ href: '/dashboard', name: 'خانه' }, { href: '/account/centres', name: 'مراکز من' }, { name }]} />
          <PageHeader title={name} back={{ href: '/account/centres', label: 'بازگشت به مراکز من' }} />
        </div>
      }
    >
      <CentreEditor data={data} surface="owner" />
    </PublicShell>
  );
}
