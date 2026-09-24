import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
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

  return (
    <OpsShell actor={actor} title="گونه‌های فعال بازار" pathname="/market/species" nav={marketNav(actor)}>
      <div className="space-y-lg">
        <Alert tone="info" title="فعال کردن یک گونه یک تصمیم است، نه یک تنظیم فنی">
          <span data-testid="species-notice">
            باز کردن یک گونه در بازار فروش حیوان نیاز به تصمیم حقوقی و محصولی دارد. دلیل هر تغییر ثبت و در
            تاریخچه نگه داشته می‌شود، و گونه‌ای که بعداً به فهرست گونه‌ها اضافه شود به‌صورت پیش‌فرض بسته می‌آید.
          </span>
        </Alert>

        {(['ANIMAL_SALE', 'MERCHANDISE'] as const).map((market) => (
          <Card key={market}>
            <h2 className="text-label-lg">{MARKET_FA[market]}</h2>
            <ul className="mt-lg space-y-md">
              {rows
                .filter((row) => row.market === market)
                .map((row) => (
                  <li
                    key={row.id}
                    className="rounded-lg border border-border-subtle p-md"
                    data-testid={'species-row-' + market + '-' + row.speciesCode}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-sm">
                      <div className="min-w-0">
                        <p className="text-label-md">{row.nameFa}</p>
                        <p className="mt-2xs text-caption text-text-secondary">
                          <bdi className="hz-ltr font-mono">{row.speciesCode}</bdi>
                          <span className="mx-sm text-text-disabled">|</span>
                          نسخه: {row.version.toLocaleString('fa-IR')}
                        </p>
                      </div>
                      <StatusBadge tone={row.enabled ? 'success' : 'neutral'}>
                        {row.enabled ? 'فعال' : 'غیرفعال'}
                      </StatusBadge>
                    </div>
                    {row.reasonFa ? (
                      <p className="mt-sm text-caption text-text-secondary">دلیل وضعیت فعلی: {row.reasonFa}</p>
                    ) : null}
                    {canWrite ? (
                      <SpeciesForm
                        market={market}
                        speciesCode={row.speciesCode}
                        version={row.version}
                        enabled={row.enabled}
                      />
                    ) : (
                      <p className="mt-sm text-caption text-text-disabled">
                        تغییر وضعیت گونه در نقش فعلی شما مجاز نیست.
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
