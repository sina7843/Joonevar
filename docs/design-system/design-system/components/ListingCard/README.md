# ListingCard

A marketplace listing tile — photo, title, breed · sex · age, price with «قابل مذاکره», city, and a neutral badge once it is reserved or sold.

Use in `/animals-market` results, «آگهی‌های مشابه» and the seller's «آگهی‌های من» grid. Not for shop products (ProductCard, P1) and not for a registered animal (`AnimalCard`).

## Anatomy

1. Image — first `media` item, 4:3, full-bleed at the top; missing → symbol empty state with «تصویر ثبت نشده».
2. Status badge (optional) — `--sm`, neutral, above the title: «رزروشده», «فروخته‌شده». Published listings show none.
3. Title — `animalName`, Bold 16/26.
4. Meta — «ژرمن شپرد، نر، ۳ ماهه» (`breedFa`، `sexFa`، `ageFa`).
5. Price — amount ExtraBold 17 + «تومان» + mode in caption; `null` → «تعیین‌نشده».
6. City — `map-pin` + city.

## CSS API

Bundle: `.hz-listing`, `.hz-listing__body`, `.hz-listing__title`, `.hz-listing__meta`, `.hz-price` (`__amount`, `__unit`, `__mode`, `--unset`), `.hz-media--4x3`, `.hz-badge--neutral --sm`.

```html
<a class="hz-listing" href="/animals-market/listing-55518">
  <div class="hz-media hz-media--4x3"><img src="…" alt="ژرمن شپرد — تمام‌قد"></div>
  <div class="hz-listing__body">
    <span class="hz-listing__title">توله ژرمن شپرد</span>
    <span class="hz-listing__meta">ژرمن شپرد، نر، ۳ ماهه</span>
    <div class="hz-price"><span class="hz-price__amount">۴۵٬۰۰۰٬۰۰۰</span><span class="hz-price__unit">تومان</span><span class="hz-price__mode">قابل مذاکره</span></div>
    <span class="hz-listing__meta hz-meta__item"><svg …map-pin…></svg>کرج</span>
  </div>
</a>
```
Wrap a badge in a `<span>` so it keeps its width in the flex column.

## Tokens

`bg-surface`, `border-default`, `bg-media-empty`, `text-primary`, `text-secondary`, `icon-default`, `status-neutral-bg/-text/-border`, `radius-xl`, `focus-ring`.

## Variants & sizes

- **Published** — no badge. **Reserved** `RESERVED` «رزروشده» / **Sold** `SOLD` «فروخته‌شده» — family *closed*, tone **neutral** (approved tone change: these were info in code).
- **Seller view only:** `EXPIRED` «منقضی» (warning), `PAUSED` «موقتاً متوقف» (warning), `HIDDEN` «پنهان» (neutral).
- **Price mode:** always `NEGOTIABLE` «قابل مذاکره» — every listing accepts offers (`EXACT` «قیمت مقطوع» was removed on 11 Mehr 1405). Price `null` → `.hz-price--unset` «تعیین‌نشده», mode still shown.

## States

- **Default** · **hover** (pointer): proposed `border-control` outline, as `Card --interactive` (not yet in bundle.css).
- **Focus-visible:** ring around the tile. **Disabled:** n/a — a sold listing stays openable.
- **Loading:** 4:3 skeleton + three lines. **Empty results:** `EmptyState` with the active filters.
- **Long text:** titles wrap to two lines; a large price «۴۵۰٬۰۰۰٬۰۰۰ تومان» never overflows: `.hz-price` wraps, so unit and mode drop under the amount in a narrow tile.

## Mobile ↔ desktop

<768: 2 columns (tile ≥ 160px wide) or 1 column under 360px. 768–1023: 3 columns. ≥1024: 3 columns beside the filter column, 4 without it.

## RTL & LTR

Text start-aligned; amount, unit and mode flow in reading order and wrap as a group. `map-pin` is never mirrored. Money is Persian digits with `٬` and always «تومان».

## Accessibility

- One link per tile. Accessible name: title, meta, price, city, status.
- A real photo needs its `altFa`; the empty state uses `alt=""` plus the visible «تصویر ثبت نشده».
- Sold/reserved is said in text, never by greying the image alone.

## Data

`marketplace.json → listings[]`: `animalName`, `breedFa`, `sexFa`, `ageFa`, `price.toman`/`displayFa`, `priceMode`/`priceModeFa`, `city`, `status`, `media[0]` (`altFa`). In the preview the «تعیین‌نشده» tile is a constructed edge (price set to `null`, per `edge-cases.json → money`); the sample photo stands in for one listing image.

## Code mapping

★ New — proposed `ListingCard` in `src/ui/card.tsx`: `title`, `breed`, `sex`, `age`, `priceToman: bigint | null`, `priceMode: 'NEGOTIABLE'`, `city`, `status`, `image?`, `href`. Price formatting via the shared `PriceDisplay` (manifest E, P1).

## Do / Don't

- Do show reserved and sold in neutral — they ended without error.
- Do keep «قابل مذاکره» next to the amount; don't replace the amount with it.
- Don't show «۰ تومان» or hide the price row when the price is missing.
- Don't overlay status on the photo; it must survive a missing image.
