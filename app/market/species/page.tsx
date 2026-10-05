import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../src/ui/shell.tsx';
import { Panel } from '../../../src/ui/desk.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { marketSpecies } from '../../../src/marketplace/species.ts';
import { hasMarketplaceCapability, MARKET_FA } from '../../../src/marketplace/model.ts';
import { SpeciesForm } from '../forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * Species enablement — Phase 3, PROMPT-002.
 *
 * The architecture carries every species; the launch carries the dog. Opening a
 * species for animal sale is a legal and commercial decision, so it happens
 * here with a reason that is kept, and never as a side effect of the taxonomy
 * gaining a row.
 */
export default async function MarketSpeciesPage() {
  const guard = await guardRoute('/market/species');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  const rows = await marketSpecies(db());
  const canWrite = hasMarketplaceCapability(actor, 'MARKET_SPECIES_WRITE');

  const enabled = rows.filter((row) => row.enabled).length;
  return (
    <OpsShell actor={actor} title="گونه‌های فعال بازار" pathname="/market/species" nav={marketNav(actor)}>
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">{enabled.toLocaleString('fa-IR') + ' فعال از ' + rows.length.toLocaleString('fa-IR')}</span>
        <span className="hz-page-header__meta-item">هر تغییر با دلیل در تاریخچه می‌ماند</span>
      </p>
      <Alert tone="info" title="فعال کردن یک گونه یک تصمیم است، نه یک تنظیم فنی">
        <span data-testid="species-notice">
          باز کردن یک گونه در بازار فروش حیوان نیاز به تصمیم حقوقی و محصولی دارد. دلیل هر تغییر ثبت و در
          تاریخچه نگه داشته می‌شود، و گونه‌ای که بعداً به فهرست گونه‌ها اضافه شود به‌صورت پیش‌فرض بسته می‌آید.
        </span>
      </Alert>

      <div className="grid items-start gap-lg lg:grid-cols-2">
        {(['ANIMAL_SALE', 'MERCHANDISE'] as const).map((market) => {
          const list = rows.filter((row) => row.market === market);
          return (
            <Panel key={market} title={MARKET_FA[market]} count={list.length.toLocaleString('fa-IR')}>
              {canWrite ? null : (
                <p className="text-caption text-text-secondary">تغییر وضعیت گونه در نقش فعلی شما مجاز نیست.</p>
              )}
              <ul>
                {list.map((row) => (
                  <li key={row.id} className="hz-setting" data-testid={'species-row-' + market + '-' + row.speciesCode}>
                    <div className="hz-setting__label">
                      <span className="hz-setting__name">{row.nameFa}</span>
                      <bdi className="hz-setting__key" dir="ltr">
                        {row.speciesCode}
                      </bdi>
                      <span className="hz-setting__hint">
                        {'نسخه ' + row.version.toLocaleString('fa-IR')}
                        {row.reasonFa ? ' · دلیل وضعیت فعلی: ' + row.reasonFa : ''}
                      </span>
                    </div>
                    <div className="hz-setting__end">
                      <StatusBadge tone={row.enabled ? 'success' : 'neutral'} size="sm">
                        {row.enabled ? 'فعال' : 'غیرفعال'}
                      </StatusBadge>
                    </div>
                    {canWrite ? (
                      <div className="col-span-full">
                        <SpeciesForm market={market} speciesCode={row.speciesCode} version={row.version} enabled={row.enabled} />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Panel>
          );
        })}
      </div>
    </OpsShell>
  );
}
