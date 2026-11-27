import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../src/ui/shell.tsx';
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
import { SettingRow } from '../../../src/ui/setting-row.tsx';
import { GroupSelect } from '../../../src/ui/group-select.tsx';
import { SearchField } from '../../../src/ui/search-field.tsx';
import { hrefWith } from '../../../src/ui/queue-head.tsx';
import { displaySetting } from '../../../src/settings/display.ts';
import { updateMarketSettingAction } from '../actions.ts';

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
/** The raw form the operator types ('' when unset). */
const raw = (setting: { configured: boolean; value: unknown }): string =>
  setting.configured ? (typeof setting.value === 'object' ? JSON.stringify(setting.value) : String(setting.value)) : '';

export default async function MarketSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; q?: string; unset?: string }>;
}) {
  const guard = await guardRoute('/market/settings');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  const { group, q, unset: unsetParam } = await searchParams;
  const term = (q ?? '').trim();
  const onlyUnset = unsetParam === '1';
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
          <div className="hz-settings__tools">
            <form method="get" action="/market/settings" className="flex min-w-0 flex-1 basis-64 items-center gap-sm" role="search">
              {selected ? <input type="hidden" name="group" value={selected} /> : null}
              {onlyUnset ? <input type="hidden" name="unset" value="1" /> : null}
              <SearchField id="market-settings-search" label="نام فارسی یا کلید" name="q" defaultValue={term} className="min-w-0 flex-1" />
            </form>
            <Link
              href={hrefWith('/market/settings', { group: selected, q: term || undefined }, { unset: onlyUnset ? undefined : '1' })}
              className="hz-chip no-underline"
              aria-pressed={onlyUnset}
              data-testid="market-unset-filter"
            >
              فقط تعیین‌نشده
              <span className="hz-chip__count">{unset.toLocaleString('fa-IR')}</span>
            </Link>
          </div>
          <GroupSelect
            label="گروه"
            className="hz-hide-lg"
            options={[
              { value: 'all', label: 'همه', href: '/market/settings', current: selected === undefined },
              ...tabs.map((name) => ({ value: name, label: MARKET_GROUP_FA[name], href: '/market/settings?group=' + name, current: selected === name })),
            ]}
          />

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
              <div>
                {view.settings
                  .filter(
                    (setting) =>
                      (!onlyUnset || !setting.configured) &&
                      (term === '' || setting.labelFa.includes(term) || setting.key.toLowerCase().includes(term.toLowerCase())),
                  )
                  .map((setting) => (
                    <SettingRow
                      key={setting.key}
                      setting={{
                        key: setting.key,
                        labelFa: setting.labelFa,
                        kind: setting.kind,
                        configured: setting.configured,
                        raw: raw(setting),
                        display: displaySetting(setting),
                        version: setting.version,
                      }}
                      writable={view.writable}
                      action={updateMarketSettingAction}
                      mobileHref={'/market/settings/' + encodeURIComponent(setting.key)}
                      ids={{
                        row: 'market-setting-' + setting.key,
                        value: 'market-setting-value-' + setting.key,
                        reason: 'market-setting-reason-' + setting.key,
                        save: 'market-setting-save-' + setting.key,
                        edit: 'market-setting-edit-' + setting.key,
                        form: 'market-setting-form-' + setting.key,
                        display: 'market-value-' + setting.key,
                      }}
                      hints={
                        <>
                          {setting.noteFa ? <span className="hz-setting__hint">{setting.noteFa}</span> : null}
                          <span className="hz-setting__hint">
                            {(SOURCE_FA[setting.source] ?? setting.source) + ' · '}
                            <Link href={'/market/settings/' + encodeURIComponent(setting.key)} className="hz-link" data-testid={'market-history-link-' + setting.key}>
                              تاریخچه
                            </Link>
                          </span>
                        </>
                      }
                    />
                  ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </OpsShell>
  );
}
