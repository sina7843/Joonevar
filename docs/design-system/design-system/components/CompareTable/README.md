# CompareTable

Two to four shop products side by side on `/shop/compare` — price, variants, rating, brand, category, condition, seller, shipping and stock — as a table on desktop and as two swipeable columns on mobile, never forcing the page to scroll sideways.

Use it only for shop products (same or related category). Not for animal listings (no compare in the marketplace) and not as a generic data table — operational tables use `DataTable`, which never scrolls horizontally.

## Anatomy

1. Bar: title «مقایسه ۲ کالا» · `Checkbox` «فقط تفاوت‌ها» · ghost «پاک کردن همه».
2. Mobile nav (<768 / `--swipe`): «ستون ۱ و ۲ از ۳» (live) + previous / next outline icon buttons.
3. Head row: per product — 64px thumbnail, name (link), brand, remove `x` («حذف … از مقایسه»); an empty slot «افزودن کالا — تا ۴ کالا» while fewer than 4.
4. Attribute rows: label (row header) + one cell per product. Rows whose values are all equal carry `--same`.
5. Last row: «انتخاب وزن و خرید» secondary buttons (the product page picks the variant; no primary button on this page).

## CSS API

New in `css-additions/CompareTable.css`: `.hz-compare` (`--swipe`, `--diff`; custom property `--hz-compare-cols` = product columns incl. the empty slot), `__bar`, `__title`, `__tools`, `__nav`, `__nav-btns`, `__table`, `__scroll`, `__row` (`--head`, `--same`), `__label`, `__cell` (`--muted`), `__product`, `__name`, `__brand`, `__remove`, `__add`, `__rating`. Reuses `.hz-check`, `.hz-btn`, `.hz-icon-btn--outline`, `.hz-media--thumb-lg`, `.hz-stock`, `.hz-state--compact`.

```html
<div class="hz-compare" style="--hz-compare-cols: 3">
  <div class="hz-compare__bar">…</div>
  <div class="hz-compare__nav">…</div>
  <div class="hz-compare__table"><div class="hz-compare__scroll" role="table" aria-labelledby="cmp-t">
    <div class="hz-compare__row hz-compare__row--head" role="row">
      <div class="hz-compare__label" role="columnheader"><span class="hz-visually-hidden">ویژگی</span></div>
      <div class="hz-compare__cell" role="columnheader"><div class="hz-compare__product">…</div></div> …
    </div>
    <div class="hz-compare__row" role="row">
      <div class="hz-compare__label" role="rowheader"><span>قیمت</span></div>
      <div class="hz-compare__cell" role="cell">از <b>۲٬۸۵۰٬۰۰۰</b> تومان</div> …
    </div>
  </div></div>
</div>
```

## Tokens

`bg-surface`, `bg-subtle` (label column ≥768), `border-default`, `border-subtle`, `border-control` (empty slot), `text-primary`, `text-secondary`, `text-brand` (rating star, links), `icon-default`, `radius-xl`, `radius-lg`, `focus-ring`.

## Variants & sizes

- **Table** (≥768): 168px label column + equal product columns; nothing scrolls sideways.
- **Swipe** (<768, or `--swipe` in a narrow container): each column is exactly half the component width (container query units), so two products are always visible; the body scrolls horizontally *inside* its rounded box with scroll-snap, and row labels sit above the cells and stay pinned at the start while swiping.
- **Differences only** (`--diff`): hides `--same` rows (brand, category, condition in the sample). The server (or the page) marks `--same`.
- 2, 3 or 4 products; the empty slot is shown until there are 4.

## States

- **Default** · **hover** (pointer): product names underline; icon buttons get the hover fill.
- **Focus-visible**: rings on remove, name links, buttons; tab order goes column by column in the head row, then row by row. Focus inside the swipe body scrolls the column into view (native).
- **Loading**: head row with thumbnail skeletons and two text skeleton lines per cell.
- **Empty** (< 2 products): `EmptyState` compact «برای مقایسه دست‌کم دو کالا لازم است» naming the product already added + «رفتن به فروشگاه».
- **Missing value**: «—»; an unset price «تعیین‌نشده» (`UnsetValue`), never ۰.
- **Unavailable**: a fully out-of-stock product stays in the table with `StockBadge` «ناموجود»; one out-of-stock variant is a caption («۱۵ کیلوگرم ناموجود»).
- **Long Persian text**: names and seller names wrap within their column (`overflow-wrap: anywhere`); columns never widen.

## Mobile ↔ desktop

<768: swipe form; the nav buttons move one column at a time and say «ستون ۲ و ۳ از ۳»; a fourth product adds one more swipe step. 768–1023 and ≥1024: table form, full width of the content column (SiteShell). Never a page-level horizontal scroll; the only horizontal scroller is the table body on mobile, contained by its own border.

## RTL & LTR

Columns run from the inline start (first product on the right in RTL). Swipe «next» moves toward the inline end: `caret-right` + `hz-icon--mirror` (points ←), «previous» `caret-left` + mirror (points →). Sticky labels use `inset-inline-start`. The rating uses the Persian decimal separator «۴٫۶».

## Accessibility

- ARIA table roles (`table`, `row`, `columnheader`, `rowheader`, `cell`) on a CSS grid so both layouts keep one reading order.
- Remove and buy buttons carry the product name in their accessible name.
- The swipe position text is `aria-live="polite"`; the nav buttons are disabled at the ends.
- «فقط تفاوت‌ها» is a real checkbox; hidden rows are `display: none` (removed from the accessibility tree).

## Data

`shop.json → products[]`: `nameFa`, `brandFa`, `categoryFa`, `offers[].sellerFa` / `conditionFa`, `offers[].skus[]` (`labelFa`, `price`, `stockOnHand`, `stockReserved` → price range, variant list, `StockBadge`), `ratingAvg`, `ratingCount`; `sellers[]` (`city`, `shippingFee`, `freeShippingThreshold`). The compare list itself (product slugs) is per buyer session; proposed max 4.

## Code mapping

★ New — proposed `CompareTable` in `src/shop/compare-table.tsx`: `products: CompareProduct[]` (2–4), `rows: { key, label, values: ReactNode[], same: boolean }[]`, `onRemove(slug)`, `onClear()`, `diffOnly`, `onDiffOnlyChange`, `maxProducts = 4`. The page builds rows; the component only lays them out.

## Do / Don't

- Do keep two columns visible on mobile so a pair is always comparable.
- Do mark equal rows and offer «فقط تفاوت‌ها».
- Don't let the page scroll horizontally or shrink columns below half width.
- Don't put a primary button in every column — variant choice happens on the product page.
