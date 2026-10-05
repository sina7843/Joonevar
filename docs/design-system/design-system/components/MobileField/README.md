# MobileField

An LTR text field for an Iranian mobile number in the `09xxxxxxxxx` form, with numeric keyboard and digit normalisation.

Use it for login, profile, seller contact and any place a mobile number is entered. It is the first step of sign-in (the number receives the OtpField code). Do not use it for landlines or international numbers (plain `ltr` TextField).

## Anatomy

Field label «شماره موبایل» → `input.hz-input.hz-input--ltr` (`type="tel"`, `inputmode="numeric"`, `maxlength="11"`, placeholder `09xxxxxxxxx`) → hint («کد تأیید به این شماره پیامک می‌شود.») → error.

## CSS API

No new classes: TextField + `.hz-input--ltr`.

```html
<input class="hz-input hz-input--ltr" id="mobile" type="tel" inputmode="numeric" autocomplete="tel-national"
       maxlength="11" placeholder="09xxxxxxxxx" required aria-describedby="mobile-hint">
```

## Tokens

As TextField: `border-control`, `focus-ring` as a single 2px border (no outer ring), `status-error-border`/`status-error-text`, `bg-disabled`/`text-disabled`.

## Variants & sizes

One size (48px). In context: inside the login card with a block primary button «دریافت کد تأیید»; in the profile as a disabled field.

## States

Empty · typing (focus) · valid `09990001234` · error «شماره موبایل باید ۱۱ رقم باشد و با ۰۹ شروع شود.» (shown on blur/submit, not while typing) · disabled («شماره ورود شما؛ از بخش پروفایل تغییر می‌کند.») · sending (the submit button is `aria-busy`, the field becomes read-only) · server error, e.g. too many requests, goes in an Alert above the button, not in the field.

## Mobile ↔ desktop

Same at every width; full-width in the login card. `inputmode="numeric"` opens the digit pad on phones; `autocomplete="tel-national"` lets the OS offer the user's own number.

## RTL & LTR

The digits are always LTR (`dir` via `.hz-input--ltr`) and isolated in read views: `<bdi dir="ltr" class="hz-id">09990001234</bdi>`. Label, hint and error stay RTL.

## Accessibility

Visible label (never only a placeholder) · `type="tel"` for the right semantics · hint and error in `aria-describedby` · the error states the rule, so screen-reader users know how to fix it.

## Data

`mobile` on the account (`people.json`; sample numbers use the reserved `0999` prefix). **Normalisation before validation and save:** Persian (۰–۹) and Arabic (٠–٩) digits → Latin; strip spaces, dashes and parentheses; `+98` / `0098` → `0`. Valid = `^09\d{9}$`. Paste of «۰۹۹۹ ۰۰۰ ۱۲۳۴» is accepted and becomes `09990001234`.

## Code mapping

★ New `MobileField` on `TextField` with `ltr`: `value`, `onChange(normalised)`, `name`, `required`, `disabled`, `error`, `hint`. Export the `normalizeMobile()` and `isValidMobile()` helpers so the server uses the same rule.

## Do / Don't

- Do accept Persian digits; many users type with a Persian keyboard.
- Do show the number back in the OTP step with «ویرایش شماره».
- Don't split the number into several boxes or add a fixed «+98» prefix.
- Don't format with spaces inside the input; spaces break copy/paste into other apps.
