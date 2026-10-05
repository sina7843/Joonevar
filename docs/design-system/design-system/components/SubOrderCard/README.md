# SubOrderCard

One shop's part of a shop order — shop, status, delivery track, items, items total, «اقدام بعدی با: …» and the shop-specific action — because one cart becomes several independent sub-orders.

Use it on the order detail (`/account/orders/[id]`), one card per shop under an order header, and in the order list as a compact card. Each sub-order moves through its own statuses (one shop can be «ارسال‌شده» while the other is «در حال آماده‌سازی»); never summarise them into one order status. Not for the cart (`CartRow`) and not for the seller's own queue (that is `CaseQueue`/`DataTable`).

## Anatomy

1. Order header (`.hz-order-head`, once per order): «سفارش» + order number in `bdi` + payment `StatusBadge`; meta «ثبت: ۵ مهر ۱۴۰۵، ۲۱:۱۰»، «مبلغ پرداخت‌شده»، «۲ زیرسفارش از ۲ فروشگاه».
2. Card head: `storefront` icon · shop name (H3 16/26) · «زیرسفارش ۱ از ۲، کرج» · `StatusBadge` at the inline end.
3. Delivery track: five segments پرداخت → پذیرش → آماده‌سازی → ارسال → تحویل + «مرحله ۴ از ۵ — بعدی: تحویل». Hidden for off-path statuses.
4. Items: 56px thumb · name · «۳ کیلوگرم، ۱ عدد» · line amount.
5. «جمع کالاهای این فروشگاه» (`dl`).
6. Foot: `ActionOwner` (full width) + one secondary action for this sub-order.

## CSS API

New in `css-additions/SubOrderCard.css`: `.hz-order-head` (`__title`, `__meta`), `.hz-suborders` (1 column <768, 2 columns ≥768), `.hz-suborder` (`__head`, `__shop`, `__shop-text`, `__name`, `__sub`, `__track`, `__steps`, `__step`, `__step--done`, `__track-label`, `__items`, `__item`, `__item-text`, `__item-name`, `__item-meta`, `__item-amount`, `__sum`, `__foot`). Composes `.hz-card`, `.hz-badge`, `.hz-owner`, `.hz-media--thumb`, `.hz-btn--secondary --sm`.

```html
<article class="hz-card hz-suborder" aria-labelledby="so-1">
  <div class="hz-suborder__head">
    <div class="hz-suborder__shop"><svg …storefront…></svg><div class="hz-suborder__shop-text">
      <h3 class="hz-suborder__name" id="so-1">پت‌شاپ آریا</h3><span class="hz-suborder__sub">زیرسفارش ۱ از ۲، کرج</span></div></div>
    <span class="hz-badge hz-badge--info"><span class="hz-badge__dot"></span>ارسال‌شده</span>
  </div>
  <div class="hz-suborder__track"><ol class="hz-suborder__steps" aria-label="مسیر ارسال: مرحله ۴ از ۵">…5 × li.hz-suborder__step…</ol>…</div>
  <ul class="hz-suborder__items">…</ul>
  <dl class="hz-suborder__sum"><dt>جمع کالاهای این فروشگاه</dt><dd>۳٬۴۹۰٬۰۰۰ تومان</dd></dl>
  <div class="hz-suborder__foot"><div class="hz-owner">…شرکت حمل…</div><a class="hz-btn hz-btn--secondary hz-btn--sm" href="…">جزئیات و پیگیری مرسوله</a></div>
</article>
```

## Tokens

`bg-surface`, `border-default`, `border-subtle`, `border-brand` (track), `icon-default`, `text-primary`, `text-secondary`, `bg-subtle` / `status-warning-bg` (ActionOwner), `status-*` via StatusBadge, `radius-xl`, `radius-full`.

## Variants & sizes

**11 sub-order statuses → status dictionary** (label and tone are the dictionary's; the owner is the buyer's view):

| Key | Label | Tone | Track | اقدام بعدی با | Buyer action |
|---|---|---|---|---|---|
| `PENDING_PAYMENT` | در انتظار پرداخت | warning | 0/5 | شما | پرداخت |
| `PAID` | پرداخت‌شده | success | 1/5 | فروشنده (پذیرش) | — |
| `ACCEPTED_BY_SELLER` | پذیرفته‌شده | info | 2/5 | فروشنده | — |
| `PREPARING` | در حال آماده‌سازی | info | 3/5 | فروشنده | — |
| `SHIPPED` | ارسال‌شده | info | 4/5 | شرکت حمل | پیگیری مرسوله |
| `DELIVERED` | تحویل‌شده | success | 5/5 | — | درخواست مرجوعی · ثبت نظر |
| `RETURN_REQUESTED` | درخواست مرجوعی | warning | hidden | فروشنده | لغو درخواست |
| `RETURNED` | مرجوع‌شده | neutral | hidden | — | — |
| `REFUNDED` | بازپرداخت‌شده | neutral | hidden | — | — |
| `CANCELLED` | لغوشده | neutral | hidden | — | — |
| `REJECTED` | ردشده | error | hidden | همزیست (بازپرداخت) | — |

- **Full** (order detail): everything above. **Compact** (order list): head + track + «۲ کالا» + amount + owner; no item rows.

## States

- **Default** · **hover**: compact cards are links (`.hz-card--interactive`); full cards are not.
- **Focus-visible**: ring on the action button / the compact card link.
- **Loading**: card skeleton (head line, track bar, two item rows).
- **Error**: `InlineMessage --error` inside the card when this sub-order could not be loaded; the other sub-orders still render.
- **Empty**: n/a — an order always has ≥ 1 sub-order.
- **Long Persian text**: shop names and item names wrap; the badge never shrinks (`flex-shrink: 0`).

## Mobile ↔ desktop

<768: cards stack, full width; foot button fills the row. ≥768: two cards per row (`.hz-suborders`). ≥1024 in the PublicShell main column: still two per row; a third shop wraps. Buttons are 36px (`--sm`) on fine pointers and 44px on coarse pointers via the ActionOwner row height.

## RTL & LTR

The track fills from the inline start (right in RTL). The order number is Latin in `<bdi class="hz-id" dir="ltr">`. `storefront` is not mirrored. Amounts end-aligned.

## Accessibility

- Each card is an `article` labelled by the shop name.
- The track is an `ol` with an `aria-label` («مسیر ارسال: مرحله ۴ از ۵»), visually hidden step names and `aria-current="step"`; the visible caption is `aria-hidden` to avoid double reading.
- Status is text in the badge, never colour alone.

## Data

`shop.json → orders[]`: `number` («سفارش 854Q6KUX» → render «سفارش» + `854Q6KUX`), `status`, `placedAt`, `total`, `subOrders[]` (`sellerFa`, `status`, `items`). Item rows reconstruct the sample cart (غذای خشک ۳ کیلوگرم + قلاده S at پت‌شاپ آریا = ۳٬۴۹۰٬۰۰۰؛ طناب کوچک × ۳ = ۶۳۰٬۰۰۰). The pack has no sub-order id format and does not list the 11 statuses — the set above is inferred from the status dictionary; verify against the code's enum.

## Code mapping

★ New — proposed `SubOrderCard` in `src/shop/sub-order-card.tsx`: `sellerName`, `sellerCity`, `index`, `count`, `status: SubOrderStatus`, `items: { name, variantLabel, quantity, lineTotalToman: bigint, image? }[]`, `itemsTotalToman: bigint`, `actionOwner`, `action?: { label, href }`, `compact?: boolean`. Badge via `StatusBadge`, owner via `ActionOwner`.

## Do / Don't

- Do show each shop's status separately, even when they match.
- Do say who acts next on every card.
- Don't invent a combined status like «ارسال ناقص» for the order.
- Don't show the track for cancelled, returned, refunded or rejected sub-orders — the badge alone tells the end state.
