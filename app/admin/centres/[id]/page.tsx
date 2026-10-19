import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { ADMIN_NAV, OpsShell } from '../../../../src/ui/shell.tsx';
import { Panel, whenFa } from '../../../../src/ui/desk.tsx';
import { KeyValueList } from '../../../../src/ui/key-value.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { centreEditor, linkableLocations } from '../../../../src/centres/service.ts';
import { LICENCE_STATUS_FA, type LicenceStatusName } from '../../../../src/centres/model.ts';
import { CentreEditor } from '../../../../src/centres/editor.tsx';

export const dynamic = 'force-dynamic';

/**
 * One centre in the superadmin environment (PROMPT-008): a read-only record
 * summary (DS P06) above the editor the superadmin changes it with.
 */
export default async function AdminCentrePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/admin/centres/' + encodeURIComponent(id));
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const data = await centreEditor(db(), guard.actor, id);
  if (data === null) notFound();
  const locations = await linkableLocations(db(), guard.actor);
  const { centre } = data.facts;

  return (
    <OpsShell actor={guard.actor} title="مراکز دامپزشکی" pathname="/admin/centres" nav={ADMIN_NAV}>
      <Link href="/admin/centres" className="hz-link hz-link--standalone hz-hide-md">
        بازگشت به مراکز
      </Link>
      <div className="space-y-lg">
        <Panel
          title={centre.displayNameFa}
          aside={
            <span data-testid="centre-public-status">
              <StatusBadge status={centre.publicStatus} />
            </span>
          }
        >
          <KeyValueList
            twoCol
            rows={[
              { key: 'نوع', value: data.facts.typeNameFa },
              { key: 'مالکیت', value: centre.ownerAccountId ? 'دارای مدیر' : 'بدون مالک' },
              { key: 'شماره مجوز', value: centre.licenceNumber ? <bdi dir="ltr">{centre.licenceNumber}</bdi> : null },
              { key: 'وضعیت مجوز', value: LICENCE_STATUS_FA[centre.licenceStatus as LicenceStatusName] },
              { key: 'شعبه‌ها', value: data.facts.branches.length.toLocaleString('fa-IR') },
              { key: 'نسخه', value: centre.version.toLocaleString('fa-IR') },
              { key: 'آخرین تغییر', value: whenFa(centre.updatedAt) },
            ]}
          />
        </Panel>
        <CentreEditor data={data} surface="admin" unlinkedLocations={locations} headless />
      </div>
    </OpsShell>
  );
}
