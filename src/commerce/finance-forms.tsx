'use client';

import { useActionState } from 'react';
import { Button } from '../ui/button.tsx';
import { Alert } from '../ui/alert.tsx';
import { FileField, SelectField, TextAreaField, TextField } from '../ui/field.tsx';
import { CADENCES, CADENCE_FA, RETURNED_CONDITIONS, RETURNED_CONDITION_FA, RETURN_STATUS_FA, type ReturnStatus } from './fulfilment-model.ts';

interface FormState {
  readonly ok?: boolean;
  readonly message?: string;
}

type Action = (previous: FormState, form: FormData) => Promise<FormState>;

const EMPTY: FormState = {};

function Result({ state, testId }: { state: FormState; testId: string }) {
  if (!state.message) return null;
  return (
    <div data-testid={testId}>
      <Alert tone={state.ok ? 'success' : 'error'} title={state.message} />
    </div>
  );
}

/**
 * Ask for goods to go back.
 *
 * Lines are chosen by quantity rather than wholesale, because sending one of
 * three things back is the ordinary case, and every line says why on its own.
 */
export function ReturnRequestForm({
  action,
  subOrderId,
  items,
}: {
  action: Action;
  subOrderId: string;
  items: readonly { id: string; labelFa: string; remaining: number; blockedFa: string | null }[];
}) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  const returnable = items.filter((item) => item.blockedFa === null && item.remaining > 0);
  return (
    <form action={submit} className="space-y-md" data-testid={'return-form-' + subOrderId}>
      <input type="hidden" name="subOrderId" value={subOrderId} />
      <Result state={state} testId={'return-result-' + subOrderId} />
      {items
        .filter((item) => item.blockedFa !== null)
        .map((item) => (
          <p key={item.id} className="text-caption text-text-secondary" data-testid={'return-blocked-' + item.id}>
            {item.labelFa} — {item.blockedFa}
          </p>
        ))}
      {returnable.length === 0 ? (
        <p className="text-caption text-text-secondary" data-testid={'return-none-' + subOrderId}>
          قلمی از این زیرسفارش در حال حاضر قابل مرجوع نیست.
        </p>
      ) : (
        <>
          {returnable.map((item) => (
            <fieldset key={item.id} className="space-y-2xs rounded-md border border-border-subtle p-md">
              <legend className="text-label-sm">{item.labelFa}</legend>
              <label className="flex items-center gap-sm text-body-sm">
                <input type="checkbox" name="items" value={item.id} data-testid={'return-line-' + item.id} />
                این قلم را برمی‌گردانم
              </label>
              <SelectField
                label="تعداد"
                name={'quantity-' + item.id}
                options={Array.from({ length: item.remaining }, (_, index) => ({
                  value: String(index + 1),
                  label: (index + 1).toLocaleString('fa-IR'),
                }))}
                data-testid={'return-quantity-' + item.id}
              />
              <TextField
                label="دلیل این قلم"
                name={'reason-' + item.id}
                data-testid={'return-item-reason-' + item.id}
              />
            </fieldset>
          ))}
          <TextAreaField
            label="توضیح کلی"
            name="reason"
            required
            rows={2}
            data-testid={'return-reason-' + subOrderId}
          />
          <Button type="submit" disabled={pending} data-testid={'return-submit-' + subOrderId}>
            ثبت درخواست مرجوعی
          </Button>
        </>
      )}
    </form>
  );
}

/**
 * Move one return along.
 *
 * Receiving goods asks what condition they arrived in, because that is what
 * the refund figure is computed from — not a number anybody types.
 */
export function ReturnMoveForm({
  action,
  returnId,
  moves,
  testPrefix,
}: {
  action: Action;
  returnId: string;
  moves: readonly ReturnStatus[];
  testPrefix: string;
}) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  if (moves.length === 0) return null;
  return (
    <form action={submit} className="space-y-sm" data-testid={testPrefix + '-form-' + returnId}>
      <input type="hidden" name="returnId" value={returnId} />
      <Result state={state} testId={testPrefix + '-result-' + returnId} />
      <SelectField
        label="اقدام"
        name="to"
        required
        options={moves.map((move) => ({ value: move, label: RETURN_STATUS_FA[move] }))}
        data-testid={testPrefix + '-select-' + returnId}
      />
      <SelectField
        label="وضعیت کالای دریافت‌شده"
        name="condition"
        options={[
          { value: '', label: '—' },
          ...RETURNED_CONDITIONS.map((condition) => ({
            value: condition,
            label: RETURNED_CONDITION_FA[condition],
          })),
        ]}
        hint="فقط هنگام ثبت «دریافت‌شده» لازم است؛ مبلغ بازپرداخت از همین محاسبه می‌شود."
        data-testid={testPrefix + '-condition-' + returnId}
      />
      <TextField
        label="کد رهگیری مرسوله بازگشتی"
        name="tracking"
        ltr
        data-testid={testPrefix + '-tracking-' + returnId}
      />
      <TextAreaField
        label="توضیح"
        name="note"
        rows={2}
        hint="برای رد کردن و برای اختلاف اجباری است."
        data-testid={testPrefix + '-note-' + returnId}
      />
      <Button type="submit" disabled={pending} data-testid={testPrefix + '-submit-' + returnId}>
        ثبت
      </Button>
    </form>
  );
}

export function ReturnEvidenceForm({ action, returnId }: { action: Action; returnId: string }) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid={'evidence-form-' + returnId}>
      <input type="hidden" name="returnId" value={returnId} />
      <Result state={state} testId={'evidence-result-' + returnId} />
      <FileField
        label="تصویر یا سند"
        name="file"
        required
        accept="image/jpeg,image/png,application/pdf"
        maxBytes={5 * 1024 * 1024}
        testId={'evidence-file-' + returnId}
      />
      <TextField label="توضیح" name="note" data-testid={'evidence-note-' + returnId} />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'evidence-submit-' + returnId}>
        افزودن مدرک
      </Button>
    </form>
  );
}

/** How often this shop's settleable money is gathered. */
export function CadenceForm({
  action,
  sellerId,
  current,
}: {
  action: Action;
  sellerId: string;
  current: string;
}) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  return (
    <form action={submit} className="flex flex-wrap items-end gap-sm" data-testid="cadence-form">
      <input type="hidden" name="sellerId" value={sellerId} />
      <SelectField
        label="دوره تسویه"
        name="cadence"
        defaultValue={current}
        options={CADENCES.map((cadence) => ({ value: cadence, label: CADENCE_FA[cadence] }))}
        data-testid="cadence-select"
      />
      <Button type="submit" tone="secondary" disabled={pending} data-testid="cadence-save">
        درخواست تغییر
      </Button>
      <Result state={state} testId="cadence-result" />
    </form>
  );
}

/** Gather one shop's settleable money into a batch. */
export function OpenBatchForm({ action, sellerId }: { action: Action; sellerId: string }) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  return (
    <form action={submit} data-testid={'open-batch-form-' + sellerId}>
      <input type="hidden" name="sellerId" value={sellerId} />
      <Result state={state} testId={'open-batch-result-' + sellerId} />
      <Button type="submit" disabled={pending} data-testid={'open-batch-' + sellerId}>
        ساخت دسته تسویه
      </Button>
    </form>
  );
}

/**
 * Record what the bank actually did.
 *
 * A payment is only recorded with the bank's own reference: until a person
 * has sent money and said where, nothing here says it happened.
 */
export function BatchMoveForm({
  action,
  batchId,
  moves,
}: {
  action: Action;
  batchId: string;
  moves: readonly string[];
}) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  if (moves.length === 0) return null;
  return (
    <form action={submit} className="space-y-sm" data-testid={'batch-move-form-' + batchId}>
      <input type="hidden" name="batchId" value={batchId} />
      <Result state={state} testId={'batch-move-result-' + batchId} />
      <SelectField
        label="اقدام"
        name="to"
        required
        options={moves.map((move) => ({ value: move, label: move }))}
        data-testid={'batch-move-select-' + batchId}
      />
      <TextField
        label="شماره پیگیری بانکی"
        name="bankReference"
        ltr
        hint="برای ثبت واریز اجباری است."
        data-testid={'batch-reference-' + batchId}
      />
      <TextAreaField
        label="توضیح"
        name="reason"
        rows={2}
        hint="برای واریز ناموفق و لغو اجباری است."
        data-testid={'batch-reason-' + batchId}
      />
      <Button type="submit" disabled={pending} data-testid={'batch-move-submit-' + batchId}>
        ثبت
      </Button>
    </form>
  );
}

/** An operator's own entry on a shop's balance, which always says why. */
export function LedgerEntryForm({ action, sellerId }: { action: Action; sellerId: string }) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid={'ledger-entry-form-' + sellerId}>
      <input type="hidden" name="sellerId" value={sellerId} />
      <Result state={state} testId={'ledger-entry-result-' + sellerId} />
      <SelectField
        label="نوع"
        name="kind"
        required
        options={[
          { value: 'PROMOTION_CHARGE', label: 'هزینه تبلیغ' },
          { value: 'PENALTY', label: 'جریمه' },
          { value: 'ADJUSTMENT', label: 'اصلاح دستی' },
        ]}
        data-testid={'ledger-kind-' + sellerId}
      />
      <TextField
        label="مبلغ (تومان)"
        name="amount"
        required
        ltr
        inputMode="numeric"
        hint="برای اصلاح دستی، عدد منفی هم پذیرفته است."
        data-testid={'ledger-amount-' + sellerId}
      />
      <TextAreaField
        label="دلیل"
        name="reason"
        required
        rows={2}
        hint="فروشنده همین متن را در دفتر مالی خود می‌خواند."
        data-testid={'ledger-reason-' + sellerId}
      />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'ledger-submit-' + sellerId}>
        ثبت در دفتر
      </Button>
    </form>
  );
}

/** Publish a version of the platform's return promise, with its exceptions. */
export function ReturnPolicyForm({
  action,
  categories,
}: {
  action: Action;
  categories: readonly { id: string; nameFa: string }[];
}) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  return (
    <form action={submit} className="space-y-md" data-testid="return-policy-form">
      <Result state={state} testId="return-policy-result" />
      <TextField label="شناسه نسخه" name="version" required ltr data-testid="policy-version" />
      <TextField
        label="مهلت عمومی مرجوعی (روز)"
        name="windowDays"
        required
        ltr
        inputMode="numeric"
        data-testid="policy-window"
      />
      <TextAreaField label="متن سیاست" name="body" required rows={4} data-testid="policy-body" />
      <fieldset className="space-y-md">
        <legend className="text-label-sm">استثناهای دسته</legend>
        <p className="text-caption text-text-secondary">
          استثنا فقط حق مرجوعی را محدود می‌کند و هرگز آن را طولانی‌تر نمی‌کند. دلیلی که می‌نویسید روی صفحه کالا و
          در فرم مرجوعی به خریدار نشان داده می‌شود.
        </p>
        {categories.map((category) => (
          <div key={category.id} className="space-y-2xs rounded-md border border-border-subtle p-md">
            <p className="text-label-sm">{category.nameFa}</p>
            <SelectField
              label="قاعده"
              name={'rule-' + category.id}
              options={[
                { value: 'STANDARD', label: 'مهلت عمومی' },
                { value: 'SEALED_ONLY', label: 'فقط در صورت باز نشدن' },
                { value: 'NOT_RETURNABLE', label: 'غیرقابل مرجوع' },
              ]}
              data-testid={'policy-rule-' + category.id}
            />
            <TextField
              label="دلیل"
              name={'reason-' + category.id}
              data-testid={'policy-reason-' + category.id}
            />
          </div>
        ))}
      </fieldset>
      <Button type="submit" disabled={pending} data-testid="policy-publish">
        انتشار نسخه تازه
      </Button>
    </form>
  );
}
