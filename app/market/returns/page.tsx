import { OpsShell, marketNav } from '../../../src/ui/shell.tsx';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { productCategories } from '../../../src/db/schema/catalog.ts';
import { disputedReturns, livePolicy, policyExceptions } from '../../../src/commerce/returns.ts';
import {
  RETURN_RULE_FA,
  RETURN_STATUS_FA,
  type ReturnRule,
  type ReturnStatus,
} from '../../../src/commerce/fulfilment-model.ts';
import { ReturnMoveForm, ReturnPolicyForm } from '../../../src/commerce/finance-forms.tsx';
import { moveReturnAsOperatorAction, publishReturnPolicyAction } from '../../account/orders/finance-actions.ts';

export const dynamic = 'force-dynamic';

const fa = (value: number | bigint): string => value.toLocaleString('fa-IR');

/**
 * The platform's return promise, and the arguments about it — PROMPT-011.
 *
 * The promise is published as a version, because buyers bought under the text
 * that was in force and that text has to stay readable. A category exception
 * narrows the promise and never lengthens it, and every one carries the
 * sentence the buyer reads.
 */
export default async function MarketReturnsPage() {
  const guard = await guardRoute('/market/returns');
  if (!guard.ok) throw guard.denied;

  const [policy, disputes, categories] = await Promise.all([
    livePolicy(db()),
    disputedReturns(db(), guard.actor),
    db()
      .select({ id: productCategories.id, nameFa: productCategories.nameFa })
      .from(productCategories)
      .orderBy(productCategories.nameFa),
  ]);
  const exceptions = policy === null ? [] : await policyExceptions(db(), policy.id);

  return (
    <OpsShell actor={guard.actor} title="مرجوعی و سیاست آن" nav={marketNav(guard.actor)} pathname="/market/returns">
      <div className="space-y-lg p-lg">
        <Card>
          <h2 className="text-label-lg">سیاست مرجوعی در جریان</h2>
          {policy === null ? (
            <Alert tone="warning" title="هنوز هیچ نسخه‌ای منتشر نشده است">
              <span data-testid="policy-missing">
                تا انتشار یک نسخه، هیچ مرجوعی‌ای ثبت نمی‌شود؛ مهلت مرجوعی چیزی نیست که حدس زده شود.
              </span>
            </Alert>
          ) : (
            <div className="mt-sm space-y-sm">
              <p className="text-body-sm" data-testid="policy-live">
                نسخه {policy.version} — مهلت عمومی {fa(policy.windowDays)} روز
              </p>
              <p className="text-caption text-text-secondary" data-testid="policy-body-text">
                {policy.bodyFa}
              </p>
              {exceptions.length > 0 ? (
                <ul className="space-y-2xs text-body-sm" data-testid="policy-exceptions">
                  {exceptions.map((exception) => (
                    <li key={exception.categoryId} data-testid={'policy-exception-' + exception.categoryId}>
                      {exception.categoryNameFa} — {RETURN_RULE_FA[exception.rule as ReturnRule]} —{' '}
                      {exception.reasonFa}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
          <div className="mt-lg">
            <ReturnPolicyForm action={publishReturnPolicyAction} categories={categories} />
          </div>
        </Card>

        <Card>
          <h2 className="text-label-lg">مرجوعی‌های مورد اختلاف</h2>
          <p className="mt-2xs text-caption text-text-secondary" data-testid="disputed-hold-note">
            تا تعیین تکلیف، مبلغ این زیرسفارش‌ها نگه داشته می‌شود و در هیچ دسته تسویه‌ای نمی‌آید.
          </p>
          {disputes.length === 0 ? (
            <p className="mt-sm text-body-sm text-text-secondary" data-testid="disputed-empty">
              مرجوعی مورد اختلافی وجود ندارد.
            </p>
          ) : (
            <ul className="mt-md space-y-lg" data-testid="disputed-returns">
              {disputes.map((view) => (
                <li key={view.row.id} className="space-y-sm rounded-md border border-border-subtle p-lg">
                  <div className="flex flex-wrap items-center justify-between gap-sm">
                    <span className="text-label-sm" data-testid={'disputed-ref-' + view.row.id}>
                      {view.row.reference} — {view.sellerNameFa} — زیرسفارش {view.subOrderReference}
                    </span>
                    <StatusBadge tone="warning">
                      <span data-testid={'disputed-status-' + view.row.id}>
                        {RETURN_STATUS_FA[view.row.status as ReturnStatus]}
                      </span>
                    </StatusBadge>
                  </div>
                  <p className="text-body-sm" data-testid={'disputed-reason-' + view.row.id}>
                    {view.row.reasonFa}
                    {view.row.decisionNoteFa ? ' — ' + view.row.decisionNoteFa : ''}
                  </p>
                  <ul className="space-y-2xs text-caption" data-testid={'disputed-items-' + view.row.id}>
                    {view.items.map((item) => (
                      <li key={item.id}>
                        {item.productNameFa} × {fa(item.quantity)} — {fa(item.lineRefundToman)} تومان
                      </li>
                    ))}
                  </ul>
                  <ReturnMoveForm
                    action={moveReturnAsOperatorAction}
                    returnId={view.row.id}
                    moves={view.moves}
                    testPrefix="ops-return"
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </OpsShell>
  );
}
