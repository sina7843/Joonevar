# OrderSummary

The money box of the cart and checkout: subtotal, shipping (optionally per shop), discount, amount payable, and the one primary «پرداخت …» button.

Use it beside the cart list (≥1024) or under it (<1024), and on the checkout step before the gateway. On mobile the amount payable and the pay button are repeated in `StickyActionBar`. Not a payment record — after payment the source of truth is the order (`SubOrderCard`) and the payment (`PaymentResult`, `/payments`).

## Anatomy

1. Title «خلاصه سفارش» (H 18/30).
2. Rows (`dl`): «جمع کالاها (۵ عدد)» · «هزینه ارسال» (+ one sub-row per shop whenever the cart has more than one shop) · «تخفیف» (only when > 0, shown as «−۲۰۰٬۰۰۰ تومان»).
3. Total row, above a hairline: «مبلغ قابل پرداخت» — ExtraBold 20 + «تومان».
4. Actions: primary block button with the amount in its label («پرداخت ۴٬۰۰۵٬۰۰۰ تومان»), then a one-line note on what happens next.
5. Locked case: `InlineMessage --warning` (what · why · what unlocks) + `ActionOwner` + disabled button.

## CSS API

New in `css-additions/OrderSummary.css`: `.hz-summary`, `__title`, `__list`, `__row` (`--sub`, `--total`), `__free`, `__note`, `__actions`. Wrap in `.hz-card`. Reuses `.hz-unset` (UnsetValue), `.hz-inline-msg`, `.hz-owner`, `.hz-btn--lg --block`, `.hz-skeleton`, `.hz-spinner`.

```html
<section class="hz-card hz-summary" aria-labelledby="sum-t">
  <h2 class="hz-summary__title" id="sum-t">خلاصه سفارش</h2>
  <dl class="hz-summary__list">
    <div class="hz-summary__row"><dt>جمع کالاها (۵ عدد)</dt><dd>۴٬۱۲۰٬۰۰۰ تومان</dd></div>
    <div class="hz-summary__row"><dt>هزینه ارسال</dt><dd>۸۵٬۰۰۰ تومان</dd></div>
    <div class="hz-summary__row"><dt>تخفیف</dt><dd>−۲۰۰٬۰۰۰ تومان</dd></div>
    <div class="hz-summary__row hz-summary__row--total"><dt>مبلغ قابل پرداخت</dt><dd>۴٬۰۰۵٬۰۰۰ <small>تومان</small></dd></div>
  </dl>
  <div class="hz-summary__actions"><button class="hz-btn hz-btn--primary hz-btn--lg hz-btn--block">پرداخت ۴٬۰۰۵٬۰۰۰ تومان</button>…</div>
</section>
```

## Tokens

`bg-surface`, `border-default`, `text-primary`, `text-secondary`, `status-success-text` («رایگان»), `status-warning-text` (unset shipping), `bg-subtle` (ActionOwner), `action-primary`, `bg-disabled`, `text-disabled`, `radius-xl`.

## Variants & sizes

- **Default** — all amounts known; discount row only when there is a discount.
- **Free shipping** — «رایگان» in success text when the shop's `freeShippingThreshold` is reached (پت‌شاپ آریا: ۳٬۴۹۰٬۰۰۰ ≥ ۱٬۵۰۰٬۰۰۰).
- **Per-shop shipping** — every shop ships its own sub-order, so shipping is the **sum of each shop's fee**, and each shop's free-shipping threshold applies only to that shop's items (approved 11 Mehr 1405). Multi-shop carts always show one sub-row per shop. Sample: پت‌شاپ آریا ۸۵٬۰۰۰ + فروشگاه نمونه همزیست رایگان = ۸۵٬۰۰۰ تومان.
- **Shipping unset** — the shop's `shippingFee` is `null`: that sub-row, the shipping row and the total all read «تعیین‌نشده» (never ۰); payment is closed with what · why · what unlocks and «اقدام بعدی با: فروشنده». Removing that shop's items reopens payment.
- One size; width comes from its column (360–400 desktop, full width below).

## States

- **Default** · **hover**: only the button.
- **Focus-visible**: the button ring.
- **Updating** (`aria-busy`): amounts become skeletons and the button is disabled while a cart change is recalculated server-side.
- **Redirecting**: spinner + «در حال انتقال به درگاه بانکی», `aria-disabled` so a double tap cannot create two payments.
- **Error** (quote failed): `InlineMessage --error` «مبلغ نهایی محاسبه نشد. دوباره تلاش کنید.» + button disabled.
- **Disabled / locked**: as «Shipping unset», or when a cart row is `--unavailable` («ابتدا کالای ناموجود را از سبد حذف کنید.»).
- **Long Persian text**: shop names in sub-rows wrap on the start side; amounts never wrap (`nowrap`, end-aligned).

## Mobile ↔ desktop

≥1024: `.hz-card` in the cart's side column, sticky under the header. 768–1023: full-width card under the cart list. <768: the card sits under the list and `StickyActionBar` repeats «مبلغ قابل پرداخت» + the pay button at the bottom of the viewport (summary line = total, primary = «پرداخت ۴٬۰۰۵٬۰۰۰ تومان»).

## RTL & LTR

Labels at the start, amounts at the end. The discount sign «−» precedes the number in reading order (it renders on its right in RTL); keep U+2212, not a hyphen. Money: Persian digits, `٬`, «تومان».

## Accessibility

- A `section` labelled by its heading; rows are a `dl`, so «هزینه ارسال: تعیین‌نشده» is read as a pair.
- The total row is in a polite live region on the cart page, so quantity changes announce the new amount once (not every row).
- Disabled pay button is `aria-describedby` the reason; the reason is visible text, not a tooltip.

## Data

`shop.json → cart`: `lines`, `subtotal`, `shipping`, `discount`, `total` (all `{toman, displayFa}`); `sellers[].shippingFee`, `freeShippingThreshold`. All amounts come from the server's quote — the client never adds money. The unset case is constructed (`shippingFee: null` for فروشگاه نمونه همزیست, per `edge-cases.json → money`).

## Code mapping

★ New — proposed `OrderSummary` in `src/shop/order-summary.tsx`: `itemCount`, `subtotalToman: bigint`, `shipping: { sellerName, feeToman: bigint | null, free?: boolean }[]`, `discountToman?: bigint`, `totalToman: bigint | null`, `state: 'ready' | 'updating' | 'redirecting' | 'locked' | 'error'`, `lockReason?`, `onPay()`. Locked whenever any fee is `null` or `totalToman` is `null`.

## Do / Don't

- Do put the amount in the pay button label.
- Do show per-shop shipping when shops differ — buyers see why there are several sub-orders.
- Don't show «۰ تومان» for an unset fee or total, and don't let the pay path open around it.
- Don't add a second primary button (e.g. «ادامه خرید» is a secondary link above the cart).
