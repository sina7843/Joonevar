# NationalIdField

A 10-digit Iranian national ID input (کد ملی) — Latin digits, left-to-right, with check-digit validation when the person leaves the field.

Use it in KYC (identity verification) and anywhere a person or representative enters a national ID. It only checks the format and the check digit; whether the ID belongs to the person is decided in the KYC review (DecisionDesk), so it never says «تأیید شد».

## Anatomy

1. Field label «کد ملی».
2. `.hz-input.hz-input--ltr.hz-input--digits` — `inputmode="numeric"`, `maxlength="10"`, `autocomplete="off"`, `spellcheck="false"`.
3. Hint «۱۰ رقم روی کارت ملی، بدون خط تیره.»
4. Result line: `.hz-field__success` «رقم کنترل کد ملی معتبر است.» or `.hz-field__error`.

## CSS API

| Class | Use |
|---|---|
| `.hz-input--ltr` | LTR control, aligned to end (bundle) |
| `.hz-input--digits` | Slight tracking + tabular digits for comparing with the card (css-addition `NationalIdField.css`) |
| `.hz-field__success` | Positive validation line, success tone, `check-circle` icon (css-addition) |
| `.hz-field__error` | Error line (bundle) |

```html
<div class="hz-field">
  <label class="hz-field__label" for="nid">کد ملی<span class="hz-field__req" aria-hidden="true">*</span></label>
  <input class="hz-input hz-input--ltr hz-input--digits" id="nid" type="text" inputmode="numeric"
         maxlength="10" autocomplete="off" spellcheck="false" value="9000000009" aria-describedby="nid-h nid-s">
  <div class="hz-field__hint" id="nid-h">۱۰ رقم روی کارت ملی، بدون خط تیره.</div>
  <div class="hz-field__success" id="nid-s">…check-circle…<span>رقم کنترل کد ملی معتبر است.</span></div>
</div>
```

## Tokens

TextField tokens · success line `status-success-text` · error `status-error-text` + `status-error-border` · disabled `bg-disabled` / `text-disabled`.

## Variants & sizes

One variant, 48px. Read-only display elsewhere uses Identifier / KeyValueList with `<bdi class="hz-id" dir="ltr">`.

## States

- **Empty** — hint only («… رقم فارسی هم پذیرفته می‌شود.»).
- **Typing** — Persian/Arabic digits convert to Latin on input, other characters dropped; no error while typing.
- **Valid** (on blur) — success line.
- **Too short** — «کد ملی ۱۰ رقم است؛ ۸ رقم وارد کرده‌اید.»
- **Wrong check digit** — «این کد ملی معتبر نیست؛ رقم آخر با بقیه رقم‌ها نمی‌خواند. کد را دوباره از روی کارت بخوانید.»
- **Focus-visible**, hover (pointer).
- **Disabled after approval** — «احراز هویت شما تأیید شده و کد ملی دیگر تغییر نمی‌کند.»
- **Duplicate** (server) — «این کد ملی برای حساب دیگری ثبت شده است. اگر حساب قبلی متعلق به شماست، با پشتیبانی تماس بگیرید.» (wording for the product owner to confirm).
- Long Persian text: only the hint/error wrap; the value never exceeds 10 characters.

## Mobile ↔ desktop

Numeric keypad on phones (`inputmode="numeric"`); full column width; on ≥768 it can share a row with «تاریخ تولد» in the KYC form. Height 48 at every size.

## RTL & LTR

The control is LTR so the digits keep the card's order, aligned to the end (right in RTL, next to where the label starts). Label, hint and messages stay RTL. The check icon is non-directional.

## Accessibility

Visible label; hint and result in `aria-describedby`; `aria-invalid="true"` only after blur with an error. Validation runs on blur (and on submit), not on each key. The success line is plain text — not a live region — so it is read with the field, not interrupting.

## Data

`nationalId` on the account/KYC record (string of 10 Latin digits). Algorithm: for the first 9 digits, sum `digit × (10 − position)`; `r = sum mod 11`; check digit = `r` if `r < 2`, else `11 − r`. Reject 10 identical digits. Synthetic IDs start at `9000000000`. Valid samples: `9000000009` (سارا احمدی), `9000005493`, `9000006864`, `9000010977`. **Note:** six of the ten sample IDs in `people.json` fail this check (e.g. `9000001380`, `9000009606` — the KYC mockup shows the latter as valid); the sample data needs regenerating.

## Code mapping

★ Proposed `NationalIdField` in `src/ui/national-id-field.tsx`: `label = 'کد ملی'`, `value`, `onChange`, `required?`, `disabled?`, `disabledReason?`, `error?` (server errors). Exports `isValidNationalId(code: string): boolean` and `normalizeDigits()` shared with the server validation. Wraps TextField with `ltr`.

## Do / Don't

- Do accept Persian digits and convert them; never ask the person to change keyboard.
- Do say exactly which rule failed (length or check digit).
- Don't say «تأیید شد» for a valid check digit — only the KYC review confirms identity.
- Don't mask or group the digits while typing; people compare them with the card.
