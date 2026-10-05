# PaymentRow

One payment the user made or started — service, amount, status and its `HZP-` payment id — as a DataTable row from 768 up and a CardList item below.

Use on `/payments` and in the dashboard «پرداخت‌ها» block (latest three, card form). Not for the checkout summary (P8 pattern), not for the payment result page (PaymentResult, Commerce), and not for shop orders (sub-order cards).

## Anatomy

**Table row (≥768)** — columns: «خدمت و تاریخ» (service SemiBold + date 12/20 under it) · «شناسه پرداخت» (`<bdi>` Latin, no wrap) · «مبلغ» (end-aligned, «۴۰۰٬۰۰۰ تومان», no wrap) · «وضعیت» (StatusBadge `--sm`) · action (only for failed: «پرداخت دوباره», secondary sm).

**Card item (<768)** — row 1: service (title) + badge; row 2: amount (`Price`) + date (meta); row 3: `Identifier` «شناسه پرداخت:» + copy; row 4 (failed only): full-width «پرداخت دوباره ۳۰۰٬۰۰۰ تومان».

## CSS API

Composes `.hz-table-wrap`, `.hz-table`, `.hz-num`, `.hz-cardlist`, `.hz-cardlist__item/__row/__title/__meta`, `.hz-badge--sm`, `.hz-identifier`, `.hz-price`. New in `css-additions/PaymentRow.css`: `.hz-payment`, `__service`, `__date`, `__id`, `__amount`, `__action`.

```html
<tr>
  <td><span class="hz-payment"><span class="hz-payment__service">مجوز جفت‌گیری</span><span class="hz-payment__date">۲۷ شهریور ۱۴۰۵، ۲۰:۰۵</span></span></td>
  <td><bdi class="hz-id hz-payment__id" dir="ltr">HZP-TEQUAKE8YGA7CDQP</bdi></td>
  <td class="hz-num hz-payment__amount">۳۰۰٬۰۰۰ تومان</td>
  <td><span class="hz-badge hz-badge--sm hz-badge--error"><span class="hz-badge__dot"></span>ناموفق</span></td>
  <td class="hz-payment__action"><a class="hz-btn hz-btn--secondary hz-btn--sm" href="…">پرداخت دوباره</a></td>
</tr>
```

## Tokens

`bg-surface`, `bg-subtle` (table head, row hover), `border-default`, `border-subtle`, `text-primary`, `text-secondary`, `status-success-*`, `status-info-*`, `status-error-*`, `border-control`, `radius-xl`, `radius-lg`, `focus-ring`.

## Variants & sizes

| Status (key) | Label | Tone | Action |
|---|---|---|---|
| `PAID` | پرداخت‌شده | success | — |
| `PENDING` | در جریان | info | — (server confirms with the gateway) |
| `FAILED` | ناموفق | error | «پرداخت دوباره» starts a new payment for the same service |
| `REFUNDED` | بازپرداخت‌شده | neutral | — |
| `CANCELLED` | لغوشده | neutral | — |

Date = `paidAt` when paid, otherwise `createdAt`. Rows newest first. Table density follows the shell (PublicShell 44px rows).

## States

- **Default** · **hover** (pointer, table): row `bg-subtle`.
- **Focus-visible:** ring on «پرداخت دوباره» and the copy button (rows themselves are not links).
- **Loading:** skeleton rows (title + pill + one line).
- **Empty:** `EmptyState` compact «هنوز پرداختی ندارید» — `receipt` icon, one sentence on what appears here.
- **Error:** inline `Alert` «فهرست پرداخت‌ها بار نشد.» + «تلاش دوباره».
- **Disabled:** never; a fee that is «تعیین‌نشده» never produces a payment row.
- **Long Persian text:** «عضویت انجمن (مادام‌العمر)» and «صدور برگه ثبتی — ۲ حیوان» wrap inside the service cell; the id and amount never wrap. The 20-character id fits one line at 360 (card form, verified at 328px content width).

## Mobile ↔ desktop

<768 CardList (8px gap, 14px padding), retry button full width (`control-md` ≥ 44px). 768–1023 table with date merged into the service cell (five columns, no horizontal scroll at 768). ≥1024 same table; a separate «تاریخ» column is allowed when the content column is ≥ 960px.

## RTL & LTR

Service at the start, action at the end. Amount column `text-align: end`. Ids Latin in `<bdi dir="ltr">`; money and dates Persian digits; money always «تومان».

## Accessibility

- Real `<table>` with a visually hidden `<caption>` «پرداخت‌های شما، جدیدترین در بالا» and `scope="col"` headers; the action column has a hidden header «اقدام».
- Status is badge text + dot. The retry button names the amount in the card form; in the table add `aria-label="پرداخت دوباره مجوز جفت‌گیری"`.
- Copy button `aria-label="کپی شناسه پرداخت"`, confirmation in a `role="status"` region.

## Data

`requests-and-payments.json → payments[]`: `reference` (`HZP-` + 16), `serviceFa`, `service`, `amount.toman`/`displayFa`, `status`, `paidAt` or `createdAt`. Labels and tones from the status dictionary.

## Code mapping

★ New — proposed `PaymentRow` in `src/billing/payment-row.tsx`: `reference`, `serviceFa`, `amountToman: bigint`, `status: 'PAID' | 'PENDING' | 'FAILED' | 'REFUNDED' | 'CANCELLED'`, `at: Date`, `retryHref?`, `variant: 'row' | 'card'` (chosen by the `DataTable ↔ CardList` switch, not by the caller).

## Do / Don't

- Do show the `HZP-` id on every row; support asks for it.
- Do keep «پرداخت دوباره» only on failed payments.
- Don't treat the gateway return page as proof of payment; the row shows the server status.
- **Decided (11 Mehr 1405, status dictionary *Scoped sets*):** gateway `PENDING` stays «در جریان» (info); a payment waiting for the user is `PENDING_PAYMENT` «در انتظار پرداخت» (warning).
