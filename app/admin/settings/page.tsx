import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ADMIN_NAV } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { listSettingsForActor } from '../../../src/settings/service.ts';
import { canWriteSettingGroup } from '../../../src/authz/policy.ts';

export const dynamic = 'force-dynamic';

/**
 * Settings panel (§21.4, D15, D16).
 *
 * The list comes from the same permission-scoped service the API uses, so an
 * operator sees exactly the groups they may read. Values are shown read-only
 * here; editing forms arrive with the flows that own them in PROMPT-018.
 */
export default async function AdminSettingsPage() {
  const guard = await guardRoute('/admin/settings');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  const settings = await listSettingsForActor(db(), actor);

  return (
    <OpsShell actor={actor} title="تنظیمات محصول" pathname="/admin/settings" nav={ADMIN_NAV}>
      <div className="space-y-md">
        {settings.map((setting) => (
          <Card key={setting.key}>
            <div className="flex items-start justify-between gap-md">
              <div className="min-w-0">
                <h2 className="text-label-lg">{setting.labelFa}</h2>
                <p className="mt-2xs text-caption text-text-secondary">
                  <bdi className="hz-ltr font-mono">{setting.key}</bdi>
                </p>
              </div>
              {setting.configured ? (
                <StatusBadge tone="success">ثبت‌شده</StatusBadge>
              ) : (
                <StatusBadge tone="warning">تعیین‌نشده</StatusBadge>
              )}
            </div>
            <p className="mt-md text-body-sm">
              مقدار: {setting.configured ? <bdi className="hz-ltr font-mono">{String(setting.value)}</bdi> : '—'}
              <span className="mx-sm text-text-disabled">|</span>
              نسخه: {setting.version}
            </p>
            {setting.noteFa ? <p className="mt-sm text-caption text-text-secondary">{setting.noteFa}</p> : null}
            {!canWriteSettingGroup(actor, setting.group) ? (
              <p className="mt-sm text-caption text-text-disabled">
                این گروه در نقش فعلی شما قابل تغییر نیست.
              </p>
            ) : null}
          </Card>
        ))}
      </div>
    </OpsShell>
  );
}
