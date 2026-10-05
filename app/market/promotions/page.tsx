import { OpsShell, marketNav } from '../../../src/ui/shell.tsx';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { Panel } from '../../../src/ui/desk.tsx';
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
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">{fa(rules.length) + ' کمپین و کد'}</span>
        <span className="hz-page-header__meta-item">
          {stacking.row === null ? 'سیاست هم‌زمانی: منتشر نشده' : 'سیاست هم‌زمانی: نسخه ' + stacking.row.version}
        </span>
      </p>

      <Panel title="کمپین‌ها و کدهای همزیست" count={fa(rules.length)}>
        {rules.length === 0 ? (
          <p className="text-caption text-text-secondary" data-testid="platform-rules-empty">
            هنوز کمپینی تعریف نشده است.
          </p>
        ) : (
          <ul data-testid="platform-rules">
            {rules.map((rule) => (
              <li key={rule.id} className="hz-setting" data-testid={'platform-rule-' + rule.id}>
                <div className="hz-setting__label">
                  <span className="hz-setting__name">{rule.labelFa}</span>
                  <span className="hz-setting__hint">
                    {DISCOUNT_KIND_FA[rule.kind as DiscountKind]}
                    {rule.code ? (
                      <>
                        {' — کد '}
                        <bdi dir="ltr">{rule.code}</bdi>
                      </>
                    ) : null}
                    {rule.percentBp !== null ? ' — ' + fa(rule.percentBp / 100) + '٪' : ''}
                    {rule.totalUses !== null ? ' — سقف ' + fa(rule.totalUses) : ''}
                  </span>
                </div>
                <div className="hz-setting__end">
                  {/* The machine status stays as written: operators and checks read the same word. */}
                  <StatusBadge tone={rule.status === 'ACTIVE' ? 'success' : 'neutral'} size="sm">
                    <bdi dir="ltr" data-testid={'platform-rule-status-' + rule.id}>
                      {rule.status}
                    </bdi>
                  </StatusBadge>
                  {rule.status === 'DRAFT' || rule.status === 'PAUSED' ? (
                    <MoveDiscountForm action={moveDiscountAction} ruleId={rule.id} to="ACTIVE" labelFa="فعال کردن" />
                  ) : null}
                  {rule.status === 'ACTIVE' ? (
                    <MoveDiscountForm action={moveDiscountAction} ruleId={rule.id} to="PAUSED" labelFa="توقف" />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid items-start gap-lg lg:grid-cols-2">
        <Panel title="کمپین تازه">
          <p className="text-caption text-text-secondary" data-testid="platform-discount-note">
            هزینه این تخفیف‌ها از سهم همزیست کم می‌شود، نه از سهم فروشنده.
          </p>
          <DiscountForm
            action={createDiscountAction}
            kinds={['PLATFORM_CODE', 'CATEGORY_CAMPAIGN', 'FREE_SHIPPING']}
            categories={categories}
          />
        </Panel>

        <Panel title="سیاست هم‌زمانی تخفیف‌ها">
          {stacking.row === null ? (
            <Alert tone="warning" title="هنوز نسخه‌ای منتشر نشده است">
              <span data-testid="stacking-none">
                تا انتشار یک نسخه، هیچ دو تخفیفی با هم جمع نمی‌شوند. سکوت باید محتاطانه‌ترین معنا را بدهد.
              </span>
            </Alert>
          ) : (
            <p className="text-body-sm" data-testid="stacking-live">
              نسخه {stacking.row.version} — {fa(stacking.policy.combinable.length)} جفت قابل جمع
            </p>
          )}
          <StackingForm action={publishStackingAction} />
        </Panel>
      </div>
    </OpsShell>
  );
}
