# PriceDisplay

One way to show money: Persian digits with «٬», always «تومان», with «قابل مذاکره» on listings, «از» for variants, a struck-through old price with the saving, and «تعیین‌نشده» when there is no amount, never ۰.

Use it everywhere an amount appears as data: listing and product cards, detail pages, cart and order summaries, fee tables, payment rows, offers in conversations. Inside a button label, write the amount in the verb («پرداخت ۴۰۰٬۰۰۰ تومان») with the same formatter, not the component. Entering an amount is MoneyField.

## Anatomy

1. **Prefix** (optional): `__from` «از» (variants) or `__prefix` («پیشنهاد خریدار:»).
2. **Amount** `__amount`: Persian digits, «٬» grouping, ExtraBold, tabular figures.
3. **Unit** `__unit`: «تومان», always present when there is an amount.
4. **Mode** `__mode` (listings): always «قابل مذاکره» — every listing accepts offers; there is no fixed-price mode (product-owner decision, 11 Mehr 1405).
5. **Old price** `__old` (`<del>`) + **saving** `__save` pill («۲۰۰٬۰۰۰ تومان تخفیف»).
6. **Note** `__note`: one line under the amount, for «تعیین‌نشده» and errors.

## CSS API

Bundle: `.hz-price`, `__amount`, `__unit`, `__mode`, `--unset`. ProductCard.css: `__from`, `--muted`. Additions (`tools/css-additions/PriceDisplay.css`): `--sm`, `--lg`, `--stack`, `--end`, `--discount`, `__prefix`, `__old`, `__save`, `__note`, `__row`.

```html
<div class="hz-price"><span class="hz-price__amount">۳۸٬۰۰۰٬۰۰۰</span><span class="hz-price__unit">تومان</span><span class="hz-price__mode">قابل مذاکره</span></div>
<div class="hz-price hz-price--stack">
  <del class="hz-price__old"><span class="hz-visually-hidden">قیمت قبلی: </span>۴٬۱۲۰٬۰۰۰ تومان</del>
  <span class="hz-price__row"><span class="hz-price__amount">۳٬۹۲۰٬۰۰۰</span><span class="hz-price__unit">تومان</span><span class="hz-price__save">۲۰۰٬۰۰۰ تومان تخفیف</span></span>
</div>
<div class="hz-price hz-price--unset"><span class="hz-price__amount">تعیین‌نشده</span><span class="hz-price__note">پرداخت این خدمت هنوز باز نیست.</span></div>
```

## Tokens

`text-primary` (amount, unit) · `text-secondary` (mode, prefix, old price, note, unset, muted) · `text-brand` + `bg-brand-subtle` (saving pill, discount line) · `radius-full` (pill). Never a status colour for a price.

## Variants & sizes

| Size | Amount | Where |
|---|---|---|
| `--sm` | 14/22 Bold | table cells, cart lines, summary rows |
| default | 17/28 ExtraBold | listing / product / service cards |
| `--lg` | 24/38 → 28/44 at ≥1024 | listing and product detail, payment summary |

Modes: **negotiable** («قابل مذاکره», the amount is the asking price) · **from** («از» + the lowest SKU price) · **discounted** (`--stack`: old struck above, new + saving) · **unset** («تعیین‌نشده») · **ended** (`--muted` + StatusBadge «فروخته‌شده» / «رزروشده») · **offer** (prefix «پیشنهاد خریدار:») · **deduction line** (`--discount`, in a summary row whose label says «تخفیف», with no minus sign).

## States

- **default**: as above.
- **hover / focus**: none. The price is text, and the card or row around it is the target.
- **disabled**: n/a. An unavailable SKU is shown by StockBadge, not by greying the price.
- **loading**: skeleton bars (amount 112×18 + unit 36×12) in the same line box, so nothing jumps.
- **error**: amount «—» + note «مبلغ بارگذاری نشد. صفحه را دوباره بار کنید.». Never ۰ and never the last cached price.
- **empty / unset**: «تعیین‌نشده» in `text-secondary`. Any payment action tied to it stays closed (26 fees ship `null`).
- **long value**: «۴۵۰٬۰۰۰٬۰۰۰ تومان» fits a 2-column mobile card. Amount and unit never break inside (`nowrap`), and the mode wraps to the next line instead.

## Mobile ↔ desktop

The size is chosen by context. Only `--lg` steps up at ≥1024. In mobile cards the mode drops under the amount when the line is full (flex-wrap). In tables use `--sm --end` inside `td.hz-num` so amounts line up on the end edge.

## RTL & LTR

The amount comes first, then «تومان» (reading order). The `--end` column aligns to the end edge. Persian digits are the same code points in LTR UIs. A future English UI swaps the formatter (Latin digits, "Toman"), not the markup. No minus sign is used for deductions, because the row label carries the meaning and that avoids bidi flips.

## Accessibility

- The old price is a `<del>` with a hidden «قیمت قبلی: » prefix, because screen readers don't announce strikethrough.
- «تعیین‌نشده» is real text, not a dash, so it reads correctly.
- A saving pill is text. Colour is not the signal.
- Don't put prices in `aria-label`s. They are visible text.

## Data

`priceToman` (bigint) → `toLocaleString('fa-IR')` + « تومان»; `null` → «تعیین‌نشده». Listings: `price`, `priceMode` (`NEGOTIABLE` only; `EXACT` is retired). Products: `min(offers[].skus[].price)` for «از». Cart: `subtotal`, `shipping`, `discount`, `total` (preview: ۴٬۱۲۰٬۰۰۰ + ۸۵٬۰۰۰ − ۲۰۰٬۰۰۰ = ۴٬۰۰۵٬۰۰۰). Fees: `fees.configured[].toman`. Offers: `inquiry.offer.amount`.

## Code mapping

★ New `src/ui/price.tsx`: `Price({ toman: bigint | null, mode?: 'NEGOTIABLE', from?: boolean, prefix?: string, oldToman?: bigint, size?: 'sm' | 'md' | 'lg', align?: 'start' | 'end', muted?: boolean, note?: string })` and `formatToman(toman)` for button labels and plain text. ListingCard, ProductCard, ServiceCard (`.hz-service__price`), OrderSummary and fee tables call it. The `priceToman` field name is kept.

## Do / Don't

- Do write «تعیین‌نشده» for every missing amount and keep that payment closed.
- Do show the saving as an amount in تومان. Percentages are optional and never shown alone.
- Don't show Rial, Latin digits or a «0» anywhere.
- Don't colour prices green or red. Only a saving uses `text-brand`.
