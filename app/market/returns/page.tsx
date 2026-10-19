import { OpsShell, marketNav } from '../../../src/ui/shell.tsx';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { CaseItem, CaseList, DeskHead, Panel, QueueMeta } from '../../../src/ui/desk.tsx';
import { CaseDrawer } from '../../../src/ui/desk-drawer.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { keyStatus } from '../../../src/ui/queue.tsx';
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
      <QueueMeta total={disputes.length} noun="مرجوعی مورد اختلاف" />

      <Panel title="مرجوعی‌های مورد اختلاف" count={fa(disputes.length)}>
        <p className="text-caption text-text-secondary" data-testid="disputed-hold-note">
          تا تعیین تکلیف، مبلغ این زیرسفارش‌ها نگه داشته می‌شود و در هیچ دسته تسویه‌ای نمی‌آید.
        </p>
        {disputes.length === 0 ? (
          <p className="text-body-sm text-text-secondary" data-testid="disputed-empty">
            مرجوعی مورد اختلافی وجود ندارد.
          </p>
        ) : (
          <CaseList label="مرجوعی‌های مورد اختلاف" testId="disputed-returns">
            {disputes.map((view) => (
              <CaseItem
                key={view.row.id}
                type="مرجوعی"
                name={
                  <span data-testid={'disputed-ref-' + view.row.id}>
                    <bdi dir="ltr">{view.row.reference}</bdi>
                    {' — ' + view.sellerNameFa}
                  </span>
                }
                sub={
                  <>
                    {'زیرسفارش '}
                    <bdi dir="ltr">{view.subOrderReference}</bdi>
                  </>
                }
                status={{
                  // GAPS #4: no dictionary key for REQUESTED, SHIPPED_BACK, RECEIVED — module label kept.
                  ...keyStatus(view.row.status, { tone: 'warning', label: RETURN_STATUS_FA[view.row.status as ReturnStatus] }),
                  testId: 'disputed-status-' + view.row.id,
                }}
                owner="SYSTEM"
                ownerLabel="پشتیبانی بازار"
                ownerIsUs
              >
                <CaseDrawer title="پرونده مرجوعی مورد اختلاف" testId={'open-return-' + view.row.id}>
                  <DeskHead
                    title={
                      <>
                        <bdi dir="ltr">{view.row.reference}</bdi>
                        {' — ' + view.sellerNameFa}
                      </>
                    }
                    status={keyStatus(view.row.status, { tone: 'warning', label: RETURN_STATUS_FA[view.row.status as ReturnStatus] })}
                    meta={[
                      <>
                        {'زیرسفارش '}
                        <bdi dir="ltr">{view.subOrderReference}</bdi>
                      </>,
                    ]}
                  />
                  <Panel title="دلیل و اقلام">
                    <p className="text-body-sm" data-testid={'disputed-reason-' + view.row.id}>
                      {view.row.reasonFa}
                      {view.row.decisionNoteFa ? ' — ' + view.row.decisionNoteFa : ''}
                    </p>
                    <dl className="hz-kv" data-testid={'disputed-items-' + view.row.id}>
                      {view.items.map((item) => (
                        <div key={item.id} className="hz-kv__row">
                          <dt className="hz-kv__key">{item.productNameFa + ' × ' + fa(item.quantity)}</dt>
                          <dd className="hz-kv__value hz-num">{fa(item.lineRefundToman)} تومان</dd>
                        </div>
                      ))}
                    </dl>
                  </Panel>
                  <Panel title="تصمیم">
                    <ReturnMoveForm
                      action={moveReturnAsOperatorAction}
                      returnId={view.row.id}
                      moves={view.moves}
                      testPrefix="ops-return"
                    />
                  </Panel>
                </CaseDrawer>
              </CaseItem>
            ))}
          </CaseList>
        )}
      </Panel>

      <Panel title="سیاست مرجوعی در جریان">
        {policy === null ? (
          <Alert tone="warning" title="هنوز هیچ نسخه‌ای منتشر نشده است">
            <span data-testid="policy-missing">
              تا انتشار یک نسخه، هیچ مرجوعی‌ای ثبت نمی‌شود؛ مهلت مرجوعی چیزی نیست که حدس زده شود.
            </span>
          </Alert>
        ) : (
          <div className="space-y-sm">
            <p className="text-body-sm" data-testid="policy-live">
              نسخه {policy.version} — مهلت عمومی {fa(policy.windowDays)} روز
            </p>
            <p className="text-caption text-text-secondary" data-testid="policy-body-text">
              {policy.bodyFa}
            </p>
            {exceptions.length > 0 ? (
              <ul data-testid="policy-exceptions">
                {exceptions.map((exception) => (
                  <li key={exception.categoryId} className="hz-setting" data-testid={'policy-exception-' + exception.categoryId}>
                    <div className="hz-setting__label">
                      <span className="hz-setting__name">{exception.categoryNameFa}</span>
                      <span className="hz-setting__hint">{exception.reasonFa}</span>
                    </div>
                    <div className="hz-setting__end">
                      <span className="hz-setting__value">{RETURN_RULE_FA[exception.rule as ReturnRule]}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
        <ReturnPolicyForm action={publishReturnPolicyAction} categories={categories} />
      </Panel>
    </OpsShell>
  );
}
