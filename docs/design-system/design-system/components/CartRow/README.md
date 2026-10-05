# CartRow

One product variant in the shopping cart — image, name, variant, unit price, quantity control, line total and remove.

Use it in `/shop/cart`, grouped under a shop header (one cart → several shops → one sub-order per shop, see `SubOrderCard`). Not for order history (that is `SubOrderCard`) and not for the checkout summary (`OrderSummary`).

## Anatomy

1. Thumbnail 64×64 (`.hz-media--thumb-lg`); missing image → symbol empty state.
2. Body: name (link to `/shop/[slug]`, Bold 15/24) · variant «وزن بسته: ۳ کیلوگرم» · unit price «قیمت واحد ۲٬۸۵۰٬۰۰۰ تومان» · optional `StockBadge --sm` / `InlineMessage`.
3. Quantity control: + · count · − in one bordered group (composition of `.hz-icon-btn`; swap for `QuantityStepper` once merged — same slot `__qty`).
4. Line total: «۶۳۰٬۰۰۰ تومان», with «۳ × ۲۱۰٬۰۰۰» under it when quantity > 1.
5. Remove: `trash` icon button with a full accessible name.

## CSS API

New in `css-additions/CartRow.css`: `.hz-cart-list`, `.hz-cart-row` (`--stacked`, `--unavailable`), `__body`, `__name`, `__variant`, `__unit`, `__qty`, `__count`, `__total`, `__amount`, `__math`, `__remove`, `__fix`. Reuses `.hz-media--thumb-lg`, `.hz-icon-btn`, `.hz-stock`, `.hz-inline-msg`, `.hz-spinner`, `.hz-skeleton`.

```html
<ul class="hz-cart-list">
  <li class="hz-cart-row">
    <div class="hz-media hz-media--thumb-lg">…</div>
    <div class="hz-cart-row__body">
      <a class="hz-cart-row__name" href="/shop/p-346770">اسباب‌بازی طناب گره‌دار</a>
      <span class="hz-cart-row__variant">اندازه: کوچک</span>
      <span class="hz-cart-row__unit">قیمت واحد ۲۱۰٬۰۰۰ تومان</span>
    </div>
    <div class="hz-cart-row__qty" role="group" aria-label="تعداد اسباب‌بازی طناب گره‌دار">
      <button class="hz-icon-btn" aria-label="یکی بیشتر">…plus…</button>
      <output class="hz-cart-row__count" aria-live="polite">۳</output>
      <button class="hz-icon-btn" aria-label="یکی کمتر">…minus…</button>
    </div>
    <div class="hz-cart-row__total"><span class="hz-cart-row__amount">۶۳۰٬۰۰۰ <small>تومان</small></span><span class="hz-cart-row__math">۳ × ۲۱۰٬۰۰۰</span></div>
    <button class="hz-icon-btn hz-cart-row__remove" aria-label="حذف اسباب‌بازی طناب گره‌دار از سبد">…trash…</button>
  </li>
</ul>
```

## Tokens

`bg-surface`, `border-subtle`, `border-control`, `text-primary`, `text-secondary`, `text-brand`, `icon-default`, `status-warning-text`, `status-info-text`, `radius-md`, `radius-sm`, `control-sm`, `control-md`, `focus-ring`.

## Variants & sizes

- **Default** (one line ≥768) and **`--stacked`** (two lines; automatic <768, forced in narrow columns such as a mini-cart drawer).
- **`--unavailable`** — the SKU went out of stock (or was unpublished) after it was added: thumbnail dimmed, `StockBadge` «ناموجود», warning message, line total «—», and the quantity control is replaced by «حذف از سبد» (`__fix`). It is excluded from `OrderSummary`.

## States

- **Default** · **hover** (pointer): name link underlines; icon buttons get `action-secondary-hover`.
- **Focus-visible**: ring on each button and the name link. Tab order: name → + → − → remove.
- **Min / max**: − disabled at ۱ (removing is the trash button's job); + disabled at the available stock, with «قابل فروش همین ۱ عدد است.» (`InlineMessage --info`) linked by `aria-describedby`.
- **Updating** (`aria-busy="true"`): spinner in place of the count, line total as a skeleton, all buttons disabled until the server answers; totals in `OrderSummary` update after.
- **Error** (update rejected): count returns to the last saved value and `InlineMessage --error` explains: «تعداد به‌روز نشد. دوباره تلاش کنید.»
- **Price changed since added**: `InlineMessage --info` «قیمت این کالا از … به … تغییر کرد.» above the unit price (values from the server, never computed in the client).
- **Empty cart**: not a row state — `EmptyState` «سبد خرید شما خالی است» + «رفتن به فروشگاه».
- **Long Persian text**: the name wraps (no truncation; the variant must stay visible) — «غذای خشک سگ بالغ نژاد بزرگ — ۱۵ کیلوگرم».

## Mobile ↔ desktop

<768 (and `--stacked`): row 1 = thumbnail · text · remove; row 2 = quantity at the start, line total at the end. ≥768: single row, quantity and total in fixed columns so totals line up down the cart. ≥1024 the cart list takes the main column and `OrderSummary` sits beside it. On coarse pointers the + / − buttons grow to 40px inside a 48px group (with the group border the hit area is ≥44px).

## RTL & LTR

`+` sits at the inline start (right in RTL), `−` at the end; neither is mirrored. Totals are end-aligned (left in RTL). «۳ × ۲۱۰٬۰۰۰» keeps count first in reading order. Size codes (S, M, L) need no `bdi`.

## Accessibility

- The quantity group has `role="group"` and a name that includes the product; the count is an `<output aria-live="polite">`.
- Buttons have full names («حذف قلاده چرمی قابل تنظیم از سبد»), never just «حذف».
- After removing a row, focus moves to the next row's name (or to the cart heading if it was the last) and a polite live message says «… از سبد حذف شد.»
- Unavailable is said in text, not by dimming alone.

## Data

`shop.json → products[].offers[].skus[]` (`labelFa`, `price`, `stockOnHand`, `stockReserved`) + cart line `quantity`. Sample cart: پت‌شاپ آریا — غذای خشک ۳ کیلوگرم × ۱ (۲٬۸۵۰٬۰۰۰) و قلاده S × ۱ (۶۴۰٬۰۰۰)؛ فروشگاه نمونه همزیست — طناب کوچک × ۳ (۶۳۰٬۰۰۰) → subtotal ۴٬۱۲۰٬۰۰۰ = `cart.subtotal`. Line total = server value; the client never multiplies money.

## Code mapping

★ New — proposed `CartRow` in `src/shop/cart-row.tsx`: `sku`, `name`, `href`, `variantLabel`, `optionName`, `unitPriceToman: bigint`, `quantity`, `maxQuantity` (available stock), `lineTotalToman: bigint`, `image?`, `unavailable?: boolean`, `pending?: boolean`, `onQuantityChange(q)`, `onRemove()`. Uses `QuantityStepper` (★, other P1) for `__qty`.

## Do / Don't

- Do group rows by shop — each shop ships separately.
- Do keep unavailable rows visible until the buyer removes them; never drop them silently.
- Don't let − remove the row at quantity ۱; removal is explicit.
- Don't show a line total for an unavailable row — «—».
