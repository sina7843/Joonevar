'use client';

import { useActionState } from 'react';
import { Button } from '../ui/button.tsx';
import { Alert } from '../ui/alert.tsx';
import { TextAreaField, TextField } from '../ui/field.tsx';
import { Check, Result, submitWith } from '../vets/directory-forms.tsx';
import { buyPackageAction, cancelPackageAction, updatePlanAction, type AdFormState } from './actions.ts';

const EMPTY: AdFormState = {};

/**
 * Buy one plan for one record.
 *
 * The plan and the record are hidden fields and the price is not sent at all:
 * the server reads the managed figure and freezes it (§22).
 */
export function BuyPackageForm({
  targetType,
  targetId,
  planId,
  label,
  disabledReasonFa,
  testId,
}: {
  targetType: string;
  targetId: string;
  planId: string;
  label: string;
  disabledReasonFa: string | null;
  testId: string;
}) {
  const [state, submit, pending] = useActionState(buyPackageAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-md space-y-sm" data-testid={'buy-form-' + testId}>
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      <input type="hidden" name="planId" value={planId} />
      <Result state={state} testId={'buy-result-' + testId} />
      {disabledReasonFa ? (
        <p className="text-caption text-text-secondary" data-testid={'buy-blocked-' + testId}>
          {disabledReasonFa}
        </p>
      ) : (
        <Button type="submit" disabled={pending} data-testid={'buy-' + testId}>
          {pending ? 'در حال انتقال به درگاه…' : label}
        </Button>
      )}
    </form>
  );
}

export function CancelPackageForm({
  subscription,
  surface,
}: {
  subscription: { id: string; version: number };
  surface: 'owner' | 'admin';
}) {
  const [state, submit, pending] = useActionState(cancelPackageAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-sm flex flex-wrap items-end gap-sm" data-testid={'cancel-form-' + subscription.id}>
      <input type="hidden" name="surface" value={surface} />
      <input type="hidden" name="subscriptionId" value={subscription.id} />
      <input type="hidden" name="expectedVersion" value={subscription.version} />
      <div className="min-w-[12rem] flex-1">
        <TextField label="دلیل لغو" name="reason" required maxLength={500} data-testid={'cancel-reason-' + subscription.id} />
      </div>
      <Button type="submit" tone="ghost" disabled={pending} data-testid={'cancel-' + subscription.id}>
        لغو بسته
      </Button>
      <div className="w-full">
        <Result state={state} testId={'cancel-result-' + subscription.id} />
      </div>
    </form>
  );
}

/** The panel side of §14: features, capacity and availability — never the price. */
export function PlanForm({
  plan,
}: {
  plan: { id: string; version: number; featuresFa: string | null; slotCapacity: number | null; isActive: boolean };
}) {
  const [state, submit, pending] = useActionState(updatePlanAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-lg space-y-md" data-testid={'plan-form-' + plan.id}>
      <input type="hidden" name="planId" value={plan.id} />
      <input type="hidden" name="expectedVersion" value={plan.version} />
      <Result state={state} testId={'plan-result-' + plan.id} />
      <TextAreaField
        label="امکانات این بسته"
        name="featuresFa"
        rows={2}
        maxLength={1000}
        defaultValue={plan.featuresFa ?? ''}
        data-testid={'plan-features-' + plan.id}
      />
      <TextField
        label="ظرفیت جایگاه"
        name="slotCapacity"
        ltr
        inputMode="numeric"
        maxLength={5}
        defaultValue={plan.slotCapacity === null ? '' : String(plan.slotCapacity)}
        hint="خالی یعنی سقفی ثبت نشده است."
        data-testid={'plan-capacity-' + plan.id}
      />
      <Check name="isActive" label="این بسته ارائه می‌شود" defaultChecked={plan.isActive} testId={'plan-active-' + plan.id} />
      <TextField label="دلیل تغییر" name="reason" required maxLength={500} data-testid={'plan-reason-' + plan.id} />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'save-plan-' + plan.id}>
        ذخیره بسته
      </Button>
    </form>
  );
}

/** Shown where a price has not been entered yet, so nothing is sold for nothing. */
export function UnpricedNotice({ testId }: { testId: string }) {
  return (
    <div className="mt-md" data-testid={testId}>
      <Alert tone="warning" title="قیمت ثبت نشده است">
        تا وقتی مبلغ این بسته در تنظیمات ثبت نشود، خرید آن ممکن نیست.
      </Alert>
    </div>
  );
}
