import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ADMIN_NAV } from '../../../src/ui/shell.tsx';
import { Icon } from '../../../src/ui/icon.tsx';
import { Button } from '../../../src/ui/button.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { SearchField } from '../../../src/ui/search-field.tsx';
import { SectionHeader } from '../../../src/ui/section-header.tsx';
import { db } from '../../../src/db/client.ts';
import { listSettingsForActor } from '../../../src/settings/service.ts';
import { canWriteSettingGroup, type SettingGroupName } from '../../../src/authz/policy.ts';
import { SettingForm } from './setting-form.tsx';
import { displaySetting } from './display.ts';

export const dynamic = 'force-dynamic';

/** Group labels (DS P11: «proposed labels to confirm»; presentation only). */
const GROUP_FA: Record<SettingGroupName, string> = {
  FEES: 'تعرفه‌ها',
  GENETICS_CENTRE: 'مرکز ژنتیک',
  DEADLINES: 'مهلت‌ها',
  REFERENCE_DATA: 'داده‌های پایه',
  GUIDE_TEXT: 'متن‌های راهنما',
  INTEGRATIONS: 'اتصال‌ها',
  OTP_TECHNICAL: 'ورود و امنیت',
  BREEDING_POLICY: 'سیاست پرورش',
  MODERATION: 'نظارت محتوا',
  ADVERTISING: 'تبلیغات',
  ANIMAL_MARKET: 'بازار حیوان',
  COMMERCE: 'فروشگاه',
  SETTLEMENT: 'تسویه',
  MARKETPLACE_OPERATIONS: 'عملیات بازار',
  MATING_FINDER: 'جفت‌یابی',
};

const fa = (value: number) => value.toLocaleString('fa-IR');

/**
 * Settings panel (§21.4, D15, D16) — DS P11 / K15: group nav, search and the
 * «فقط تعیین‌نشده» filter, then one card per group with one row per key.
 *
 * The list comes from the same permission-scoped service the API uses, so an
 * operator sees exactly the groups they may read; the filter is applied to that
 * list only. Each writable row keeps its own versioned edit form in place.
 */
export default async function AdminSettingsPage({ searchParams }: { searchParams: Promise<{ q?: string; unset?: string }> }) {
  const guard = await guardRoute('/admin/settings');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;
  const params = await searchParams;
  const term = (params.q ?? '').trim();
  const onlyUnset = params.unset === '1';

  const settings = await listSettingsForActor(db(), actor);
  const unsetCount = settings.filter((setting) => !setting.configured).length;
  const shown = settings.filter(
    (setting) =>
      (!onlyUnset || !setting.configured) &&
      (term === '' || setting.labelFa.includes(term) || setting.key.toLowerCase().includes(term.toLowerCase())),
  );
  const groups = [...new Set(settings.map((setting) => setting.group))];
  const shownGroups = groups.filter((group) => shown.some((setting) => setting.group === group));
  const filterHref = (unset: boolean) => {
    const query = new URLSearchParams();
    if (term) query.set('q', term);
    if (unset) query.set('unset', '1');
    const text = query.toString();
    return '/admin/settings' + (text ? '?' + text : '');
  };

  return (
    <OpsShell actor={actor} title="تنظیمات" pathname="/admin/settings" nav={ADMIN_NAV}>
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <p className="hz-page-header__meta">
          <span className="hz-page-header__meta-item">{fa(settings.length) + ' کلید در ' + fa(groups.length) + ' گروه'}</span>
          <span className="hz-page-header__meta-item">هر تغییر نسخه‌دار است و با دلیل در تاریخچه می‌ماند</span>
        </p>
        <Link href="/admin/audit" className="hz-link hz-link--standalone">
          <Icon name="clockCounterClockwise" size="xs" />
          تاریخچه تغییرات
        </Link>
      </div>

      <div className="hz-settings">
        <nav className="hz-settings__nav hz-show-lg" aria-label="گروه‌های تنظیمات">
          <p className="hz-settings__nav-title">{fa(groups.length) + ' گروه'}</p>
          {groups.map((group) => {
            const hasUnset = settings.some((setting) => setting.group === group && !setting.configured);
            return (
              <a key={group} href={'#group-' + group} className="hz-side-item hz-side-item--dense">
                <span className="hz-side-item__label">{GROUP_FA[group] ?? group}</span>
                {hasUnset ? (
                  <span className="hz-settings__flag">
                    <span className="hz-visually-hidden">دارای مقدار تعیین‌نشده</span>
                  </span>
                ) : null}
              </a>
            );
          })}
        </nav>

        <div className="hz-settings__main space-y-lg">
          <div className="hz-settings__tools flex flex-wrap items-center gap-sm">
            <form method="get" action="/admin/settings" className="flex min-w-0 flex-1 basis-64 items-center gap-sm" role="search">
              {onlyUnset ? <input type="hidden" name="unset" value="1" /> : null}
              <SearchField id="settings-search" label="نام فارسی یا کلید، مثلاً fee.pedigree" name="q" defaultValue={term} className="min-w-0 flex-1" />
              <Button type="submit" tone="secondary" size="sm">
                جست‌وجو
              </Button>
            </form>
            <Link href={filterHref(!onlyUnset)} className="hz-chip no-underline" aria-pressed={onlyUnset}>
              فقط تعیین‌نشده
              <span className="hz-chip__count">{fa(unsetCount)}</span>
            </Link>
            {term || onlyUnset ? (
              <span className="text-caption text-text-secondary" aria-live="polite">
                {fa(shown.length) + ' مورد از ' + fa(settings.length)}
              </span>
            ) : null}
          </div>

          {shown.length === 0 ? (
            <EmptyState
              icon="magnifyingGlass"
              title={term ? 'تنظیمی با «' + term + '» پیدا نشد' : 'مقدار تعیین‌نشده‌ای نیست'}
              description="با کلید لاتین هم جست‌وجو کنید."
              action={
                <Link className="hz-btn hz-btn--secondary hz-btn--sm" href="/admin/settings">
                  پاک کردن فیلترها
                </Link>
              }
            />
          ) : null}

          {shownGroups.map((group) => {
            const rows = shown.filter((setting) => setting.group === group);
            const writable = canWriteSettingGroup(actor, group);
            return (
              <section key={group} id={'group-' + group} className="hz-card scroll-mt-s64" aria-labelledby={'group-title-' + group}>
                <div className="flex flex-wrap items-center justify-between gap-sm">
                  <SectionHeader title={GROUP_FA[group] ?? group} size="sm" id={'group-title-' + group} />
                  <span className="text-caption text-text-secondary">
                    {fa(rows.length) + ' کلید' + (rows.some((row) => row.kind === 'MONEY_TOMAN') ? '، مبلغ‌ها به تومان' : '')}
                  </span>
                </div>
                {writable ? null : (
                  <p className="mt-xs text-caption text-text-secondary">این گروه در نقش فعلی شما قابل تغییر نیست.</p>
                )}
                <ul>
                  {rows.map((setting) => (
                    <li
                      key={setting.key}
                      className={['hz-setting', setting.kind === 'TEXT' ? 'hz-setting--text' : ''].join(' ').trim()}
                    >
                      <div className="hz-setting__label">
                        <span className="hz-setting__name">{setting.labelFa}</span>
                        <bdi className="hz-setting__key" dir="ltr">
                          {setting.key}
                        </bdi>
                        {setting.noteFa ? <span className="hz-setting__hint">{setting.noteFa}</span> : null}
                        {!setting.configured ? (
                          <span className="hz-setting__hint">تا تعیین مقدار، مسیر وابسته به این کلید بسته می‌ماند.</span>
                        ) : null}
                      </div>
                      <div className="hz-setting__end">
                        <span className={setting.configured ? 'hz-setting__value' : 'hz-setting__value hz-setting__value--unset'}>
                          {displaySetting(setting)}
                        </span>
                        <span className="text-caption text-text-secondary">{'نسخه ' + fa(setting.version)}</span>
                      </div>
                      {writable ? (
                        <div className="col-span-full">
                          <SettingForm
                            settingKey={setting.key}
                            labelFa={setting.labelFa}
                            version={setting.version}
                            value={setting.configured ? String(setting.value) : ''}
                            unit={setting.kind === 'MONEY_TOMAN' ? 'تومان' : undefined}
                          />
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </OpsShell>
  );
}
