'use client';

import { useActionState } from 'react';
import { Button } from '../ui/button.tsx';
import { Alert } from '../ui/alert.tsx';
import { SelectField, TextAreaField, TextField } from '../ui/field.tsx';
import { SUB_ORDER_STATUS_FA, type SubOrderStatus } from './order-model.ts';
import { SHIPPING_METHOD_KINDS, SHIPPING_METHOD_KIND_FA } from './fulfilment-model.ts';

interface FormState {
  readonly ok?: boolean;
  readonly message?: string;
}

type Action = (previous: FormState, form: FormData) => Promise<FormState>;

const EMPTY: FormState = {};

export function Result({ state, testId }: { state: FormState; testId: string }) {
  if (!state.message) return null;
  return (
    <div data-testid={testId}>
      <Alert tone={state.ok ? 'success' : 'error'} title={state.message} />
    </div>
  );
}

/** Change how many of one line is in the basket, or take it out entirely. */
export function CartLineForm({
  action,
  skuId,
  quantity,
  max,
}: {
  action: Action;
  skuId: string;
  quantity: number;
  max: number;
}) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  const choices = Array.from({ length: Math.max(Math.min(max, 20), quantity) }, (_, index) => index + 1);
  return (
    <form action={submit} className="flex flex-wrap items-end gap-sm" data-testid={'cart-line-form-' + skuId}>
      <input type="hidden" name="skuId" value={skuId} />
      <SelectField
        label="تعداد"
        name="quantity"
        defaultValue={String(quantity)}
        options={choices.map((value) => ({ value: String(value), label: value.toLocaleString('fa-IR') }))}
        data-testid={'cart-quantity-' + skuId}
      />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'cart-update-' + skuId}>
        به‌روزرسانی
      </Button>
      <Result state={state} testId={'cart-line-result-' + skuId} />
    </form>
  );
}

export function RemoveLineForm({ action, skuId }: { action: Action; skuId: string }) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  return (
    <form action={submit} data-testid={'cart-remove-form-' + skuId}>
      <input type="hidden" name="skuId" value={skuId} />
      <input type="hidden" name="quantity" value="0" />
      <Button type="submit" tone="ghost" disabled={pending} data-testid={'cart-remove-' + skuId}>
        حذف از سبد
      </Button>
      <Result state={state} testId={'cart-remove-result-' + skuId} />
    </form>
  );
}

/** Put one SKU in the basket from the product page. */
export function AddToCartForm({
  action,
  skuId,
  available,
  labelFa,
}: {
  action: Action;
  skuId: string;
  available: number;
  labelFa: string;
}) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  if (available <= 0) {
    return (
      <p className="text-caption text-text-secondary" data-testid={'add-out-of-stock-' + skuId}>
        {labelFa} — ناموجود
      </p>
    );
  }
  const choices = Array.from({ length: Math.min(available, 20) }, (_, index) => index + 1);
  return (
    <form action={submit} className="flex flex-wrap items-end gap-sm" data-testid={'add-to-cart-form-' + skuId}>
      <input type="hidden" name="skuId" value={skuId} />
      <SelectField
        label="تعداد"
        name="quantity"
        options={choices.map((value) => ({ value: String(value), label: value.toLocaleString('fa-IR') }))}
        data-testid={'add-quantity-' + skuId}
      />
      <Button type="submit" disabled={pending} data-testid={'add-to-cart-' + skuId}>
        افزودن به سبد
      </Button>
      <Result state={state} testId={'add-to-cart-result-' + skuId} />
    </form>
  );
}

/**
 * Where the parcel goes, and the buyer's agreement to an exact figure.
 *
 * The amount is in the form so the server can compare it with what the basket
 * costs at that instant, not so it can be charged: what is charged is read
 * from the order row. A buyer agreed to a number, and if the number has moved
 * they are asked again rather than billed the new one.
 */
export function CheckoutForm({
  action,
  totalToman,
  defaults,
  blocked,
  chosenMethods,
}: {
  action: Action;
  totalToman: bigint;
  defaults: { provinceFa: string | null; cityFa: string | null; addressFa: string | null; postalCode: string | null };
  blocked: boolean;
  /** The delivery each shop's part was quoted under, carried so the server prices the same basket. */
  chosenMethods: Readonly<Record<string, string>>;
}) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  return (
    <form action={submit} className="space-y-md" data-testid="checkout-form">
      <input type="hidden" name="confirmedTotal" value={totalToman.toString()} />
      {Object.entries(chosenMethods).map(([sellerId, methodId]) => (
        <input key={sellerId} type="hidden" name={'method-' + sellerId} value={methodId} />
      ))}
      <Result state={state} testId="checkout-result" />
      <TextField label="نام گیرنده" name="recipientName" required data-testid="checkout-name" />
      <TextField
        label="شماره تماس گیرنده"
        name="recipientPhone"
        required
        ltr
        inputMode="numeric"
        data-testid="checkout-phone"
      />
      <TextField label="استان" name="province" defaultValue={defaults.provinceFa ?? ''} data-testid="checkout-province" />
      <TextField label="شهر" name="city" defaultValue={defaults.cityFa ?? ''} data-testid="checkout-city" />
      <TextAreaField
        label="نشانی تحویل"
        name="address"
        required
        rows={3}
        defaultValue={defaults.addressFa ?? ''}
        data-testid="checkout-address"
      />
      <TextField
        label="کد پستی"
        name="postalCode"
        ltr
        inputMode="numeric"
        defaultValue={defaults.postalCode ?? ''}
        data-testid="checkout-postal"
      />
      <TextAreaField label="توضیح برای فروشنده" name="note" rows={2} data-testid="checkout-note" />
      <p className="text-label-lg" data-testid="checkout-total">
        مبلغ قابل پرداخت: {totalToman.toLocaleString('fa-IR')} تومان
      </p>
      <Button type="submit" disabled={pending || blocked} data-testid="checkout-submit">
        تأیید و پرداخت
      </Button>
    </form>
  );
}

/**
 * Move one sub-order.
 *
 * Only the moves this side may actually make from this status are offered, so
 * the screen and the rule behind it cannot drift apart: an option that is not
 * here is one the server would refuse anyway.
 */
export function SubOrderMoveForm({
  action,
  subOrderId,
  moves,
  testPrefix,
}: {
  action: Action;
  subOrderId: string;
  moves: readonly SubOrderStatus[];
  testPrefix: string;
}) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  if (moves.length === 0) return null;
  return (
    <form action={submit} className="space-y-sm" data-testid={testPrefix + '-form-' + subOrderId}>
      <input type="hidden" name="subOrderId" value={subOrderId} />
      <Result state={state} testId={testPrefix + '-result-' + subOrderId} />
      <SelectField
        label="اقدام"
        name="to"
        required
        options={moves.map((move) => ({ value: move, label: SUB_ORDER_STATUS_FA[move] }))}
        data-testid={testPrefix + '-select-' + subOrderId}
      />
      <TextField
        label="کد رهگیری مرسوله"
        name="tracking"
        ltr
        hint="فقط برای «ارسال‌شده» لازم است."
        data-testid={testPrefix + '-tracking-' + subOrderId}
      />
      <TextAreaField
        label="دلیل"
        name="reason"
        rows={2}
        hint="برای لغو، درخواست مرجوعی و اختلاف اجباری است و در سابقه زیرسفارش می‌ماند."
        data-testid={testPrefix + '-reason-' + subOrderId}
      />
      <Button type="submit" disabled={pending} data-testid={testPrefix + '-submit-' + subOrderId}>
        ثبت
      </Button>
    </form>
  );
}

export function OrderActionForm({
  action,
  orderId,
  labelFa,
  testPrefix,
  tone = 'secondary',
}: {
  action: Action;
  orderId: string;
  labelFa: string;
  testPrefix: string;
  tone?: 'primary' | 'secondary' | 'ghost';
}) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid={testPrefix + '-form-' + orderId}>
      <input type="hidden" name="orderId" value={orderId} />
      <Result state={state} testId={testPrefix + '-result-' + orderId} />
      <Button type="submit" tone={tone} disabled={pending} data-testid={testPrefix + '-' + orderId}>
        {labelFa}
      </Button>
    </form>
  );
}

/**
 * One way this shop delivers, stated by the shop.
 *
 * Where it reaches, what it charges and how long it takes to prepare are
 * facts only that shop knows. The platform states a ceiling and nothing else,
 * so nothing here is filled in on the shop's behalf.
 */
export function ShippingMethodForm({
  action,
  sellerId,
  provinces,
  maxFeeFa,
}: {
  action: Action;
  sellerId: string;
  provinces: readonly { code: string; nameFa: string }[];
  maxFeeFa: string | null;
}) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  return (
    <form action={submit} className="space-y-md" data-testid="method-form">
      <input type="hidden" name="sellerId" value={sellerId} />
      <Result state={state} testId="method-result" />
      <TextField label="نام روش ارسال" name="label" required data-testid="method-label" />
      <SelectField
        label="نوع"
        name="kind"
        required
        options={SHIPPING_METHOD_KINDS.map((kind) => ({ value: kind, label: SHIPPING_METHOD_KIND_FA[kind] }))}
        data-testid="method-kind"
      />
      <SelectField
        label="محدوده"
        name="coverage"
        required
        options={[
          { value: 'WHOLE_COUNTRY', label: 'سراسر کشور' },
          { value: 'PROVINCES', label: 'فقط استان‌های انتخاب‌شده' },
        ]}
        data-testid="method-coverage"
      />
      <fieldset className="space-y-2xs">
        <legend className="text-label-sm">استان‌های تحت پوشش</legend>
        <p className="text-caption text-text-secondary">
          فقط وقتی لازم است که محدوده را «استان‌های انتخاب‌شده» گذاشته باشید.
        </p>
        <div className="hz-rail flex flex-wrap gap-sm">
          {provinces.map((province) => (
            <label key={province.code} className="flex items-center gap-2xs text-caption">
              <input
                type="checkbox"
                name="provinces"
                value={province.code}
                data-testid={'method-province-' + province.code}
              />
              {province.nameFa}
            </label>
          ))}
        </div>
      </fieldset>
      <SelectField
        label="نحوه قیمت‌گذاری"
        name="pricing"
        required
        options={[
          { value: 'FIXED', label: 'مبلغ ثابت برای هر سفارش' },
          { value: 'WEIGHT_BASED', label: 'بر اساس وزن' },
        ]}
        data-testid="method-pricing"
      />
      <TextField
        label="هزینه پایه (تومان)"
        name="baseFee"
        required
        ltr
        inputMode="numeric"
        hint={'صفر یعنی رایگان.' + (maxFeeFa ? ' سقف مجاز: ' + maxFeeFa + ' تومان.' : '')}
        data-testid="method-base-fee"
      />
      <TextField
        label="نرخ هر کیلوگرم (تومان)"
        name="perKg"
        ltr
        inputMode="numeric"
        hint="فقط برای قیمت‌گذاری وزنی."
        data-testid="method-per-kg"
      />
      <TextField
        label="وزن شامل هزینه پایه (گرم)"
        name="includedGrams"
        ltr
        inputMode="numeric"
        hint="فقط برای قیمت‌گذاری وزنی. صفر هم پذیرفته است."
        data-testid="method-included-grams"
      />
      <TextField
        label="حد نصاب ارسال رایگان (تومان)"
        name="freeThreshold"
        ltr
        inputMode="numeric"
        hint="خالی بگذارید اگر ارسال رایگان ندارید."
        data-testid="method-free-threshold"
      />
      <TextField
        label="مهلت آماده‌سازی (روز)"
        name="preparationDays"
        required
        ltr
        inputMode="numeric"
        hint="چند روز طول می‌کشد تا مرسوله از فروشگاه خارج شود. همین عدد به خریدار نشان داده می‌شود."
        data-testid="method-preparation-days"
      />
      <TextAreaField label="توضیح" name="note" rows={2} data-testid="method-note" />
      <Button type="submit" disabled={pending} data-testid="method-save">
        ثبت روش ارسال
      </Button>
    </form>
  );
}

/** The weight of one line, which only weight-based delivery needs. */
export function SkuWeightForm({
  action,
  sellerId,
  skuId,
  weightGrams,
}: {
  action: Action;
  sellerId: string;
  skuId: string;
  weightGrams: number | null;
}) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  return (
    <form action={submit} className="flex flex-wrap items-end gap-sm" data-testid={'weight-form-' + skuId}>
      <input type="hidden" name="sellerId" value={sellerId} />
      <input type="hidden" name="skuId" value={skuId} />
      <TextField
        label="وزن (گرم)"
        name="weightGrams"
        ltr
        inputMode="numeric"
        defaultValue={weightGrams === null ? '' : String(weightGrams)}
        data-testid={'weight-value-' + skuId}
      />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'weight-save-' + skuId}>
        ثبت وزن
      </Button>
      <Result state={state} testId={'weight-result-' + skuId} />
    </form>
  );
}
