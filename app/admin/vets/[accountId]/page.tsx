import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { ADMIN_NAV, OpsShell } from '../../../../src/ui/shell.tsx';
import { Panel, whenFa } from '../../../../src/ui/desk.tsx';
import { KeyValueList } from '../../../../src/ui/key-value.tsx';
import { Identifier, StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { vetDirectoryEditor } from '../../../../src/vets/directory.ts';
import { VetDirectoryEditor } from '../../../../src/vets/directory-editor.tsx';

export const dynamic = 'force-dynamic';

/**
 * One veterinarian's public directory page, edited by the superadmin —
 * Requirements-Phase-2 §7, §21 (PROMPT-006): a read-only record summary (DS
 * P06) above the same editor the owner uses from their own account
 * (PROMPT-007), with a reason required for each change.
 */
export default async function AdminVetDirectoryPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const guard = await guardRoute('/admin/vets/' + encodeURIComponent(accountId));
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const data = await vetDirectoryEditor(db(), guard.actor, accountId);
  if (data === null) notFound();
  const { profile } = data.facts;

  return (
    <OpsShell actor={guard.actor} title="دامپزشکان معتمد" pathname="/admin/vets" nav={ADMIN_NAV}>
      <Link href="/admin/vets" className="hz-link hz-link--standalone hz-hide-md">
        بازگشت به دامپزشکان
      </Link>
      <div className="space-y-lg">
        <Panel
          title={profile.displayNameFa}
          aside={
            <span data-testid="directory-public-status">
              <StatusBadge status={profile.publicStatus} />
            </span>
          }
        >
          <KeyValueList
            twoCol
            rows={[
              { key: 'کد نظام دامپزشکی', value: profile.councilCode ? <Identifier value={profile.councilCode} /> : null },
              { key: 'تأیید کد نظام', value: whenFa(profile.councilVerifiedAt, false) ?? 'تأییدنشده' },
              { key: 'معتمد همزیست', value: data.facts.trusted ? 'بله' : 'خیر' },
              { key: 'محل‌های کار', value: data.facts.locations.length.toLocaleString('fa-IR') },
              { key: 'نسخه', value: profile.version.toLocaleString('fa-IR') },
            ]}
          />
        </Panel>
        <VetDirectoryEditor data={data} surface="admin" headless />
      </div>
    </OpsShell>
  );
}
