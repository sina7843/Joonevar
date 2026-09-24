import Link from 'next/link';
import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../src/ui/shell.tsx';
import { Card } from '../../src/ui/card.tsx';
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

  return (
    <OpsShell actor={actor} title="عملیات بازار و فروشگاه" pathname="/market" nav={marketNav(actor)}>
      <div className="space-y-lg">
        <Alert tone="info" title="وضعیت واقعی فاز ۳">
          <span data-testid="market-readiness">
            هیچ جریان بازار یا فروشگاهی هنوز ساخته نشده است. کلیدهای زیر بسته‌اند و{' '}
            <bdi>{unset.toLocaleString('fa-IR')}</bdi> مقدار مدیریت‌شده هنوز ثبت نشده است؛ تا ثبت مقدار واقعی،
            مسیر وابسته بسته می‌ماند.
          </span>
        </Alert>

        <Card>
          <h2 className="text-label-lg">نقش و اختیارات شما</h2>
          <p className="mt-2xs text-caption text-text-secondary" data-testid="market-context">
            {MARKETPLACE_CONTEXT_FA[actor.context] ?? 'سوپرادمین'}
          </p>
          <ul className="mt-md flex flex-wrap gap-xs" data-testid="market-capabilities">
            {capabilitiesOf(actor.context).map((capability) => (
              <li key={capability}>
                <StatusBadge tone="info">
                  <bdi className="hz-ltr font-mono">{capability}</bdi>
                </StatusBadge>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="text-label-lg">کلیدهای قطع و وصل</h2>
          <p className="mt-2xs text-caption text-text-secondary">
            هر کلید یک تنظیم نسخه‌دار است؛ هر بار زدن آن با نام، زمان و دلیل در تاریخچه ثبت می‌شود.
          </p>
          <ul className="mt-lg space-y-md" data-testid="market-flags">
            {flags.map((flag) => (
              <li key={flag.key} className="rounded-lg border border-border-subtle p-md" data-testid={'flag-' + flag.key}>
                <div className="flex flex-wrap items-start justify-between gap-sm">
                  <div className="min-w-0">
                    <p className="text-label-md">{flag.labelFa}</p>
                    <p className="mt-2xs text-caption text-text-secondary">
                      <bdi className="hz-ltr font-mono">{flag.key}</bdi>
                      <span className="mx-sm text-text-disabled">|</span>
                      نسخه: {flag.version.toLocaleString('fa-IR')}
                    </p>
                  </div>
                  <StatusBadge tone={flag.enabled ? 'success' : 'neutral'}>
                    {flag.enabled ? 'باز' : flag.configured ? 'بسته' : 'بسته (تعیین‌نشده)'}
                  </StatusBadge>
                </div>
                {flag.noteFa ? <p className="mt-sm text-caption text-text-secondary">{flag.noteFa}</p> : null}
                {canToggle ? (
                  <FlagForm settingKey={flag.key} version={flag.version} enabled={flag.enabled} />
                ) : (
                  <p className="mt-sm text-caption text-text-disabled">
                    تغییر این کلید در نقش فعلی شما مجاز نیست.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="text-label-lg">گونه‌های فعال هر بازار</h2>
          <div className="mt-lg space-y-md" data-testid="market-species-summary">
            {(['ANIMAL_SALE', 'MERCHANDISE'] as const).map((market) => (
              <div key={market} className="rounded-lg border border-border-subtle p-md">
                <p className="text-label-md">{MARKET_FA[market]}</p>
                <ul className="mt-sm flex flex-wrap gap-xs">
                  {byMarket(market).map((row) => (
                    <li key={row.id} data-testid={'species-state-' + market + '-' + row.speciesCode}>
                      <StatusBadge tone={row.enabled ? 'success' : 'neutral'}>
                        {row.nameFa + ' — ' + (row.enabled ? 'فعال' : 'غیرفعال')}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>

        {groups.length > 0 ? (
          <Card>
            <h2 className="text-label-lg">مقادیر مدیریت‌شده</h2>
            <ul className="mt-lg space-y-sm" data-testid="market-setting-groups">
              {groups.map((group) => (
                <li
                  key={group.group}
                  className="flex flex-wrap items-center justify-between gap-sm rounded-lg border border-border-subtle p-md"
                  data-testid={'market-group-' + group.group}
                >
                  <Link href={'/market/settings?group=' + group.group} className="text-label-md text-text-brand">
                    {group.labelFa}
                  </Link>
                  <div className="flex gap-xs">
                    <StatusBadge tone="success">{'ثبت‌شده: ' + group.configured.toLocaleString('fa-IR')}</StatusBadge>
                    <StatusBadge tone={group.unset === 0 ? 'neutral' : 'warning'}>
                      {'تعیین‌نشده: ' + group.unset.toLocaleString('fa-IR')}
                    </StatusBadge>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </OpsShell>
  );
}
