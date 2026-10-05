# MoneyField

A Toman amount input that formats as you type — Persian digits, live thousands separator «٬», suffix «تومان» — and spells the amount in words under it.

Use it for every `priceToman` and fee: listing price, product/SKU price, fee settings in `/admin/settings`. Never ask for Rial, never accept decimals. A fee left empty is «تعیین‌نشده» (not zero) and keeps that payment path closed. For read-only amounts use PriceDisplay.

## Anatomy

1. Field label.
2. `.hz-input-wrap--suffix` with `.hz-input.hz-num` (`inputmode="numeric"`) and suffix «تومان».
3. Hint: the amount in Persian words («چهارصد و پنجاه میلیون تومان»), or the rule for an empty value.
4. Error.

## CSS API

Composes existing classes only — no css-addition.

| Class | Use |
|---|---|
| `.hz-input-wrap.hz-input-wrap--suffix` + `.hz-input-wrap__suffix` | «تومان» at inline-end |
| `.hz-input.hz-num` | Tabular digits so the amount does not jitter while typing |
| `.hz-input--sm` | OpsShell settings tables only |
| `.hz-field__hint` | Amount in words (updated live) |

```html
<div class="hz-field">
  <label class="hz-field__label" for="price">قیمت<span class="hz-field__req" aria-hidden="true">*</span></label>
  <div class="hz-input-wrap hz-input-wrap--suffix">
    <input class="hz-input hz-num" id="price" type="text" inputmode="numeric" autocomplete="off"
           value="۴۵۰٬۰۰۰٬۰۰۰" aria-describedby="price-words">
    <span class="hz-input-wrap__suffix">تومان</span>
  </div>
  <div class="hz-field__hint" id="price-words">چهارصد و پنجاه میلیون تومان</div>
</div>
```

## Tokens

Same as TextField: `bg-surface`, `border-control`, focus `focus-ring` as a single 2px border (no outer ring), invalid `status-error-border`, disabled `bg-disabled`/`text-disabled`, suffix and hint `text-secondary`, `radius-md`, `control-lg` (48) / `control-md` (44, `--sm`).

## Variants & sizes

Default (48) · small (44, OpsShell tables) · required price · optional fee (empty = «تعیین‌نشده»). The preview's large value ۴۵۰٬۰۰۰٬۰۰۰ fits the 3-column grid at 270px; the suffix padding (64px) never overlaps digits.

## States

- **Typing** — any of «۱۲۵۰۰۰۰», «1250000», «١٢٥٠٠٠٠» becomes «۱٬۲۵۰٬۰۰۰»; non-digits are dropped; leading zeros removed; caret kept at the end. Words update live.
- **Empty** — optional fee: hint «خالی یعنی «تعیین‌نشده»؛ تا مبلغ وارد نشود، این مسیر پرداخت بسته می‌ماند.»; required price: error after submit.
- **Zero / error** — «قیمت باید بیشتر از صفر باشد. قیمت قابل مذاکره هم یک مبلغ پایه لازم دارد.»
- **Over the field's maximum** — «حداکثر قیمت … تومان است.» (limit per field, set by the caller).
- Hover / focus-visible / disabled with reason («این آگهی فروخته شده و قیمتش دیگر تغییر نمی‌کند.»).
- **Long value** — 13 digits max in the demo script; the control scrolls rather than wrapping.

## Mobile ↔ desktop

`inputmode="numeric"` opens the digit keypad on phones. Full column width on <768; in desktop forms a price field may share a row with «نحوه قیمت‌گذاری» (Radio). Height 48 everywhere; `--sm` only in OpsShell ≥1024.

## RTL & LTR

The control stays RTL: Persian digits with «٬» form one number run and read left-to-right inside it, aligned to the start (right); «تومان» sits at inline-end (left). In LTR the suffix moves to the right automatically. No `dir="ltr"` on money (it is not an identifier).

## Accessibility

Visible label; the words hint is in `aria-describedby` so the amount is read as words too (screen readers often read «٬»-grouped digits poorly). The hint is not a live region (it would speak on every key); errors appear on blur/submit. Do not use `type="number"` (no grouping, scroll-wheel changes, locale bugs).

## Data

Displayed: `toLocaleString('fa-IR')` (Persian digits, U+066C). Stored: integer Toman as bigint (`priceToman`, fee settings `*_toman`). On save: normalise digits to Latin, strip separators, parse as BigInt; empty → `null` («تعیین‌نشده»), never 0. Words are generated client-side from the integer (Persian number words with « و »).

## Code mapping

★ Proposed `MoneyField` in `src/ui/money-field.tsx`: `label`, `value: bigint | null`, `onChange(value: bigint | null)`, `required?`, `allowEmpty?` (fees: empty = unset), `min = 1n`, `max?`, `showWords = true`, `size: 'md' | 'sm'`, `disabled?`, `hint?`, `error?`. Wraps TextField (`suffix="تومان"`).

## Do / Don't

- Do format while typing and show the amount in words for anything over ۱٬۰۰۰٬۰۰۰.
- Do treat empty as «تعیین‌نشده» for fees and keep the payment closed.
- Don't accept or show Rial; don't add «ریال» conversions.
- Don't save ۰ to mean «not set» or «free».
- Don't put «تومان» inside the value.
