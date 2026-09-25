import { PublicShell } from '../../../../src/ui/shell.tsx';
import { db } from '../../../../src/db/client.ts';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { productCategories } from '../../../../src/db/schema/catalog.ts';
import { myStores } from '../../../../src/commerce/sellers.ts';
import { livePolicy, rulesOfSeller } from '../../../../src/commerce/discounts.ts';
import { DISCOUNT_KIND_FA, type DiscountKind } from '../../../../src/commerce/trust-model.ts';
import { DiscountForm, MoveDiscountForm } from '../../../../src/commerce/trust-forms.tsx';
import { createDiscountAction, moveDiscountAction } from '../../orders/trust-actions.ts';

export const dynamic = 'force-dynamic';

const fa = (value: number | bigint): string => value.toLocaleString('fa-IR');

/**
 * A shop's own discounts — PROMPT-012.
 *
 * Only the two kinds whose money is the shop's: its own reduction and its own
 * code. A platform code or a category campaign is Hamzist's to declare,
 * because it is Hamzist that pays for it.
 */
export default async function SellerPromotionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const guard = await guardRoute('/account/seller/promotions');
  if (!guard.ok) throw guard.denied;

  const stores = await myStores(db(), guard.actor);
  const requested = String((await searchParams).store ?? '');
  const store = stores.find((row) => row.id === requested) ?? stores[0] ?? null;
  if (store === null) {
    return (
      <PublicShell actor={guard.actor} title="تخفیف‌های فروشگاه" pathname="/account/seller">
        <div className="space-y-lg p-lg">
          <p className="text-body-sm text-text-secondary" data-testid="promotions-no-store">
            هنوز فروشگاهی ندارید.
          </p>
        </div>
      </PublicShell>
    );
  }

  const [rules, categories, stacking] = await Promise.all([
    rulesOfSeller(db(), guard.actor, store.id),
    db().select({ id: productCategories.id, nameFa: productCategories.nameFa }).from(productCategories),
    livePolicy(db()),
  ]);

  return (
    <PublicShell actor={guard.actor} title="تخفیف‌های فروشگاه" pathname="/account/seller">
      <div className="space-y-lg p-lg">
        {stacking.row === null ? (
          <Alert tone="info" title="تا انتشار سیاست هم‌زمانی، هیچ دو تخفیفی با هم جمع نمی‌شوند">
            <span data-testid="stacking-missing">
              این محافظه‌کارانه‌ترین حالت است: دو تخفیفی که بی‌سروصدا جمع شوند، همان‌جایی است که فروش زیر قیمت
              بدون تصمیم کسی اتفاق می‌افتد.
            </span>
          </Alert>
        ) : null}

        <Card>
          <h2 className="text-label-lg">تخفیف‌های این فروشگاه</h2>
          {rules.length === 0 ? (
            <p className="mt-2xs text-caption text-text-secondary" data-testid="seller-rules-empty">
              هنوز تخفیفی تعریف نکرده‌اید.
            </p>
          ) : (
            <ul className="mt-md space-y-sm" data-testid="seller-rules">
              {rules.map((rule) => (
                <li
                  key={rule.id}
                  className="flex flex-wrap items-center justify-between gap-sm text-body-sm"
                  data-testid={'seller-rule-' + rule.id}
                >
                  <span>
                    {rule.labelFa} — {DISCOUNT_KIND_FA[rule.kind as DiscountKind]}
                    {rule.code ? ' — کد ' + rule.code : ''}
                    {rule.percentBp !== null ? ' — ' + fa(rule.percentBp / 100) + '٪' : ''}
                    {rule.amountToman !== null ? ' — ' + fa(rule.amountToman) + ' تومان' : ''}
                  </span>
                  <span className="flex items-center gap-sm">
                    <StatusBadge tone={rule.status === 'ACTIVE' ? 'success' : 'neutral'}>
                      <span data-testid={'seller-rule-status-' + rule.id}>{rule.status}</span>
                    </StatusBadge>
                    {rule.status === 'DRAFT' || rule.status === 'PAUSED' ? (
                      <MoveDiscountForm
                        action={moveDiscountAction}
                        ruleId={rule.id}
                        sellerId={store.id}
                        to="ACTIVE"
                        labelFa="فعال کردن"
                      />
                    ) : null}
                    {rule.status === 'ACTIVE' ? (
                      <MoveDiscountForm
                        action={moveDiscountAction}
                        ruleId={rule.id}
                        sellerId={store.id}
                        to="PAUSED"
                        labelFa="توقف"
                      />
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="text-label-lg">تخفیف تازه</h2>
          <p className="mt-2xs text-caption text-text-secondary" data-testid="seller-discount-note">
            هزینه این تخفیف‌ها از سهم خود فروشگاه کم می‌شود.
          </p>
          <div className="mt-lg">
            <DiscountForm
              action={createDiscountAction}
              sellerId={store.id}
              kinds={['SELLER_DISCOUNT', 'SELLER_CODE', 'FREE_SHIPPING']}
              categories={categories}
            />
          </div>
        </Card>
      </div>
    </PublicShell>
  );
}
