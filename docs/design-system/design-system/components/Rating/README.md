# Rating

Shop review scores. Display mode shows the average with a Persian decimal («۴٫۶ از ۵»), five stars filled to the value and the review count. Input mode is five star radios a buyer uses to rate a delivered item.

Use the display on product and seller cards, product and seller pages, and review rows. Use the input in the review form after delivery. Don't use stars for anything that isn't a buyer review: not for vets, breeds, centres or animals, and not for the mating finder's compatibility.

## Anatomy

**Display**
1. `.hz-rating` (from ProductCard): an inline row.
2. **Stars** `__stars`: five `star` outlines in `border-control`, with a `__fill` layer of five `star-fill` in `icon-strong` clipped to `--rating-fill` (value ÷ 5). It fills from the start edge.
3. **Value** `__value` «۴٫۶» (Bold) + **max** `__max` «از ۵».
4. **Count** `__count` «(۹۳ نظر)».
5. **Compact** (ProductCard): one `star-fill` + value + count, with no five-star bar.
6. **Summary** `.hz-rating-summary`: a large value beside the stars, and «از ۵، بر پایه ۹۳ نظر» under them.

**Input**
1. `<fieldset class="hz-rating-input">` + `<legend>` (Field label).
2. `__stars`: five `label.__opt` 44×44 targets, each wrapping a radio (`value` 1…5) and both icons (`__off`, `__on`).
3. `__value`: live text «۴ از ۵» / «انتخاب نشده».
4. Field hint or error below.

## CSS API

ProductCard.css: `.hz-rating`, `__count`, `--none`. Additions (`tools/css-additions/Rating.css`): `__stars`, `__fill` (`--rating-fill`), `__value`, `__max`, `--md`, `.hz-rating-summary` (`__value`, `__count`), `.hz-rating-input` (`__row`, `__stars`, `__opt`, `__on`, `__off`, `__value`, `__value--empty`, `[aria-invalid]`, `:disabled`).

```html
<span class="hz-rating" role="img" aria-label="امتیاز ۴٫۶ از ۵، ۹۳ نظر">
  <span class="hz-rating__stars" aria-hidden="true">…5× star<span class="hz-rating__fill" style="--rating-fill: 92%">…5× star-fill</span></span>
  <span class="hz-rating__value">۴٫۶</span><span class="hz-rating__max">از ۵</span><span class="hz-rating__count">(۹۳ نظر)</span>
</span>
<fieldset class="hz-rating-input"><legend class="hz-field__label">امتیاز شما به «تشویقی تمرینی مرغ»</legend>
  <div class="hz-rating-input__row"><span class="hz-rating-input__stars">
    <label class="hz-rating-input__opt"><input type="radio" name="r" value="1" aria-label="۱ از ۵">…star.__off …star-fill.__on</label> … ×5
  </span><span class="hz-rating-input__value" aria-live="polite">۴ از ۵</span></div>
</fieldset>
```

## Tokens

`icon-strong` (filled stars) · `border-control` (empty stars, 3.4:1) · `text-primary` (value) · `text-secondary` (max, count, none) · `bg-subtle` (input hover) · `status-error-border` (input error) · `border-disabled` (input disabled) · `focus-ring` · `radius-md` (input target).

## Variants & sizes

- **Compact**: product card (13px, one star).
- **sm**: 16px stars, 13px text. Lists and review rows.
- **md** (`--md`): 20px stars, 14px. Seller and product header.
- **Summary**: 36px value + 20px stars. Product page review section.
- **Input**: 28px stars in 44px targets.

## States

- **Display default**: value to one decimal with «٫». A whole number has no decimal («۵ از ۵»).
- **No reviews** (`--none`): «هنوز نظری ثبت نشده». Never «۰ از ۵», never five empty stars.
- **Loading**: a 160×14 skeleton in the line box.
- **Error**: the rating line is omitted. The product still shows, because a rating is never required to buy.
- **Input empty**: outline stars + «انتخاب نشده».
- **Input hover** (pointer only): the hovered star darkens and gets a `bg-subtle` target.
- **Input focus-visible**: inset ring on the focused star's 44px target.
- **Input selected**: the chosen star and all before it filled. The live text updates («۴ از ۵»).
- **Input error**: stars outlined in `status-error-border` + Field error «برای ثبت نظر، امتیاز را انتخاب کنید.», with `aria-invalid` on the fieldset.
- **Input disabled**: `disabled` fieldset + reason «پس از تحویل سفارش می‌توانید امتیاز دهید.».
- **Long Persian text**: the legend wraps («امتیاز شما به «غذای خشک سگ بالغ نژاد بزرگ — ۱۵ کیلوگرم»»). The stars never shrink below 44px targets.

## Mobile ↔ desktop

The same at every width. In a 2-column mobile product grid only the compact form fits. The input row wraps the value text under the stars when narrow.

## RTL & LTR

Stars fill from the **start** edge (right in RTL), and the partial star is cut on its end side, because the fill layer is anchored with `inset-inline-start`. Radio order 1→5 is start→end in both directions. `star` / `star-fill` are never mirrored. Arrow keys follow the browser's radio behaviour (→ and ← move between values).

## Accessibility

- Display: the whole row is `role="img"` with a full sentence (`aria-label="امتیاز ۴٫۶ از ۵، ۹۳ نظر"`), and the stars are `aria-hidden`. The number carries the meaning, the stars only echo it.
- Input: native radios in a fieldset with a legend. Each radio is named «۱ از ۵»…«۵ از ۵». The selected value is echoed in a polite live region. The radios cover their 44px targets with opacity 0 (not `display:none`), so they stay focusable.
- Filled vs empty stars differ by shape (fill vs outline), not only by colour.

## Data

`product.ratingAvg` (one decimal) + `ratingCount`. Review: `rating` (1–5), `textFa`, `authorFa` («سارا ا.», already abbreviated by the server), `at.longFa`. Only buyers with a delivered order can rate (`DELIVERED`). The input is disabled otherwise and says why. Fill percentage = `ratingAvg / 5 × 100`.

## Code mapping

★ New `src/shop/rating.tsx`: `Rating({ value: number | null, count: number, size?: 'compact' | 'sm' | 'md' | 'summary' })` and `RatingInput({ name, value, onChange, disabled?: { reason }, error? })`. ProductCard's compact row becomes `Rating size="compact"`.

## Do / Don't

- Do always show the number and the count next to stars.
- Do keep stars ink. Amber stars would need a new semantic token (for example `rating-star`); amber is in the palette but reserved for the warning tone. That is the product owner's decision.
- Don't round to half stars in text. The text is «۴٫۶», and the fill shows the exact fraction.
- Don't show a rating with fewer than 1 review as «۰».
