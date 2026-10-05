# ProductCard

A shop product tile — square image, brand, name, rating, the lowest variant price («از ۳۸۰٬۰۰۰ تومان») and an out-of-stock badge when nothing can be bought.

Use in `/shop` results, category pages, «محصولات مشابه» and the seller's catalogue grid. Not for animal listings (`ListingCard`) and not inside the cart (CartRow).

## Anatomy

1. Image — first `media` item, **1:1**, full-bleed top; missing → RecordImage empty state «تصویر ثبت نشده».
2. Brand — `brandFa`, 12/20 SemiBold `text-secondary`.
3. Name — `nameFa`, Bold 15/24, **2 lines** reserved (`min-height`) so prices line up across a row.
4. Rating — `star` (fill, `icon-strong`) + average with one decimal «۴٫۶» + «(۹۳ نظر)».
5. Price — «از» + lowest SKU price + «تومان»; a single SKU drops «از». Sits on the bottom edge of the body.
6. Stock — `StockBadge --sm` only when the product cannot be bought («ناموجود») or is low; nothing when in stock.

## CSS API

The `ListingCard` tile: `.hz-listing` + `.hz-listing__body` + `.hz-media--1x1` + `.hz-price`. New in `css-additions/ProductCard.css`: `.hz-product` (tile modifier), `.hz-product__brand`, `.hz-product__name`, `.hz-price__from`, `.hz-price--muted`, `.hz-rating`, `.hz-rating__count`, `.hz-rating--none`. Stock: `.hz-stock.hz-stock--sm` (StockBadge).

```html
<a class="hz-listing hz-product" href="/shop/p-439142">
  <div class="hz-media hz-media--1x1">…</div>
  <div class="hz-listing__body">
    <span class="hz-product__brand">بایت‌لند</span>
    <span class="hz-product__name">تشویقی تمرینی مرغ</span>
    <span class="hz-rating" role="img" aria-label="امتیاز ۴٫۸ از ۵، ۹۷ نظر"><svg …star-fill…></svg>۴٫۸<span class="hz-rating__count">(۹۷ نظر)</span></span>
    <div class="hz-price"><span class="hz-price__from">از</span><span class="hz-price__amount">۳۸۰٬۰۰۰</span><span class="hz-price__unit">تومان</span></div>
  </div>
</a>
```

## Tokens

`bg-surface`, `border-default`, `bg-media-empty`, `text-primary`, `text-secondary`, `icon-strong` (star), `status-neutral-*` (out-of-stock badge), `radius-xl`, `focus-ring`.

## Variants & sizes

- **Several variants** — «از» + minimum `price.toman` over SKUs. **One variant** — price without «از».
- **In stock** — no badge. **Low** — `hz-stock--low` «فقط ۲ عدد موجود» when total available ≤ the low-stock setting. **Out of stock** — every SKU has `stockOnHand − stockReserved ≤ 0`: `hz-stock--out` «ناموجود» + price in `text-secondary` (`.hz-price--muted`); the card stays a link.
- **No reviews** — `.hz-rating--none` «بدون نظر» (never «۰٫۰»).
- One size; the grid sets the width (≥ 156px).

## States

- **Default** · **hover** (pointer): `border-control` outline (`a.hz-product:hover`), no lift.
- **Focus-visible:** ring around the tile.
- **Loading:** square skeleton + three lines (preview, mobile frame).
- **Empty results:** `EmptyState` with active filters.
- **Error (stock unknown):** render no stock badge; the product page re-checks.
- **Long Persian text:** «غذای خشک سگ بالغ نژاد بزرگ» takes the two reserved lines, then `…`; in a 156px tile a large price wraps «تومان» under the amount.

## Mobile ↔ desktop

<768 two columns (tile ≈ 156–170px). 768–1023 three columns. ≥1024 four beside the filter column, five without. No add-to-cart on the card: a product has variants, so the choice happens on the product page (`VariantPicker`).

## RTL & LTR

Start-aligned; «از» precedes the amount in reading order. The rating uses the Persian decimal separator «٫» and Persian digits. The star is never mirrored. SKU codes never appear on the card.

## Accessibility

- One link per tile; accessible name reads brand, name, rating «۴٫۸ (۹۷ نظر)», price, stock.
- Rating is the compact form of `Rating`: `role="img"` + `aria-label="امتیاز ۴٫۸ از ۵، ۹۷ نظر"`; the star is `aria-hidden`.
- Out of stock is said in text («ناموجود»), not by greying the image.

## Data

`shop.json → products[]`: `nameFa`, `brandFa`, `categoryFa`, `ratingAvg`, `ratingCount`, `media[0]` (`altFa`), `offers[].skus[] {price.toman, stockOnHand, stockReserved}`. Lowest price and availability are derived across all offers and SKUs. Out-of-stock example: «شامپو ضدحساسیت» (single SKU, `stockOnHand: 0`).

## Code mapping

★ New — proposed `ProductCard` in `src/ui/card.tsx`: `name`, `brand`, `minPriceToman: bigint`, `variantCount`, `ratingAvg: number | null`, `ratingCount`, `availability: 'IN' | 'LOW' | 'OUT'`, `availableCount?`, `image?`, `href`. Stock badge via `StockBadge`, rating via `Rating` (compact), price via `PriceDisplay` — `.hz-rating`, `.hz-price__from` and `.hz-price--muted` are defined here and reused by those components.

## Do / Don't

- Do reserve two lines for the name so a row of cards stays aligned.
- Do derive «از» from real SKU prices; never show a price range «… تا …» on the card.
- Don't show the seller on the card; it belongs to the product page offer box (`SellerCard`).
- **Decided (11 Mehr 1405):** rating stars use `icon-strong` (ink) — no new colour; the low-stock threshold is the setting `shop.lowStockThreshold`, default 5.
