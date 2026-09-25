'use client';

import { useActionState } from 'react';
import { Button } from '../ui/button.tsx';
import { Alert } from '../ui/alert.tsx';
import { SelectField, TextAreaField, TextField } from '../ui/field.tsx';
import { DISCOUNT_KINDS, DISCOUNT_KIND_FA, type DiscountKind } from './trust-model.ts';

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

const SCORES = [1, 2, 3, 4, 5].map((score) => ({
  value: String(score),
  label: score.toLocaleString('fa-IR'),
}));

/**
 * Leave a review of one finished purchase.
 *
 * The three questions are the ones that belong to this kind of purchase; an
 * animal deal and a bag of food are not judged on the same things.
 */
export function ReviewForm({
  action,
  subOrderId,
  inquiryId,
  dimensionsFa,
  testPrefix,
}: {
  action: Action;
  subOrderId?: string;
  inquiryId?: string;
  dimensionsFa: readonly [string, string, string];
  testPrefix: string;
}) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  const key = subOrderId ?? inquiryId ?? '';
  return (
    <form action={submit} className="space-y-md" data-testid={testPrefix + '-form-' + key}>
      {subOrderId ? <input type="hidden" name="subOrderId" value={subOrderId} /> : null}
      {inquiryId ? <input type="hidden" name="inquiryId" value={inquiryId} /> : null}
      <Result state={state} testId={testPrefix + '-result-' + key} />
      <SelectField
        label={dimensionsFa[0]}
        name="scoreOne"
        required
        options={SCORES}
        data-testid={testPrefix + '-one-' + key}
      />
      <SelectField
        label={dimensionsFa[1]}
        name="scoreTwo"
        required
        options={SCORES}
        data-testid={testPrefix + '-two-' + key}
      />
      <SelectField
        label={dimensionsFa[2]}
        name="scoreThree"
        required
        options={SCORES}
        data-testid={testPrefix + '-three-' + key}
      />
      <TextAreaField label="توضیح" name="body" rows={3} data-testid={testPrefix + '-body-' + key} />
      <Button type="submit" disabled={pending} data-testid={testPrefix + '-submit-' + key}>
        ثبت نظر
      </Button>
    </form>
  );
}

/** The shop's public answer to a review. It never changes the score. */
export function ReviewReplyForm({ action, reviewId }: { action: Action; reviewId: string }) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid={'reply-form-' + reviewId}>
      <input type="hidden" name="reviewId" value={reviewId} />
      <Result state={state} testId={'reply-result-' + reviewId} />
      <TextAreaField label="پاسخ شما" name="reply" required rows={2} data-testid={'reply-body-' + reviewId} />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'reply-submit-' + reviewId}>
        ثبت پاسخ
      </Button>
    </form>
  );
}

export function ModerateReviewForm({ action, reviewId }: { action: Action; reviewId: string }) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid={'moderate-form-' + reviewId}>
      <input type="hidden" name="reviewId" value={reviewId} />
      <Result state={state} testId={'moderate-result-' + reviewId} />
      <SelectField
        label="تصمیم"
        name="to"
        required
        options={[
          { value: 'HIDDEN', label: 'پنهان کردن' },
          { value: 'PUBLISHED', label: 'بازگرداندن' },
          { value: 'REMOVED', label: 'حذف' },
        ]}
        data-testid={'moderate-select-' + reviewId}
      />
      <TextAreaField label="دلیل" name="reason" required rows={2} data-testid={'moderate-reason-' + reviewId} />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'moderate-submit-' + reviewId}>
        ثبت
      </Button>
    </form>
  );
}

/** Ask something in public, which a moderator sees before anybody else does. */
export function AskQuestionForm({
  action,
  productId,
  sellerId,
}: {
  action: Action;
  productId?: string;
  sellerId?: string;
}) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  const key = productId ?? sellerId ?? '';
  return (
    <form action={submit} className="space-y-sm" data-testid={'ask-form-' + key}>
      {productId ? <input type="hidden" name="productId" value={productId} /> : null}
      {sellerId ? <input type="hidden" name="sellerId" value={sellerId} /> : null}
      <Result state={state} testId={'ask-result-' + key} />
      <TextAreaField
        label="پرسش شما"
        name="body"
        required
        rows={2}
        hint="پرسش پس از بررسی نمایش داده می‌شود. شماره تماس و نشانی در متن عمومی نمایش داده نمی‌شود."
        data-testid={'ask-body-' + key}
      />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'ask-submit-' + key}>
        ثبت پرسش
      </Button>
    </form>
  );
}

export function AnswerQuestionForm({ action, questionId }: { action: Action; questionId: string }) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid={'answer-form-' + questionId}>
      <input type="hidden" name="questionId" value={questionId} />
      <Result state={state} testId={'answer-result-' + questionId} />
      <TextAreaField label="پاسخ" name="answer" required rows={2} data-testid={'answer-body-' + questionId} />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'answer-submit-' + questionId}>
        ثبت پاسخ
      </Button>
    </form>
  );
}

export function DecideQuestionForm({ action, questionId }: { action: Action; questionId: string }) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid={'decide-question-form-' + questionId}>
      <input type="hidden" name="questionId" value={questionId} />
      <Result state={state} testId={'decide-question-result-' + questionId} />
      <SelectField
        label="تصمیم"
        name="to"
        required
        options={[
          { value: 'PUBLISHED', label: 'انتشار' },
          { value: 'REJECTED', label: 'رد' },
        ]}
        data-testid={'decide-question-select-' + questionId}
      />
      <TextField label="دلیل" name="reason" data-testid={'decide-question-reason-' + questionId} />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'decide-question-submit-' + questionId}>
        ثبت
      </Button>
    </form>
  );
}

/** Keep something for later, or stop keeping it. */
export function SaveForm({
  action,
  productId,
  listingId,
  saved,
}: {
  action: Action;
  productId?: string;
  listingId?: string;
  saved: boolean;
}) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  const key = productId ?? listingId ?? '';
  return (
    <form action={submit} data-testid={'save-form-' + key}>
      {productId ? <input type="hidden" name="productId" value={productId} /> : null}
      {listingId ? <input type="hidden" name="listingId" value={listingId} /> : null}
      {saved ? <input type="hidden" name="remove" value="yes" /> : null}
      <Result state={state} testId={'save-result-' + key} />
      <Button type="submit" tone="ghost" disabled={pending} data-testid={'save-toggle-' + key}>
        {saved ? 'برداشتن از فهرست' : 'نگه‌داشتن برای بعد'}
      </Button>
    </form>
  );
}

export function FollowForm({
  action,
  sellerId,
  following,
}: {
  action: Action;
  sellerId: string;
  following: boolean;
}) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  return (
    <form action={submit} data-testid={'follow-form-' + sellerId}>
      <input type="hidden" name="sellerId" value={sellerId} />
      {following ? <input type="hidden" name="remove" value="yes" /> : null}
      <Result state={state} testId={'follow-result-' + sellerId} />
      <Button type="submit" tone="ghost" disabled={pending} data-testid={'follow-toggle-' + sellerId}>
        {following ? 'دنبال نکردن' : 'دنبال کردن فروشگاه'}
      </Button>
    </form>
  );
}

/** What this person has turned off. Every one of them is theirs to decide. */
export function PreferencesForm({
  action,
  recommendationsOff,
  historyOff,
  priceAlertsOff,
}: {
  action: Action;
  recommendationsOff: boolean;
  historyOff: boolean;
  priceAlertsOff: boolean;
}) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid="preferences-form">
      <Result state={state} testId="preferences-result" />
      <label className="flex items-center gap-sm text-body-sm">
        <input
          type="checkbox"
          name="recommendationsOff"
          defaultChecked={recommendationsOff}
          data-testid="pref-recommendations"
        />
        پیشنهادها را بر اساس بازدیدها و خریدهای من نساز
      </label>
      <label className="flex items-center gap-sm text-body-sm">
        <input type="checkbox" name="historyOff" defaultChecked={historyOff} data-testid="pref-history" />
        تاریخچه بازدید من را نگه ندار
      </label>
      <label className="flex items-center gap-sm text-body-sm">
        <input
          type="checkbox"
          name="priceAlertsOff"
          defaultChecked={priceAlertsOff}
          data-testid="pref-price-alerts"
        />
        درباره کاهش قیمت به من اطلاع نده
      </label>
      <Button type="submit" tone="secondary" disabled={pending} data-testid="preferences-save">
        ذخیره تنظیمات
      </Button>
    </form>
  );
}

/** One way a price comes down, declared by whoever pays for it. */
export function DiscountForm({
  action,
  sellerId,
  kinds,
  categories,
}: {
  action: Action;
  sellerId?: string;
  kinds: readonly DiscountKind[];
  categories: readonly { id: string; nameFa: string }[];
}) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  return (
    <form action={submit} className="space-y-md" data-testid="discount-form">
      {sellerId ? <input type="hidden" name="sellerId" value={sellerId} /> : null}
      <Result state={state} testId="discount-result" />
      <SelectField
        label="نوع"
        name="kind"
        required
        options={kinds.map((kind) => ({ value: kind, label: DISCOUNT_KIND_FA[kind] }))}
        data-testid="discount-kind"
      />
      <TextField label="نام" name="label" required data-testid="discount-label" />
      <TextField
        label="کد"
        name="code"
        ltr
        hint="فقط برای کد تخفیف. حروف انگلیسی، رقم و خط تیره."
        data-testid="discount-code"
      />
      <TextField
        label="درصد تخفیف (پایه‌واحد)"
        name="percentBp"
        ltr
        inputMode="numeric"
        hint="هر ۱۰۰ یعنی یک درصد. مثلاً ۱۰۰۰ یعنی ۱۰٪."
        data-testid="discount-percent"
      />
      <TextField label="مبلغ ثابت تخفیف (تومان)" name="amount" ltr inputMode="numeric" data-testid="discount-amount" />
      <TextField label="سقف تخفیف (تومان)" name="maxDiscount" ltr inputMode="numeric" data-testid="discount-max" />
      <TextField label="حداقل مبلغ سبد (تومان)" name="minBasket" ltr inputMode="numeric" data-testid="discount-min" />
      <SelectField
        label="دسته"
        name="categoryId"
        options={[{ value: '', label: 'همه دسته‌ها' }, ...categories.map((c) => ({ value: c.id, label: c.nameFa }))]}
        data-testid="discount-category"
      />
      <TextField label="سقف تعداد استفاده" name="totalUses" ltr inputMode="numeric" data-testid="discount-total-uses" />
      <TextField
        label="سقف استفاده هر حساب"
        name="usesPerAccount"
        ltr
        inputMode="numeric"
        data-testid="discount-account-uses"
      />
      <TextField label="آغاز" name="startsAt" ltr data-testid="discount-starts" />
      <TextField label="پایان" name="endsAt" ltr data-testid="discount-ends" />
      <TextAreaField label="توضیح" name="note" rows={2} data-testid="discount-note" />
      <Button type="submit" disabled={pending} data-testid="discount-save">
        ثبت تخفیف
      </Button>
    </form>
  );
}

export function MoveDiscountForm({
  action,
  ruleId,
  sellerId,
  to,
  labelFa,
}: {
  action: Action;
  ruleId: string;
  sellerId?: string;
  to: 'ACTIVE' | 'PAUSED' | 'ENDED';
  labelFa: string;
}) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  return (
    <form action={submit} className="inline" data-testid={'move-discount-form-' + ruleId + '-' + to}>
      <input type="hidden" name="ruleId" value={ruleId} />
      <input type="hidden" name="to" value={to} />
      {sellerId ? <input type="hidden" name="sellerId" value={sellerId} /> : null}
      <Result state={state} testId={'move-discount-result-' + ruleId} />
      <Button type="submit" tone="ghost" disabled={pending} data-testid={'move-discount-' + ruleId + '-' + to}>
        {labelFa}
      </Button>
    </form>
  );
}

/** How discounts combine. Until a version is published, nothing stacks. */
export function StackingForm({ action }: { action: Action }) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  const pairs: [DiscountKind, DiscountKind][] = [];
  for (let i = 0; i < DISCOUNT_KINDS.length; i += 1) {
    for (let j = i + 1; j < DISCOUNT_KINDS.length; j += 1) {
      pairs.push([DISCOUNT_KINDS[i]!, DISCOUNT_KINDS[j]!]);
    }
  }
  return (
    <form action={submit} className="space-y-md" data-testid="stacking-form">
      <Result state={state} testId="stacking-result" />
      <TextField label="شناسه نسخه" name="version" required ltr data-testid="stacking-version" />
      <TextAreaField label="متن سیاست" name="body" required rows={3} data-testid="stacking-body" />
      <fieldset className="space-y-2xs">
        <legend className="text-label-sm">کدام‌ها با هم جمع می‌شوند</legend>
        <p className="text-caption text-text-secondary">
          هر جفتی که انتخاب نشود، با هم جمع نمی‌شود. تا انتشار یک نسخه، هیچ دو تخفیفی جمع نمی‌شوند.
        </p>
        {pairs.map(([left, right]) => (
          <label key={left + right} className="flex items-center gap-sm text-caption">
            <input
              type="checkbox"
              name="combinable"
              value={left + '+' + right}
              data-testid={'stacking-pair-' + left + '-' + right}
            />
            {DISCOUNT_KIND_FA[left]} + {DISCOUNT_KIND_FA[right]}
          </label>
        ))}
      </fieldset>
      <Button type="submit" disabled={pending} data-testid="stacking-publish">
        انتشار سیاست
      </Button>
    </form>
  );
}

/** A code and points, entered on the basket. */
export function BasketDiscountForm({
  action,
  code,
  points,
  availablePoints,
  pointValueFa,
}: {
  action: Action;
  code: string;
  points: number;
  availablePoints: number;
  pointValueFa: string | null;
}) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid="basket-discount-form">
      <Result state={state} testId="basket-discount-result" />
      <TextField label="کد تخفیف" name="code" ltr defaultValue={code} data-testid="basket-code" />
      <TextField
        label="امتیاز خرج‌شده"
        name="redeemPoints"
        ltr
        inputMode="numeric"
        defaultValue={points === 0 ? '' : String(points)}
        hint={
          availablePoints === 0
            ? 'امتیازی ندارید.'
            : 'امتیاز شما: ' +
              availablePoints.toLocaleString('fa-IR') +
              (pointValueFa ? ' — هر امتیاز ' + pointValueFa + ' تومان' : ' — ارزش هر امتیاز هنوز ثبت نشده است.')
        }
        data-testid="basket-points"
      />
      <Button type="submit" tone="secondary" disabled={pending} data-testid="basket-discount-apply">
        اعمال
      </Button>
    </form>
  );
}
