# StockBadge

A small pill that says whether one product variant (SKU) can be bought now, derived from `stockOnHand − stockReserved`.

Use it on the product page next to the selected variant, inside `VariantPicker`, on shop product cards (small size), in `CartRow` when stock changed after the item was added, and — with numbers — in the seller catalogue. It is **not** a `StatusBadge`: availability is not a workflow status, so it carries an icon instead of the dot. The only label it borrows from the status dictionary is «رزروشده» (`RESERVED`, closed → neutral).

## Anatomy

1. Pill (`radius-full`, 1px outline), 24px (default) or 20px (`--sm`).
2. Leading icon 16px (14px in `--sm`): `check` · `package` · `x` · `clock` · `warning`.
3. Label, 12/20 weight 600.
4. Optional note under it (`.hz-stock-note`) — one sentence, only for «رزروشده».
5. Seller/ops only: `.hz-stock-detail` breakdown «موجودی ۶، رزرو ۰، قابل فروش ۶».

## CSS API

New in `css-additions/StockBadge.css`: `.hz-stock`, `--sm`, `--in`, `--low`, `--out`, `--reserved`, `--action`; `.hz-stock-detail`, `.hz-stock-note`. Loading uses the bundle's `.hz-skeleton--pill`.

```html
<span class="hz-stock hz-stock--low"><svg class="hz-icon hz-icon--xs" …package…></svg>فقط ۱ عدد موجود</span>
<span class="hz-stock-detail"><span>موجودی <b>۲</b></span><span>رزرو <b>۱</b></span><span>قابل فروش <b>۱</b></span></span>
```

## Tokens

`status-success-bg/-text/-border`, `status-neutral-*`, `status-warning-*`, `status-error-*`, `text-primary`, `text-secondary`, `radius-full`.

## Variants & sizes

`available = stockOnHand − stockReserved`. Tones follow the system rule «the tone says who must act».

| Variant | Rule | Label | Tone | Viewer |
|---|---|---|---|---|
| `--in` | available > low threshold | موجود | success | buyer + seller |
| `--low` | 1 ≤ available ≤ threshold | فقط ۱ عدد موجود | success | buyer + seller |
| `--out` | onHand = 0 and reserved = 0 | ناموجود | neutral | buyer |
| `--reserved` | onHand > 0, available = 0 | رزروشده + note | neutral | buyer |
| `--action` | available = 0 | ناموجود | warning (seller must restock) | seller |

- Low threshold is **a setting, not a constant** — default «۵ یا کمتر» (approved 11 Mehr 1405).
- Low stock stays success: it is a fact, not an alarm. No countdowns, no red.
- Sizes: 24 on the product page and VariantPicker summary; 20 (`--sm`) in cards, cart rows and tables.

## States

- **Default** — as above. Not interactive: no hover, no focus.
- **Loading** — `.hz-skeleton--pill` in its place while stock is fetched; never a guessed «موجود».
- **Error / unknown** (stock service failed) — render nothing and keep «افزودن به سبد» enabled; the cart re-checks on the server.
- **Long Persian text** — the label never wraps (`white-space: nowrap`, `flex-shrink: 0`); the product name beside it wraps instead (preview: «غذای خشک سگ بالغ نژاد بزرگ — ۱۵ کیلوگرم» in 300px).

## Mobile ↔ desktop

Same pill at every width. <768 product cards use `--sm`; the product page uses the default size under the price. In the seller catalogue table (≥768) the breakdown sits in its own column; in the mobile card list it is one meta line under the variant name.

## RTL & LTR

Icon at the inline start (right in RTL); none of the icons are mirrored. Counts are Persian digits. SKU codes in the seller view stay Latin in `<bdi class="hz-id" dir="ltr">`.

## Accessibility

- Text carries the meaning; colour and icon are decoration (`aria-hidden` on the svg).
- On the product page, place the badge inside the `VariantPicker` live region so a change of variant announces the new availability.
- `--reserved` always shows its note in text, not as a tooltip.

## Data

`shop.json → products[].offers[].skus[]`: `stockOnHand`, `stockReserved`, `labelFa`, `sku`. Sample: تشک ارتوپدی سگ L (۲ − ۱ = ۱ → low), XL (۲ − ۲ → reserved; the pack's ۰ − ۲ was a data mistake, corrected 11 Mehr 1405), شامپو ضدحساسیت (۰ − ۰ → out); `edge-cases.json → shop` «ناموجود». The fully reserved افسار (۵ − ۵) is a constructed example — no sample SKU has it.

## Code mapping

★ New — proposed `StockBadge` in `src/ui/stock-badge.tsx`: `onHand: number`, `reserved: number`, `lowThreshold?: number` (from settings), `view: 'buyer' | 'seller'`, `size?: 'md' | 'sm'`, `showDetail?: boolean` (seller breakdown). Derives the variant; screens never pass a label.

## Do / Don't

- Do compute availability as onHand − reserved; never show raw `stockOnHand` to buyers.
- Do keep «ناموجود» variants visible (disabled) in `VariantPicker` — don't hide them.
- Don't use urgency copy («عجله کنید», countdowns) or red for low stock.
- Don't put a StockBadge on an animal listing — that is `StatusBadge` `RESERVED`/`SOLD`.


**Dictionary keys (approved 11 Mehr 1405):** `--in` = `IN_STOCK`, `--low` = `LOW_STOCK`, `--out` / `--action` = `OUT_OF_STOCK` (the seller view uses the warning look because the seller must restock), `--reserved` = `RESERVED`. Reserved stock can never exceed stock on hand: the server refuses the reservation, so there is no oversell state.
