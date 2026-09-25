import { OpsShell, marketNav } from '../../../src/ui/shell.tsx';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { productCategories } from '../../../src/db/schema/catalog.ts';
import { livePolicy, platformRules } from '../../../src/commerce/discounts.ts';
import { DISCOUNT_KIND_FA, type DiscountKind } from '../../../src/commerce/trust-model.ts';
import { DiscountForm, MoveDiscountForm, StackingForm } from '../../../src/commerce/trust-forms.tsx';
import { createDiscountAction, moveDiscountAction, publishStackingAction } from '../../account/orders/trust-actions.ts';

export const dynamic = 'force-dynamic';

const fa = (value: number | bigint): string => value.toLocaleString('fa-IR');

/**
 * The platform's own campaigns, and how discounts combine — PROMPT-012.
 *
 * These two kinds are Hamzist's money, which is why they are declared here
 * and not by a shop. The stacking policy is published as a version, because
 * an order was priced under the rules in force and those rules have to stay
 * readable afterwards.
 */
export default async function MarketPromotionsPage() {
  const guard = await guardRoute('/market/promotions');
  if (!guard.ok) throw guard.denied;

  const [rules, categories, stacking] = await Promise.all([
    platformRules(db(), guard.actor),
    db().select({ id: productCategories.id, nameFa: productCategories.nameFa }).from(productCategories),
    livePolicy(db()),
  ]);

  return (
    <OpsShell actor={guard.actor} title="کمپین و تخفیف" nav={marketNav(guard.actor)} pathname="/market/promotions">
      <div className="space-y-lg p-lg">
        <Card>
          <h2 className="text-label-lg">سیاست هم‌زمانی تخفیف‌ها</h2>
          {stacking.row === null ? (
            <Alert tone="warning" title="هنوز نسخه‌ای منتشر نشده است">
              <span data-testid="stacking-none">
                تا انتشار یک نسخه، هیچ دو تخفیفی با هم جمع نمی‌شوند. سکوت باید محتاطانه‌ترین معنا را بدهد.
              </span>
            </Alert>
          ) : (
            <p className="mt-sm text-body-sm" data-testid="stacking-live">
              نسخه {stacking.row.version} — {fa(stacking.policy.combinable.length)} جفت قابل جمع
            </p>
          )}
          <div className="mt-lg">
            <StackingForm action={publishStackingAction} />
          </div>
        </Card>

        <Card>
          <h2 className="text-label-lg">کمپین‌ها و کدهای همزیست</h2>
          {rules.length === 0 ? (
            <p className="mt-2xs text-caption text-text-secondary" data-testid="platform-rules-empty">
              هنوز کمپینی تعریف نشده است.
            </p>
          ) : (
            <ul className="mt-md space-y-sm" data-testid="platform-rules">
              {rules.map((rule) => (
                <li
                  key={rule.id}
                  className="flex flex-wrap items-center justify-between gap-sm text-body-sm"
                  data-testid={'platform-rule-' + rule.id}
                >
                  <span>
                    {rule.labelFa} — {DISCOUNT_KIND_FA[rule.kind as DiscountKind]}
                    {rule.code ? ' — کد ' + rule.code : ''}
                    {rule.percentBp !== null ? ' — ' + fa(rule.percentBp / 100) + '٪' : ''}
                    {rule.totalUses !== null ? ' — سقف ' + fa(rule.totalUses) : ''}
                  </span>
                  <span className="flex items-center gap-sm">
                    <StatusBadge tone={rule.status === 'ACTIVE' ? 'success' : 'neutral'}>
                      <span data-testid={'platform-rule-status-' + rule.id}>{rule.status}</span>
                    </StatusBadge>
                    {rule.status === 'DRAFT' || rule.status === 'PAUSED' ? (
                      <MoveDiscountForm action={moveDiscountAction} ruleId={rule.id} to="ACTIVE" labelFa="فعال کردن" />
                    ) : null}
                    {rule.status === 'ACTIVE' ? (
                      <MoveDiscountForm action={moveDiscountAction} ruleId={rule.id} to="PAUSED" labelFa="توقف" />
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="text-label-lg">کمپین تازه</h2>
          <p className="mt-2xs text-caption text-text-secondary" data-testid="platform-discount-note">
            هزینه این تخفیف‌ها از سهم همزیست کم می‌شود، نه از سهم فروشنده.
          </p>
          <div className="mt-lg">
            <DiscountForm
              action={createDiscountAction}
              kinds={['PLATFORM_CODE', 'CATEGORY_CAMPAIGN', 'FREE_SHIPPING']}
              categories={categories}
            />
          </div>
        </Card>
      </div>
    </OpsShell>
  );
}
