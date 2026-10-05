# TextField

A single-line text input inside a Field, with LTR, leading-icon, suffix and trailing-action variants.

Use it for names, numbers, codes, prices and any short free text. Use TextAreaField (P1) for more than one line, MobileField for mobile numbers, JalaliDateField for dates and SearchField for search. Do not use it for a choice among known values (SelectField / Radio).

## Anatomy

Field label → `.hz-input` (48px, `radius-md`, 1px `border-control`) → optional leading icon (`.hz-input-wrap__icon`, 20px, `icon-default`), suffix unit (`.hz-input-wrap__suffix`, 13px `text-secondary`) or trailing action (`.hz-input-wrap__action`) → hint / error.

## CSS API

| Class | Use |
|---|---|
| `.hz-input` | Base control |
| `.hz-input--ltr` | Numbers, codes, identifiers: `direction: ltr`, aligned to end |
| `.hz-input--sm` | 44px, **OpsShell dense forms and table filters only** |
| `.hz-input-wrap` + `--icon` | Leading icon at start |
| `.hz-input-wrap` + `--suffix` | Unit at end: «تومان», «کیلوگرم» |
| `.hz-input-wrap` + `--action` | Trailing 40px icon button (copy, clear, calendar) — css-addition `TextField.css` |

```html
<div class="hz-input-wrap hz-input-wrap--suffix">
  <input class="hz-input" id="price" inputmode="numeric" value="۴۵٬۰۰۰٬۰۰۰">
  <span class="hz-input-wrap__suffix">تومان</span>
</div>
<input class="hz-input hz-input--ltr" id="chip" inputmode="numeric" spellcheck="false" value="364416562459223">
```

## Tokens

`bg-surface` · `border-control` (3.43:1) · hover `text-secondary` border · focus `focus-ring` as a single 2px border (no outer ring) · invalid `status-error-border` · disabled `bg-disabled`, `border-disabled`, `text-disabled` · `icon-default` · `radius-md` · `control-lg` (48) / `control-md` (44).

## Variants & sizes

Default · LTR (`ltr`) · with icon (e.g. `map-pin` for «شهر») · with suffix («تومان», «کیلوگرم») · with trailing action (copy «کد پیگیری نمونه» `SM-7KD2QWX9NM`) · small (OpsShell). Price entry with a live thousands separator is the Amount field (P1); until then a TextField + «تومان» suffix.

## States

Default · hover (pointer only: border darkens to `text-secondary`) · focus-visible (the border turns `focus-ring` orange at 2px — one stroke, same corners, no outer ring) · filled · disabled (read-only facts such as the login mobile, with the reason in the hint) · read-only (`readonly`, normal colours, used with a copy action) · error · **long value**: the control scrolls horizontally, never truncates the stored value («مرکز جامع درمانی، جراحی و تصویربرداری حیوانات خانگی و پرندگان زینتی دکتر صالحی»).

## Mobile ↔ desktop

Full width of its column at all sizes; 48px tall everywhere (no smaller on touch). `inputmode` brings the right keyboard on phones: `numeric` for chip/price, `decimal` for weight. `.hz-input--sm` is never used on <1024.

## RTL & LTR

Persian text is RTL and starts at the start edge. `.hz-input--ltr` keeps Latin identifiers in reading order (`PET-8JDUN4GH`, `HZ-8MWQ2KD7RT`) while the label stays RTL. Icon at inline-start, suffix and action at inline-end, so they swap automatically in LTR. Icons used here are non-directional, never mirrored.

## Accessibility

Visible label via Field · icon is decorative (`aria-hidden`) · suffix is visual; include the unit in the label or hint when it matters («قیمت (تومان)») · trailing action is a real `<button>` with a Persian `aria-label` («کپی کد پیگیری نمونه») · `autocomplete` set where it applies (`name`, `tel-national`), `off` for codes · `spellcheck="false"` on codes.

## Data

Strings are stored as entered (trimmed). Numeric fields normalise Persian/Arabic digits to Latin before saving (`priceToman` is an integer bigint; the field shows Persian digits). Identifiers are uppercase Latin from the alphabet in `_meta.json`.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/field.tsx`: `TextField({ label, hint, error, required, ltr = false, ...native input props })`. Confirmed.


`src/ui/field.tsx` — `TextField` keeps `ltr` (sets `dir="ltr"` + `.hz-input--ltr`) and passes through native input props (`name`, `value`, `onChange`, `inputMode`, `disabled`, `required`). Proposed additions: `icon` (icon name), `suffix` (string), `action` (`{ icon, label, onClick }`), `size: 'md' | 'sm'`.

## Do / Don't

- Do use `ltr` for every number or code a user copies from paper: microchip, request code, national ID.
- Do put the unit in a suffix, not inside the value.
- Don't use a placeholder as the only example of a format; put it in the hint.
- Don't show «۰ تومان» for an unset price; leave the field empty and say «تعیین‌نشده» in read views.
- Don't stack icon + suffix + action in one control.
