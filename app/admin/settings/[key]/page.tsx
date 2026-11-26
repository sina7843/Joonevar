import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, ADMIN_NAV } from '../../../../src/ui/shell.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';
import { db } from '../../../../src/db/client.ts';
import { AppError } from '../../../../src/domain/errors.ts';
import { SETTING_BY_KEY } from '../../../../src/settings/keys.ts';
import { readSettingForActor } from '../../../../src/settings/service.ts';
import { canWriteSettingGroup, type SettingGroupName } from '../../../../src/authz/policy.ts';
import { SettingRow } from '../../../../src/ui/setting-row.tsx';
import { GROUP_FA, rowData } from '../model.ts';
import { updateSettingAction } from '../actions.ts';

export const dynamic = 'force-dynamic';

/**
 * One setting's edit page (P11 / K15 edit, below 768): back to the group, the
 * row already open, and the save bar sticky at the bottom. The same versioned,
 * reason-required save as the inline row.
 */
export default async function AdminSettingEditPage({ params }: { params: Promise<{ key: string }> }) {
  const guard = await guardRoute('/admin/settings');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const key = decodeURIComponent((await params).key);
  if (!SETTING_BY_KEY.has(key)) notFound();
  let setting;
  try {
    setting = await readSettingForActor(db(), guard.actor, key);
  } catch (error) {
    if (error instanceof AppError) return <AccessDenied error={error} />;
    throw error;
  }
  const group = setting.group as SettingGroupName;
  return (
    <OpsShell actor={guard.actor} title={setting.labelFa} pathname="/admin/settings" nav={ADMIN_NAV}>
      <Link href={'/admin/settings?group=' + group} className="hz-link hz-link--standalone">
        <Icon name="arrowRight" size="xs" mirror />
        {GROUP_FA[group] ?? group}
      </Link>
      <section className="hz-card">
        <SettingRow
          setting={rowData(setting)}
          writable={canWriteSettingGroup(guard.actor, group)}
          action={updateSettingAction}
          startOpen={canWriteSettingGroup(guard.actor, group)}
          ids={{
            value: 'setting-value-' + key,
            reason: 'setting-reason-' + key,
            save: 'save-setting-' + key,
            edit: 'setting-edit-' + key,
            form: 'setting-form-' + key,
            display: 'setting-display-' + key,
            reload: 'setting-reload-' + key,
          }}
          hints={setting.noteFa ? <span className="hz-setting__hint">{setting.noteFa}</span> : null}
        />
      </section>
      <Link href="/admin/audit?target=PRODUCT_SETTING" className="hz-link hz-link--standalone">
        <Icon name="clockCounterClockwise" size="xs" />
        تاریخچه تغییرات تنظیمات
      </Link>
    </OpsShell>
  );
}
