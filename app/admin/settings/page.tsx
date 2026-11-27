import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ADMIN_NAV } from '../../../src/ui/shell.tsx';
import { Icon } from '../../../src/ui/icon.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { SearchField } from '../../../src/ui/search-field.tsx';
import { SectionHeader } from '../../../src/ui/section-header.tsx';
import { GroupSelect } from '../../../src/ui/group-select.tsx';
import { hrefWith } from '../../../src/ui/queue-head.tsx';
import { db } from '../../../src/db/client.ts';
import { listSettingsForActor, type SettingRecord } from '../../../src/settings/service.ts';
import { canWriteSettingGroup, type SettingGroupName } from '../../../src/authz/policy.ts';
import { SettingRow } from '../../../src/ui/setting-row.tsx';
import { GROUP_FA, rowData } from './model.ts';
import { updateSettingAction } from './actions.ts';

export const dynamic = 'force-dynamic';

const PATH = '/admin/settings';
const fa = (value: number) => value.toLocaleString('fa-IR');

const ids = (key: string) => ({
  value: 'setting-value-' + key,
  reason: 'setting-reason-' + key,
  save: 'save-setting-' + key,
  edit: 'setting-edit-' + key,
  form: 'setting-form-' + key,
  display: 'setting-display-' + key,
  reload: 'setting-reload-' + key,
});

/**
 * Settings panel (§21.4, D15, D16) — DS P11 / K15 / SettingsPanel.
 *
 * One group at a time (`?group=`): a 240px nav from 1024, a group Select at
 * 768–1023 and accordion rows below 768, then the group's rows and, under them,
 * «تعیین‌نشده در گروه‌های دیگر». Search and «فقط تعیین‌نشده» show cross-group
 * results with each row's group. Rows are read-only; one opens to edit with a
 * required reason, versioned (below 768 on the key's own page).
 *
 * The list comes from the same permission-scoped service the API uses, so an
 * operator sees exactly the groups they may read.
 */
export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; unset?: string; group?: string }>;
}) {
  const guard = await guardRoute(PATH);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;
  const params = await searchParams;
  const term = (params.q ?? '').trim();
  const onlyUnset = params.unset === '1';

  const settings = await listSettingsForActor(db(), actor);
  const groups = [...new Set(settings.map((setting) => setting.group))] as SettingGroupName[];
  const current: SettingGroupName | undefined = groups.includes(params.group as SettingGroupName)
    ? (params.group as SettingGroupName)
    : groups[0];
  const unset = settings.filter((setting) => !setting.configured);
  const unsetGroups = new Set(unset.map((setting) => setting.group));
  const crossGroup = term !== '' || onlyUnset;
  const found = settings.filter(
    (setting) =>
      (!onlyUnset || !setting.configured) &&
      (term === '' || setting.labelFa.includes(term) || setting.key.toLowerCase().includes(term.toLowerCase())),
  );
  const keep = { q: term || undefined, unset: onlyUnset ? '1' : undefined, group: params.group };
  const groupHref = (group: string) => hrefWith(PATH, {}, { group });

  const rowOf = (setting: SettingRecord, withGroup: boolean) => (
    <SettingRow
      key={setting.key}
      setting={rowData(setting, withGroup ? (GROUP_FA[setting.group as SettingGroupName] ?? setting.group) : undefined)}
      writable={canWriteSettingGroup(actor, setting.group as SettingGroupName)}
      action={updateSettingAction}
      ids={ids(setting.key)}
      mobileHref={PATH + '/' + encodeURIComponent(setting.key)}
      hints={setting.noteFa ? <span className="hz-setting__hint">{setting.noteFa}</span> : null}
    />
  );

  const groupCard = (group: SettingGroupName) => {
    const rows = settings.filter((setting) => setting.group === group);
    return (
      <section className="hz-card" aria-labelledby={'group-title-' + group} data-testid={'settings-group-' + group}>
        <div className="flex flex-wrap items-center justify-between gap-sm max-md:hidden">
          <SectionHeader title={GROUP_FA[group] ?? group} size="sm" id={'group-title-' + group} />
          <span className="text-caption text-text-secondary">
            {fa(rows.length) + ' کلید' + (rows.some((row) => row.kind === 'MONEY_TOMAN') ? '، مبلغ‌ها به تومان' : '')}
          </span>
        </div>
        {canWriteSettingGroup(actor, group) ? null : (
          <p className="mt-xs text-caption text-text-secondary">این گروه در نقش فعلی شما قابل تغییر نیست.</p>
        )}
        <div>{rows.map((setting) => rowOf(setting, false))}</div>
      </section>
    );
  };

  const otherUnset = unset.filter((setting) => setting.group !== current);

  return (
    <OpsShell actor={actor} title="تنظیمات" pathname={PATH} nav={ADMIN_NAV}>
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
          {groups.map((group) => (
            <Link
              key={group}
              href={groupHref(group)}
              className="hz-side-item hz-side-item--dense"
              aria-current={!crossGroup && group === current ? 'page' : undefined}
              data-testid={'settings-nav-' + group}
            >
              <span className="hz-side-item__label">{GROUP_FA[group] ?? group}</span>
              {unsetGroups.has(group) ? (
                <span className="hz-settings__flag">
                  <span className="hz-visually-hidden">دارای مقدار تعیین‌نشده</span>
                </span>
              ) : null}
            </Link>
          ))}
        </nav>

        <div className="hz-settings__main">
          <div className="hz-settings__tools">
            <form method="get" action={PATH} className="flex min-w-0 flex-1 basis-64 items-center gap-sm" role="search">
              {onlyUnset ? <input type="hidden" name="unset" value="1" /> : null}
              <SearchField id="settings-search" label="نام فارسی یا کلید، مثلاً fee.pedigree" name="q" defaultValue={term} className="min-w-0 flex-1" />
            </form>
            <Link href={hrefWith(PATH, keep, { unset: onlyUnset ? undefined : '1', group: undefined })} className="hz-chip no-underline" aria-pressed={onlyUnset} data-testid="settings-unset-filter">
              فقط تعیین‌نشده
              <span className="hz-chip__count">{fa(unset.length)}</span>
            </Link>
            {crossGroup ? (
              <span className="text-caption text-text-secondary" aria-live="polite">
                {fa(found.length) + ' مورد از ' + fa(settings.length)}
              </span>
            ) : null}
          </div>

          {unset.length > 0 && !crossGroup ? (
            <Alert tone="warning" title={fa(unset.length) + ' مقدار تعیین‌نشده در ' + fa(unsetGroups.size) + ' گروه'}>
              مسیرهای وابسته به این مقدارها تا تعیین مقدار بسته می‌مانند.{' '}
              <Link href={hrefWith(PATH, {}, { unset: '1' })} className="hz-link">
                نمایش همه
              </Link>
            </Alert>
          ) : null}

          {crossGroup ? (
            found.length === 0 ? (
              <EmptyState
                icon="magnifyingGlass"
                title={term ? 'تنظیمی با «' + term + '» پیدا نشد' : 'مقدار تعیین‌نشده‌ای نیست'}
                description="با کلید لاتین هم جست‌وجو کنید."
                action={
                  <Link className="hz-btn hz-btn--secondary hz-btn--sm" href={PATH}>
                    پاک کردن فیلترها
                  </Link>
                }
              />
            ) : (
              <section className="hz-card" aria-label="نتیجه‌ها در همه گروه‌ها">
                {found.map((setting) => rowOf(setting, true))}
              </section>
            )
          ) : (
            <>
              <GroupSelect
                label="گروه"
                className="hidden md:flex lg:hidden"
                options={groups.map((group) => ({
                  value: group,
                  label: (GROUP_FA[group] ?? group) + (unsetGroups.has(group) ? ' ●' : ''),
                  href: groupHref(group),
                  current: group === current,
                }))}
              />
              {/* Below 768 the groups are accordion rows; the open one shows its rows (rendered once). */}
              {groups.map((group) =>
                group === current ? (
                  <div key={group} className="space-y-sm">
                    <span className="hz-accordion-row md:hidden" aria-expanded="true" role="heading" aria-level={2}>
                      <span className="flex items-center gap-sm">
                        {GROUP_FA[group] ?? group}
                        {unsetGroups.has(group) ? <span className="hz-settings__flag" /> : null}
                      </span>
                      <Icon name="caretDown" size="sm" className="rotate-180" />
                    </span>
                    {groupCard(group)}
                  </div>
                ) : (
                  <Link key={group} href={groupHref(group)} className="hz-accordion-row no-underline md:hidden" aria-expanded="false">
                    <span className="flex items-center gap-sm">
                      {GROUP_FA[group] ?? group}
                      {unsetGroups.has(group) ? (
                        <span className="hz-settings__flag">
                          <span className="hz-visually-hidden">دارای مقدار تعیین‌نشده</span>
                        </span>
                      ) : null}
                    </span>
                    <Icon name="caretDown" size="sm" />
                  </Link>
                ),
              )}
              {otherUnset.length > 0 ? (
                <section className="hz-card max-md:hidden" aria-labelledby="other-unset-title" data-testid="settings-other-unset">
                  <SectionHeader title="تعیین‌نشده در گروه‌های دیگر" size="sm" id="other-unset-title" />
                  {otherUnset.slice(0, 5).map((setting) => rowOf(setting, true))}
                  {otherUnset.length > 5 ? (
                    <Link href={hrefWith(PATH, {}, { unset: '1' })} className="hz-link hz-link--standalone mt-sm">
                      {'همه ' + fa(otherUnset.length) + ' مقدار تعیین‌نشده'}
                    </Link>
                  ) : null}
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </OpsShell>
  );
}
