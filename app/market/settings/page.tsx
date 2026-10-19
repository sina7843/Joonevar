import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../src/ui/shell.tsx';
import { ViewChips } from '../../../src/ui/desk.tsx';
import { SectionHeader } from '../../../src/ui/section-header.tsx';
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
/** The stored value as written (operators edit the raw form). */
const shown = (value: unknown): string => (typeof value === 'object' ? JSON.stringify(value) : String(value));

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

  const unset = groups.reduce((sum, view) => sum + view.unset, 0);
  const keys = groups.reduce((sum, view) => sum + view.settings.length, 0);
  return (
    <OpsShell actor={actor} title="تنظیمات بازار" pathname="/market/settings" nav={marketNav(actor)}>
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">
          {keys.toLocaleString('fa-IR') + ' کلید در ' + groups.length.toLocaleString('fa-IR') + ' گروه · ' + unset.toLocaleString('fa-IR') + ' تعیین‌نشده'}
        </span>
        <span className="hz-page-header__meta-item">هر تغییر نسخه‌دار است و با دلیل در تاریخچه می‌ماند</span>
      </p>

      <div className="hz-settings">
        <nav className="hz-settings__nav hz-show-lg self-start" aria-label="گروه‌های تنظیمات بازار" data-testid="market-setting-tabs">
          <p className="hz-settings__nav-title">{tabs.length.toLocaleString('fa-IR') + ' گروه'}</p>
          <Link
            href="/market/settings"
            aria-current={selected === undefined ? 'page' : undefined}
            className="hz-side-item hz-side-item--dense aria-[current=page]:bg-bg-brand-subtle aria-[current=page]:text-text-brand"
            data-testid="market-tab-all"
          >
            <span className="hz-side-item__label">همه</span>
          </Link>
          {tabs.map((name) => (
            <Link
              key={name}
              href={'/market/settings?group=' + name}
              aria-current={selected === name ? 'page' : undefined}
              className="hz-side-item hz-side-item--dense aria-[current=page]:bg-bg-brand-subtle aria-[current=page]:text-text-brand"
              data-testid={'market-tab-' + name}
            >
              <span className="hz-side-item__label">{MARKET_GROUP_FA[name]}</span>
            </Link>
          ))}
        </nav>

        <div className="hz-settings__main">
          <div className="hz-hide-lg">
            <ViewChips
              label="گروه‌های تنظیمات بازار"
              chips={[
                { key: 'all', href: '/market/settings', label: 'همه', current: selected === undefined },
                ...tabs.map((name) => ({
                  key: name,
                  href: '/market/settings?group=' + name,
                  label: MARKET_GROUP_FA[name],
                  current: selected === name,
                })),
              ]}
            />
          </div>

          {groups.length === 0 ? (
            <EmptyState
              title="گروهی برای نمایش نیست"
              description="نقش فعلی شما هیچ‌کدام از گروه‌های تنظیمات بازار را نمی‌خواند."
            />
          ) : null}

          {groups.map((view) => (
            <section key={view.group} className="hz-card" aria-labelledby={'market-group-title-' + view.group}>
              <div className="flex flex-wrap items-center justify-between gap-sm">
                <SectionHeader title={view.labelFa} size="sm" id={'market-group-title-' + view.group} />
                <span className="hz-tag hz-tag--neutral">{'تعیین‌نشده: ' + view.unset.toLocaleString('fa-IR')}</span>
              </div>
              {view.writable ? null : (
                <p className="mt-xs text-caption text-text-secondary">این گروه در نقش فعلی شما فقط خواندنی است.</p>
              )}
              <ul>
                {view.settings.map((setting) => (
                  <li key={setting.key} className="hz-setting" data-testid={'market-setting-' + setting.key}>
                    <div className="hz-setting__label">
                      <span className="hz-setting__name">{setting.labelFa}</span>
                      <bdi className="hz-setting__key" dir="ltr">
                        {setting.key}
                      </bdi>
                      {setting.noteFa ? <span className="hz-setting__hint">{setting.noteFa}</span> : null}
                      {!setting.configured ? (
                        <span className="hz-setting__hint">تا تعیین مقدار، مسیر وابسته به این کلید بسته می‌ماند.</span>
                      ) : null}
                      <span className="hz-setting__hint">
                        {(SOURCE_FA[setting.source] ?? setting.source) + ' · نسخه ' + setting.version.toLocaleString('fa-IR') + ' · '}
                        <Link
                          href={'/market/settings/' + encodeURIComponent(setting.key)}
                          className="hz-link"
                          data-testid={'market-history-link-' + setting.key}
                        >
                          تاریخچه
                        </Link>
                      </span>
                    </div>
                    <div className="hz-setting__end">
                      {setting.configured ? (
                        <bdi
                          className={
                            shown(setting.value).length > 24
                              ? 'hz-setting__value w-[20rem] max-w-full [overflow-wrap:anywhere]'
                              : 'hz-setting__value whitespace-nowrap'
                          }
                          dir="ltr"
                          data-testid={'market-value-' + setting.key}
                        >
                          {shown(setting.value)}
                        </bdi>
                      ) : (
                        <span className="hz-setting__value hz-setting__value--unset">تعیین‌نشده</span>
                      )}
                    </div>
                    {view.writable ? (
                      <div className="col-span-full">
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
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </OpsShell>
  );
}
