# OtpField

A one-time-code input of **6 boxes** (`CODE_LENGTH = 6`) with auto-advance, paste-to-fill, a resend countdown and an error state.

Use it for sign-in after MobileField and for confirming a mating contract (both parties confirm with a one-time code, P2 contract card). Not for passwords or for long codes such as request numbers (TextField with `ltr`).

## Anatomy

Title «کد تأیید را وارد کنید» → line «کد ۶ رقمی به `09990001234` پیامک شد.» + link «ویرایش شماره» → `.hz-otp` group of 6 inputs (48×56, `radius-md`, 22px bold) → resend row: `clock` + «ارسال دوباره کد تا ۰۱:۵۸», then a ghost button «ارسال دوباره کد» (`arrow-clockwise`) → error or busy line → primary button «تأیید و ورود».

## CSS API

| Class | Use |
|---|---|
| `.hz-otp` | Group, `direction: ltr`, centred, 8px gap |
| `.hz-otp[aria-invalid="true"]` | All boxes get the error border |
| `.hz-otp input:disabled` | Busy (verifying) look — css-addition `OtpField.css` |
| `.hz-otp-field` · `__resend` | Centred column + countdown/resend row — css-addition |

```html
<span class="hz-visually-hidden" id="otp-l">کد تأیید ۶ رقمی</span>
<div class="hz-otp" role="group" aria-labelledby="otp-l">
  <input inputmode="numeric" maxlength="1" autocomplete="one-time-code" aria-label="رقم ۱ از ۶">
  … 5 more, each aria-label «رقم n از ۶» …
</div>
```

## Tokens

`bg-surface` · `border-control` · focus `focus-ring` as a single 2px border (no outer ring) · error `status-error-border` + `status-error-text` · busy `bg-disabled`, `border-disabled`, `text-secondary` · `text-secondary` for the countdown · ghost button `text-brand`.

## Variants & sizes

One size: 6 × 48px + 5 × 8px = 328px, which fits a 360px screen with 16px gutters. No 4-digit variant (the code is always `CODE_LENGTH`).

## States

Empty · typing (focus on the next empty box) · complete (auto-submit once all 6 are filled; the button stays as a fallback) · verifying (boxes disabled, spinner «در حال بررسی کد») · error «کد واردشده درست نیست. دوباره وارد کنید یا کد تازه بگیرید.» (boxes keep the digits, focus returns to the first box, all selected) · expired «اعتبار این کد تمام شده است. کد تازه بگیرید.» · countdown running (resend disabled as text) · countdown done (ghost button «ارسال دوباره کد»).

## Mobile ↔ desktop

Same layout at every width, centred in the auth card. `autocomplete="one-time-code"` lets iOS/Android offer the SMS code above the keyboard; `inputmode="numeric"` shows the digit pad. On 768+ the card is centred in the page at 400px.

## RTL & LTR

The boxes are **always LTR** (first digit on the left), like the SMS. Surrounding text is RTL; the mobile number is isolated in `<bdi dir="ltr">`. Countdown digits are Persian («۰۱:۵۸»), the code itself is shown as typed and stored in Latin.

## Accessibility

One `role="group"` labelled «کد تأیید ۶ رقمی»; each box `aria-label="رقم n از ۶"` · auto-advance on input, Backspace on an empty box goes back and clears it, Left/Right arrows move · paste anywhere fills all boxes · error text in `role="alert"` · countdown in `aria-live="polite"`, updated **once per 15 s** for screen readers (visual updates every second) · do not auto-submit while a screen reader user is still on the last box without an explicit change event.

## Data

Code length from `CODE_LENGTH` (6). Input normalises Persian/Arabic digits to Latin and drops non-digits. Resend cooldown and code expiry come from the server response (do not hard-code «۰۱:۵۸»). The mobile shown is the one entered in MobileField.

## Code mapping

★ New `OtpField`: `length = CODE_LENGTH`, `value`, `onChange`, `onComplete(code)`, `invalid`, `error`, `disabled` (busy), `resendAt` (timestamp) + `onResend`, `phone` (for the sentence and «ویرایش شماره» → `onEditPhone`).

## Do / Don't

- Do let paste and SMS autofill do the work.
- Do keep digits in the boxes after an error so the user can see what was typed.
- Don't mirror the box order in RTL.
- Don't hide the resend action behind a long countdown with no time shown.
