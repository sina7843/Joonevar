# Countdown

Time left until a deadline — «۰۱:۵۸» for the OTP resend, «۱۸ روز مانده» for an appointment or listing — always next to the absolute Jalali date, turning warning when close and error when passed.

Use it for the resend-code cooldown (OtpField), the vet-visit deadline of a referral code (`HZ-`), correction deadlines on requests, listing display expiry, payment deadlines. Don't use it as decoration, for elapsed age in ops queues (that is `.hz-age` «۱۲ روز در صف»), or without a real deadline from data.

## Anatomy

1. Icon 16px — `clock` (running / soon), `calendar-blank` (long dates), `warning-circle` (passed).
2. Label (optional) — «ارسال دوباره کد تا», «مهلت مراجعه به دامپزشک».
3. Value — Bold, tabular digits: «۰۱:۵۸» · «۱۸ روز مانده» · «۵ روز گذشته».
4. Date — `<time datetime>` «تا ۲۸ مهر ۱۴۰۵» (omitted only for mm:ss).
5. Live text — visually hidden `role="status"`, updated at milestones only.

## CSS API

| Class | Role |
|---|---|
| `.hz-countdown` | Inline row, 13/20 `text-secondary` |
| `__value` · `__date` · `__when` | Value (Bold, `text-primary`), date, value+date wrapper |
| `--soon` | ≤3 days (or ≤10 min for minute deadlines): `status-warning-text` |
| `--over` | Deadline passed: `status-error-text`, «… گذشته» |
| `--block` | Long label: icon + label wrap on top, `__when` below |

```html
<span class="hz-countdown">…calendar-blank…<span class="hz-countdown__value">۱۸ روز مانده</span>
  <time class="hz-countdown__date" datetime="2026-10-20T23:59+03:30">تا ۲۸ مهر ۱۴۰۵</time></span>
```

## Tokens

`text-secondary` · `text-primary` · `icon-default` · `status-warning-text` · `status-error-text` · `space-4/6`.

## Variants & sizes

| Format | When | Example (reference date ۱۰ مهر ۱۴۰۵) |
|---|---|---|
| `mm:ss` | under 1 hour, ticking | «ارسال دوباره کد تا ۰۱:۵۸» → at 0 becomes ghost «ارسال دوباره کد» |
| `N ساعت مانده` | last 24 h | «۵ ساعت مانده، تا امروز ۲۳:۵۹» |
| `N روز مانده` | ≥1 day | `HZ-SCMXFSFNPW` «۱۸ روز مانده، تا ۲۸ مهر ۱۴۰۵» · listing «بیگل بالغ» «۲۲ روز تا پایان نمایش، تا ۲ آبان ۱۴۰۵» |
| `--soon` | ≤3 days | same code on ۲۶ مهر: «۲ روز مانده» |
| `--over` | passed | `HZ-8MWQ2KD7RT` «۵ روز گذشته، مهلت ۵ مهر ۱۴۰۵»; inside ActionOwner «۵ روز از مهلت اصلاح گذشته» |

Days are counted in Asia/Tehran calendar days, rounded up; a deadline at 23:59 counts that day.

## States

Running · soon · over · done (mm:ss reaches 0 → replaced by the action; focus is kept on the page, not moved) · loading: server time not yet known → show only the absolute date · error: no deadline (`null`) → render nothing, never «۰ روز» · long Persian text: `--block`, label wraps beside the icon, value + date stay together. No hover or disabled state of its own.

## Mobile ↔ desktop

Identical; wraps the date to a second line in narrow cards. In tables (ops) use the value only and put the date in a tooltip-free second line (`hz-case__sub`).

## RTL & LTR

Persian digits everywhere. `mm:ss` with Persian digits stays left-to-right («۰۱:۵۸») because Extended Arabic-Indic digits are European-number class — keep the value in one element, don't split minutes and seconds. Icons are never mirrored.

## Accessibility

- The ticking `mm:ss` element is `aria-hidden="true"`; a separate visually hidden `role="status"` (`aria-live="polite"`) is updated **only** at 60 s, 30 s, 10 s and 0 («اکنون می‌توانید کد را دوباره بفرستید.»). Never put a per-second ticker in a live region.
- Day countdowns are static text (updated on page load) — no live region.
- `<time datetime>` carries the ISO deadline; colour is never the only cue (wording «گذشته» + icon).
- Respect reduced motion: no blinking near zero.

## Data

Deadline ISO from data: `referralCodes[].expiresAt`, `requests[].deadline`, listing `publishedAt + durationDays`, OTP `resendAt` from the server response (don't hard-code 120 s). Compute against server time (clock skew), display Jalali via `Intl fa-IR-u-ca-persian`, `Asia/Tehran`.

## Code mapping

★ New — the OTP screen has its own timer today. Proposed `Countdown` in `src/ui/countdown.tsx`: `deadline: string (ISO)`, `format?: 'auto' | 'clock' | 'days'`, `label?`, `soonThreshold?` (default 3 days / 10 min), `showDate?: boolean` (default true for days), `onElapsed?()`. OtpField's resend row uses it with `format="clock"`.

## Do / Don't

- Do always show the absolute date beside «N روز مانده».
- Do announce only milestones to screen readers.
- Don't show «۰ روز مانده» — on the last day say «امروز تا ۲۳:۵۹»; after it «گذشته».
- Don't use red before the deadline has passed; ≤3 days is warning.
