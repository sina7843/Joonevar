import Link from 'next/link';
import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../src/ui/shell.tsx';
import { Panel, StatTiles } from '../../src/ui/desk.tsx';
import { Alert } from '../../src/ui/alert.tsx';
import { StatusBadge } from '../../src/ui/status.tsx';
import { db } from '../../src/db/client.ts';
import { flagStates } from '../../src/marketplace/flags.ts';
import { marketSpecies } from '../../src/marketplace/species.ts';
import { marketSettingGroups } from '../../src/marketplace/operations.ts';
import {
  capabilitiesOf,
  hasMarketplaceCapability,
  MARKET_FA,
  MARKETPLACE_CONTEXT_FA,
  type MarketName,
} from '../../src/marketplace/model.ts';
import { FlagForm } from './forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * Marketplace operations home — Phase 3, PROMPT-002.
 *
 * Three honest answers in one place: which flows are open, which species each
 * market is open for, and how much of the managed configuration is still
 * missing. Nothing here pretends a flow works: every switch starts closed and
 * every unset figure is counted rather than defaulted.
 */
export default async function MarketOverviewPage() {
  const guard = await guardRoute('/market');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  const [flags, species, groups] = await Promise.all([
    flagStates(db()),
    marketSpecies(db()),
    marketSettingGroups(db(), actor),
  ]);

  const canToggle = hasMarketplaceCapability(actor, 'MARKET_FLAG_TOGGLE');
  const unset = groups.reduce((sum, group) => sum + group.unset, 0);
  const byMarket = (market: MarketName) => species.filter((row) => row.market === market);

  const configured = groups.reduce((sum, group) => sum + group.configured, 0);
  const open = flags.filter((flag) => flag.enabled).length;
  return (
    <OpsShell actor={actor} title="عملیات بازار و فروشگاه" pathname="/market" nav={marketNav(actor)}>
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item" data-testid="market-context">
          {MARKETPLACE_CONTEXT_FA[actor.context] ?? 'سوپرادمین'}
        </span>
      </p>
      <Alert tone="info" title="وضعیت واقعی فاز ۳">
        <span data-testid="market-readiness">
          هیچ جریان بازار یا فروشگاهی هنوز ساخته نشده است. کلیدهای زیر بسته‌اند و{' '}
          <bdi>{unset.toLocaleString('fa-IR')}</bdi> مقدار مدیریت‌شده هنوز ثبت نشده است؛ تا ثبت مقدار واقعی،
          مسیر وابسته بسته می‌ماند.
        </span>
      </Alert>

      <StatTiles
        tiles={[
          { label: 'مسیرهای باز', value: open, sub: 'از ' + flags.length.toLocaleString('fa-IR') + ' کلید قطع و وصل' },
          { label: 'گونه‌های فعال', value: species.filter((row) => row.enabled).length, sub: 'از ' + species.length.toLocaleString('fa-IR') + ' گونه در دو بازار' },
          { label: 'مقادیر ثبت‌شده', value: configured, sub: 'در ' + groups.length.toLocaleString('fa-IR') + ' گروه' },
          {
            label: 'مقادیر تعیین‌نشده',
            value: unset,
            sub: unset === 0 ? 'همه مقادیر ثبت شده‌اند' : undefined,
            alert: unset > 0 ? 'تا ثبت مقدار، مسیر وابسته بسته است' : undefined,
            href: groups.length > 0 ? '/market/settings' : undefined,
          },
        ]}
      />

      <div className="grid items-start gap-lg lg:grid-cols-2">
        <Panel title="کلیدهای قطع و وصل" count={flags.length.toLocaleString('fa-IR')}>
          <p className="text-caption text-text-secondary">
            هر کلید یک تنظیم نسخه‌دار است؛ هر بار زدن آن با نام، زمان و دلیل در تاریخچه ثبت می‌شود.
          </p>
          <ul data-testid="market-flags">
            {flags.map((flag) => (
              <li key={flag.key} className="hz-setting" data-testid={'flag-' + flag.key}>
                <div className="hz-setting__label">
                  <span className="hz-setting__name">{flag.labelFa}</span>
                  <bdi className="hz-setting__key" dir="ltr">
                    {flag.key}
                  </bdi>
                  {flag.noteFa ? <span className="hz-setting__hint">{flag.noteFa}</span> : null}
                </div>
                <div className="hz-setting__end">
                  <StatusBadge tone={flag.enabled ? 'success' : 'neutral'} size="sm">
                    {flag.enabled ? 'باز' : flag.configured ? 'بسته' : 'بسته (تعیین‌نشده)'}
                  </StatusBadge>
                  <span className="text-caption text-text-secondary">{'نسخه ' + flag.version.toLocaleString('fa-IR')}</span>
                </div>
                <div className="col-span-full">
                  {canToggle ? (
                    <FlagForm settingKey={flag.key} version={flag.version} enabled={flag.enabled} />
                  ) : (
                    <p className="text-caption text-text-secondary">تغییر این کلید در نقش فعلی شما مجاز نیست.</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="space-y-lg">
          <Panel title="گونه‌های فعال هر بازار">
            <div className="space-y-md" data-testid="market-species-summary">
              {(['ANIMAL_SALE', 'MERCHANDISE'] as const).map((market) => (
                <div key={market}>
                  <p className="text-label-md">{MARKET_FA[market]}</p>
                  <ul className="mt-sm flex flex-wrap gap-xs">
                    {byMarket(market).map((row) => (
                      <li key={row.id} data-testid={'species-state-' + market + '-' + row.speciesCode}>
                        <StatusBadge tone={row.enabled ? 'success' : 'neutral'} size="sm">
                          {row.nameFa + ' — ' + (row.enabled ? 'فعال' : 'غیرفعال')}
                        </StatusBadge>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Panel>

          {groups.length > 0 ? (
            <Panel title="مقادیر مدیریت‌شده">
              <ul data-testid="market-setting-groups">
                {groups.map((group) => (
                  <li key={group.group} className="hz-setting" data-testid={'market-group-' + group.group}>
                    <div className="hz-setting__label">
                      <Link href={'/market/settings?group=' + group.group} className="hz-link hz-setting__name">
                        {group.labelFa}
                      </Link>
                      <span className="hz-setting__hint">{'ثبت‌شده: ' + group.configured.toLocaleString('fa-IR')}</span>
                    </div>
                    <div className="hz-setting__end">
                      <span className={group.unset === 0 ? 'hz-setting__value' : 'hz-setting__value hz-setting__value--unset'}>
                        {'تعیین‌نشده: ' + group.unset.toLocaleString('fa-IR')}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <Panel title="نقش و اختیارات شما">
            <ul className="flex flex-wrap gap-xs" data-testid="market-capabilities">
              {capabilitiesOf(actor.context).map((capability) => (
                <li key={capability}>
                  <span className="hz-tag hz-tag--neutral">
                    <bdi dir="ltr">{capability}</bdi>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </OpsShell>
  );
}
