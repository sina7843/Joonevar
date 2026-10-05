# StatTile

A headline number on an operations home, such as a count or an amount in تومان. It can carry a change against a named period, or a warning when the number needs someone to act.

Use a row of StatTiles on ops homes that report volume (`/market` «مرور بازار», `/admin` «مرور», `/genetics` «داشبورد»). For «what is waiting for me and since when» use **QueueTile**. For a number inside a record use KeyValueList. Don't invent a trend you can't compute: a tile without a change line is complete.

## Anatomy

1. **Label** `__label`: what is counted, with its period when it has one («فروش ناخالص مهر»).
2. **Value** `__value`: a count or amount, Bold 28 → 32 at ≥1024, proportional figures. Long amounts use `__value--long` (22 → 24), and «تومان» goes in `__unit`.
3. One supporting line, optional:
   - **Change** `__delta`: `arrow-up` / `arrow-down` / `minus` + a signed sentence against a named period («۲٬۸۵۵٬۰۰۰ تومان بیشتر از شهریور»)
   - **Breakdown** `__sub` («۱ رزروشده، ۱ فروخته‌شده»)
   - **Flag** `__flag` (alert only): `warning` + who must act («۱ درخواست مرجوعی منتظر شماست»)

## CSS API

`tools/css-additions/StatTile.css`: `.hz-stat-tile`, `--alert`, `__label`, `__value`, `__value--long`, `__value--muted`, `__unit`, `__delta`, `__sub`, `__flag`. Row: QueueTile's `.hz-queue-tiles` (2 columns <768, 4 from 768). Link hover: `.hz-card--interactive`.

```html
<div class="hz-queue-tiles">
  <a class="hz-stat-tile hz-card--interactive" href="/market/orders">
    <span class="hz-stat-tile__label">فروش ناخالص مهر</span>
    <span class="hz-stat-tile__value hz-stat-tile__value--long">۴٬۰۰۵٬۰۰۰<span class="hz-stat-tile__unit">تومان</span></span>
    <span class="hz-stat-tile__delta">…arrow-up<span><b>۲٬۸۵۵٬۰۰۰ تومان</b> بیشتر از شهریور</span></span>
  </a>
  <a class="hz-stat-tile hz-stat-tile--alert hz-card--interactive" href="/market/returns">… <span class="hz-stat-tile__flag">…warning<span>۱ درخواست مرجوعی منتظر شماست</span></span></a>
</div>
```

## Tokens

`bg-surface` · `border-default` · `status-warning-border` (alert frame) · `status-warning-text` (flag) · `text-primary` (value, delta amount) · `text-secondary` (label, delta, sub, muted value) · `icon-default` (delta arrow) · `border-control` (hover, via `.hz-card--interactive`) · `focus-ring` · `radius-xl`.

## Variants & sizes

- **Count**: «آگهی‌های منتشرشده ۳».
- **Amount** (`__value--long` + `__unit`): «۴٬۰۰۵٬۰۰۰ تومان». It wraps the unit under the number when narrow.
- **With change**: the delta line. The direction is an icon plus words («بیشتر», «کمتر», «بدون تغییر»), and the period is always named.
- **With breakdown**: `__sub` instead of a change.
- **Alert** (`--alert`): only when the number means someone must act now (returns, failed payments). Warning border + flag text. Never for a "bad" trend alone.
- One size. Four per row, wrapping to a second row (never a carousel). Mixed with QueueTiles only in separate rows.

## States

- **default**: as above.
- **hover** (pointer): lift −2px + `border-control` when the tile links to its list.
- **focus-visible**: a ring around the whole tile (it is one link).
- **loading**: three skeleton bars in the same frame, `aria-busy="true"`.
- **error**: value «—» (`__value--muted`) + «بارگذاری نشد. صفحه را دوباره بار کنید.». Never ۰.
- **unset**: «تعیین‌نشده» (`__value--muted`) + why («قاعده کارمزد هنوز تعریف نشده است.»). This happens when the metric depends on an unset setting.
- **empty**: ۰ is a real value here (no orders this month). Show «۰» with no change line.
- **long Persian text**: the label wraps to two lines («اعضای انجمن سگ‌های اصیل ایران»). Value and unit never truncate.

## Mobile ↔ desktop

- **<768**: 2 × 2 grid, 12px gap. Each tile is one touch target, well over 44px.
- **768–1023**: 4 in a row (collapsed OpsShell sidebar).
- **≥1024**: 4 in a row under the section header (`.hz-section-header--sm`, «مرور بازار» + «تا ۱۰ مهر ۱۴۰۵»). The value steps up to 32.

## RTL & LTR

Label, value and lines align to the start. `arrow-up` / `arrow-down` / `minus` are vertical or neutral and never mirrored. Amounts use Persian digits and «٬».

## Accessibility

- A linked tile is one `<a>`, whose name is its text in reading order («فروش ناخالص مهر ۴٬۰۰۵٬۰۰۰ تومان ۲٬۸۵۵٬۰۰۰ تومان بیشتر از شهریور»).
- The delta arrow is `aria-hidden`. Direction lives in the words, so colour and arrow are never the only signal.
- Alert adds text (the flag), never only a border colour.

## Data

Values are server aggregates per environment and period (preview from samples: published listings ۳ of ۶; shop orders by `placedAt` month, Mehr ۱ vs Shahrivar ۱; Mehr gross ۴٬۰۰۵٬۰۰۰ vs Shahrivar ۱٬۱۵۰٬۰۰۰ → +۲٬۸۵۵٬۰۰۰; return requests ۱ from `subOrders[].status = RETURN_REQUESTED`; payments ۲ paid / ۱ failed of ۴; community `membersCount` ۱۲۰). The period is the Jalali month or a rolling 7 days, named in the label or delta. Alert thresholds come from settings, never hard-coded.

## Code mapping

★ New `src/ops/stat-tile.tsx`: `StatTile({ label, value: number | bigint | null, unit?: 'toman', href?, change?: { amount: number | bigint; direction: 'up' | 'down' | 'flat'; period: string }, sub?, alert?: string, loading?, error? })`. It shares the row with `QueueTiles`. Formatting uses the PriceDisplay formatter (`formatToman`) for amounts.

## Do / Don't

- Do name the comparison period every time («نسبت به شهریور»).
- Do keep trends neutral (ink and secondary text). Only "someone must act" is warning.
- Don't colour a rising number green or a falling one red. Up is not always good here.
- Don't add sparklines until there is a time series behind the tile. A line made from two points is decoration.
