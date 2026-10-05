# QuantityStepper

A compact «+ · count · −» control for the quantity of one product variant in the cart, bounded by 1 and the available stock.

Use it in CartRow (`__qty` slot) and on the product page next to «افزودن به سبد». Removing a line is a separate, explicit action («حذف از سبد»), never «−» at 1. Don't use it for numbers that are not item counts (weights, prices, ages) — use TextField / MoneyField.

## Anatomy

1. Group `.hz-qty` (`role="group"`, name includes the product): «+» button · count `<output>` · «−» button.
2. Next to it: StockBadge («موجود», «فقط ۴ عدد موجود», «ناموجود»).
3. Under it when needed: InlineMessage (limit reached, update failed) or a stock note.

## CSS API

| Class | Use |
|---|---|
| `.hz-qty` | Bordered group, 44px (48 on coarse pointers) |
| `.hz-qty--sm` | 36px, desktop cart rows with a fine pointer |
| `.hz-qty--invalid` · `--disabled` | Error border · out of stock / locked |
| `.hz-qty__count` | `<output>`, tabular digits |
| `.hz-qty-field` · `__row` | Optional label + stepper + badge layout |
| reuse | `.hz-icon-btn` (36px inside, 40px coarse), `.hz-stock*` (StockBadge), `.hz-inline-msg*` (InlineMessage), `.hz-stock-note` |

```html
<div class="hz-qty" role="group" aria-label="تعداد افسار ۵ متری جمع‌شو تا ۵۰ کیلوگرم">
  <button class="hz-icon-btn" type="button" aria-label="افزودن یکی" disabled>…plus…</button>
  <output class="hz-qty__count" aria-live="polite">۴</output>
  <button class="hz-icon-btn" type="button" aria-label="کم کردن یکی">…minus…</button>
</div>
```

## Tokens

`bg-surface` · `border-control` · buttons `icon-strong`, hover `action-secondary-hover`, disabled `text-disabled` · count `text-primary` 700 · invalid `status-error-border` · disabled group `bg-disabled`, `border-disabled` · `radius-md` (group), `radius-sm` (buttons) · `control-md` / `control-sm`.

## Variants & sizes

Default 44 (product page, mobile cart) · small 36 (desktop cart rows, `pointer: fine` only — grows to 48 on coarse pointers automatically). Same geometry as CartRow's `__qty`, so CartRow can swap in this component.

## States

Default («۲») · at minimum 1: «−» disabled + note «کمترین تعداد ۱ است؛ برای حذف، «حذف از سبد» را بزنید.» · at stock limit: «+» disabled + StockBadge «فقط ۴ عدد موجود» + InlineMessage warning · only one available: both disabled · updating (spinner replaces the count, both buttons disabled, `aria-busy`) · error («تعداد به‌روز نشد؛ دوباره امتحان کنید.», count reverted) · out of stock (group disabled, «ناموجود»; in the cart the row offers removal instead) · hover (pointer) · focus-visible (ring on the focused button) · long product names wrap in the label, never inside the control.

## Mobile ↔ desktop

<768: 48px group with 40px buttons on touch (≥ 44 with the border); in CartRow it sits at the start of the second row. ≥768: 44px (36px `--sm` in dense desktop cart rows with a mouse). The control never stretches.

## RTL & LTR

DOM order is «+», count, «−»: in RTL «+» is at the start (right), matching Persian shop convention. In LTR the group reverses (`[dir="ltr"] .hz-qty { flex-direction: row-reverse }`) to «− count +». Plus/minus are non-directional icons. Count in Persian digits.

## Accessibility

`role="group"` named «تعداد <product>»; buttons «افزودن یکی» / «کم کردن یکی»; the count is an `<output aria-live="polite">` so changes are announced. Disabled buttons keep focus order predictable (use `disabled`, and move focus to the other button if the focused one becomes disabled). Limit and error messages are linked/announced (`role="alert"` for failures). Optional: arrow keys ↑/↓ on the group change the value.

## Data

Cart line `quantity`; max = `stockOnHand − stockReserved` of the SKU (`shop.json`: افسار ۵ متری … ۵۰ کیلوگرم 5 − 1 = ۴; تشک ارتوپدی L 2 − 1 = ۱; شامپو ضدحساسیت 0 → ناموجود). Each change is sent to the server (debounced ~400 ms); the server answer is the truth (it may lower the quantity if stock changed — show the InlineMessage). Line totals come from the server; the client never multiplies money.

## Code mapping

★ Proposed `QuantityStepper` in `src/shop/quantity-stepper.tsx`: `value`, `min = 1`, `max` (available stock), `onChange(n) => Promise<void>`, `label` (product name for the group name), `size: 'md' | 'sm'`, `disabled?`, `pending?`, `error?`. Used by `CartRow` (`quantity`, `maxQuantity`, `pending`, `onQuantityChange`).

## Do / Don't

- Do disable «+» at the stock limit and say how many are available.
- Do keep removal as a separate, explicit action.
- Don't let people type quantities beyond stock; don't allow 0.
- Don't hide the count while updating without a spinner and an announcement.
