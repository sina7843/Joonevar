import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import {
  isMarketSettingGroup,
  marketSettingGroups,
  MARKET_GROUP_FA,
  MARKET_SETTING_GROUPS,
} from '../../../src/marketplace/operations.ts';
import { canReadSettingGroup } from '../../../src/authz/policy.ts';
import { AppError } from '../../../src/domain/errors.ts';
import { MarketSettingForm } from '../forms.tsx';

export const dynamic = 'force-dynamic';

const SOURCE_FA: Record<string, string> = {
  PRODUCT_DECISION: 'تصمیم محصول',
  DOCUMENTED_POLICY: 'سیاست مستند',
  TECHNICAL_DEFAULT: 'پیش‌فرض فنی',
  OPERATIONAL_DATA: 'داده عملیاتی',
};

/**
 * Managed marketplace values — Phase 3, PROMPT-002.
 *
 * Grouped, because forty values in one column is a list nobody reads. Each row
 * says where its number comes from, so an operating default is never mistaken
 * later for an approved tariff, and links to its own history.
 */
export default async function MarketSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const guard = await guardRoute('/market/settings');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  const { group } = await searchParams;
  const selected = isMarketSettingGroup(group) ? group : undefined;
  // Asking for a group by URL that this role may not read is a refusal, not a
  // crash: the service throws and the denial screen answers, the same as every
  // other guarded surface. Found by the browser suite, which walked the URL.
  let groups;
  try {
    groups = await marketSettingGroups(db(), actor, selected);
  } catch (error) {
    if (error instanceof AppError) return <AccessDenied error={error} />;
    throw error;
  }
  const tabs = MARKET_SETTING_GROUPS.filter((name) => canReadSettingGroup(actor, name));

  return (
    <OpsShell actor={actor} title="تنظیمات بازار" pathname="/market/settings" nav={marketNav(actor)}>
      <div className="space-y-lg">
        <Card>
          <h2 className="text-label-lg">گروه‌ها</h2>
          <ul className="mt-md flex flex-wrap gap-sm" data-testid="market-setting-tabs">
            <li>
              <Link
                href="/market/settings"
                className="rounded-md border border-border-subtle px-md py-2xs text-caption"
                data-testid="market-tab-all"
              >
                همه
              </Link>
            </li>
            {tabs.map((name) => (
              <li key={name}>
                <Link
                  href={'/market/settings?group=' + name}
                  aria-current={selected === name ? 'page' : undefined}
                  className={[
                    'rounded-md border px-md py-2xs text-caption',
                    selected === name ? 'border-border-brand text-text-brand' : 'border-border-subtle',
                  ].join(' ')}
                  data-testid={'market-tab-' + name}
                >
                  {MARKET_GROUP_FA[name]}
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        {groups.length === 0 ? (
          <Card>
            <EmptyState
              title="گروهی برای نمایش نیست"
              description="نقش فعلی شما هیچ‌کدام از گروه‌های تنظیمات بازار را نمی‌خواند."
            />
          </Card>
        ) : null}

        {groups.map((view) => (
          <Card key={view.group}>
            <div className="flex flex-wrap items-center justify-between gap-sm">
              <h2 className="text-label-lg">{view.labelFa}</h2>
              <StatusBadge tone={view.unset === 0 ? 'success' : 'warning'}>
                {'تعیین‌نشده: ' + view.unset.toLocaleString('fa-IR')}
              </StatusBadge>
            </div>
            <ul className="mt-lg space-y-md">
              {view.settings.map((setting) => (
                <li
                  key={setting.key}
                  className="rounded-lg border border-border-subtle p-md"
                  data-testid={'market-setting-' + setting.key}
                >
                  <div className="flex flex-wrap items-start justify-between gap-sm">
                    <div className="min-w-0">
                      <p className="text-label-md">{setting.labelFa}</p>
                      <p className="mt-2xs text-caption text-text-secondary">
                        <bdi className="hz-ltr font-mono">{setting.key}</bdi>
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-xs">
                      <StatusBadge tone="neutral">{SOURCE_FA[setting.source] ?? setting.source}</StatusBadge>
                      <StatusBadge tone={setting.configured ? 'success' : 'warning'}>
                        {setting.configured ? 'ثبت‌شده' : 'تعیین‌نشده'}
                      </StatusBadge>
                    </div>
                  </div>
                  <p className="mt-sm text-body-sm">
                    مقدار:{' '}
                    {setting.configured ? (
                      <bdi className="hz-ltr font-mono" data-testid={'market-value-' + setting.key}>
                        {typeof setting.value === 'object' ? JSON.stringify(setting.value) : String(setting.value)}
                      </bdi>
                    ) : (
                      '—'
                    )}
                    <span className="mx-sm text-text-disabled">|</span>
                    نسخه: {setting.version.toLocaleString('fa-IR')}
                    <span className="mx-sm text-text-disabled">|</span>
                    <Link
                      href={'/market/settings/' + encodeURIComponent(setting.key)}
                      className="text-text-brand"
                      data-testid={'market-history-link-' + setting.key}
                    >
                      تاریخچه
                    </Link>
                  </p>
                  {setting.noteFa ? (
                    <p className="mt-sm text-caption text-text-secondary">{setting.noteFa}</p>
                  ) : null}
                  {view.writable ? (
                    <MarketSettingForm
                      settingKey={setting.key}
                      version={setting.version}
                      value={
                        setting.configured
                          ? typeof setting.value === 'object'
                            ? JSON.stringify(setting.value)
                            : String(setting.value)
                          : ''
                      }
                      kind={setting.kind}
                    />
                  ) : (
                    <p className="mt-sm text-caption text-text-disabled">
                      این گروه در نقش فعلی شما فقط خواندنی است.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </OpsShell>
  );
}
