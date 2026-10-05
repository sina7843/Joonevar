# JalaliDateField

A Persian (Jalali) date input with a typed value and a calendar popover, in date, date-time, range and approximate variants.

**P0 because it fixes real UX debt:** today 15 native browser date inputs open a Gregorian calendar while every screen displays Jalali, so users read «۱۲ فروردین ۱۴۰۳» and must enter 2024-03-31. Use this for every date the user enters (birth date, vaccine date, sample appointment, filters by date). Never use `<input type="date">`.

## Anatomy

Field label → `.hz-input-wrap--action` with the text input (shows «۱۲ فروردین ۱۴۰۳», accepts typed «۱۴۰۳/۰۱/۱۲») and a 40px calendar button (`calendar-blank`) at inline-end → popover `.hz-calendar`:
1. Head: previous month (`caret-left` + mirror), title button «مهر ۱۴۰۵» + `caret-down` (opens month/year view; essential for birth dates years back), next month (`caret-right` + mirror).
2. Weekday row **ش ی د س چ پ ج** (week starts Saturday; Friday is the last column).
3. Day grid: leading/trailing days of the neighbour months dimmed (`--out`), today ringed (`aria-current="date"`), selected filled (`aria-selected="true"`), out-of-range days `disabled`.
4. Footer: «امروز» and «پاک کردن» (ghost, sm); range shows «۷ روز انتخاب شد».

Reference month in the preview: **Mehr 1405** — 1 Mehr = 23 Sep 2026 = Wednesday (5th column), 30 days, today = 10 Mehr (Friday).

## CSS API

| Class | Use |
|---|---|
| `.hz-calendar` · `__head` · `__grid` · `__wd` · `__day` · `__foot` | Bundle |
| `.hz-calendar__day--out` · `[aria-current="date"]` · `[aria-selected="true"]` · `:disabled` | Bundle |
| `.hz-calendar__row` (`display: contents`, `role="row"`) · `__title` · `__day--range` · `__foot-note` | css-addition `JalaliDateField.css` |
| `.hz-date-time` (date + 112px time) · `.hz-date-pair` (از … تا …) · `.hz-date-approx` (year + month) | css-addition |
| `.hz-input-wrap--action` | from `TextField.css` |

```html
<div class="hz-input-wrap hz-input-wrap--action">
  <input class="hz-input" id="birth" inputmode="numeric" value="۱۲ فروردین ۱۴۰۳" aria-describedby="birth-hint">
  <span class="hz-input-wrap__action"><button class="hz-icon-btn" type="button" aria-label="باز کردن تقویم" aria-haspopup="dialog" aria-expanded="false" aria-controls="cal-birth">…calendar-blank…</button></span>
</div>
```

## Tokens

Input: as TextField. Calendar: `bg-surface`, `border-default`, `radius-xl`, `shadow-overlay-sm` (floating layer) · selected `action-primary` + `text-on-action` · today ring `border-brand` · range fill `bg-brand-subtle` · hover `bg-subtle` · dimmed/disabled `text-disabled` · weekday `text-secondary` · footer divider `border-subtle`.

## Variants & sizes

- **Date** — default.
- **Date-time** — date input + LTR time input «۱۰:۳۰» (24h, Persian digits, `Asia/Tehran`).
- **Range** — two inputs «از» / «تا» sharing one calendar; first click sets start, second sets end; days between get `--range`.
- **Approximate** — checkbox «تاریخ دقیق را نمی‌دانم (تقریبی)» swaps the input for year (required) + month (optional, «ماه نامشخص») selects; stores `birthDateApproximate: true`; read views show «حدود ۱۴۰۲» or «حدود ۱۴۰۲/۰۱».

## States

Empty (placeholder «مثلاً ۱۴۰۵/۰۷/۰۱», format in the hint) · filled · hover · focus-visible · open (`aria-expanded="true"`) · disabled (system dates such as «تاریخ صدور») · error with cause and limit: «تاریخ تولد نمی‌تواند بعد از امروز (۱۰ مهر ۱۴۰۵) باشد.» · invalid typing («۱۴۰۳/۱۳/۰۱») → «ماه باید بین ۱ تا ۱۲ باشد.» · min/max: birth dates disable future days; appointments disable past days.

## Mobile ↔ desktop

<768: tapping the input or the button opens the calendar in a **BottomSheet** (full width, 44px day targets, footer actions full width); typing stays available. ≥768: popover under the field, 320px, aligned to inline-start; closes on Escape, outside click or a pick. Day buttons are 40px; on coarse pointers they grow to 44px inside the sheet.

## RTL & LTR

Grid follows `dir`: Saturday at the start edge in RTL. Month arrows are directional (`caret-left`/`caret-right` + `hz-icon--mirror`): «ماه قبل» sits at the start and points to the start. The time input is `.hz-input--ltr`. In a future LTR/Gregorian locale the same component renders Monday/Sunday-first from the locale.

## Accessibility

Popover `role="dialog"` with `aria-label` («انتخاب تاریخ تولد») · grid `role="grid"`, rows `role="row"`, weekday `columnheader` with full names (`abbr title="شنبه"`), days `gridcell` buttons with full labels («۵ مهر ۱۴۰۵، شنبه») · roving tabindex: arrows move a day (Left/Right follow visual direction), Up/Down a week, PageUp/PageDown a month, Home/End week start/end, Enter selects, Escape closes and returns focus to the input · today announced via `aria-current="date"` · typed input always works without the calendar.

## Data

**Stored as ISO Gregorian** (`birthDate.iso` "2023-04-11"; date-times with offset "2026-03-10T10:00:00+03:30"); **displayed Jalali with Persian digits** via `Intl` `fa-IR-u-ca-persian`, `Asia/Tehran` («۲۲ فروردین ۱۴۰۲» long, «۱۴۰۲/۰۱/۲۲» short). Typed input accepts Persian, Arabic or Latin digits and `/`, `-` or space separators. Approximate dates store the year (and month if given) with `birthDateApproximate: true`; display `birthDateFa` «حدود ۱۴۰۲/۰۱». Empty → «—» in read views.

## Code mapping

★ New `JalaliDateField` (replaces the 15 `<input type="date">` uses): `value` (ISO string or null), `onChange(iso)`, `min`, `max` (ISO), `mode: 'date' | 'datetime' | 'range'`, `allowApproximate` + `approximate` / `onApproximateChange` (maps to `birthDateApproximate`), plus Field props (`label`, `hint`, `error`, `required`, `disabled`). Conversion lives in one shared util next to the existing `Intl` formatter.

## Do / Don't

- Do show the accepted typing format in the hint.
- Do disable impossible days (future birth dates) instead of erroring after the pick.
- Don't show any Gregorian date to the user, and don't store a Jalali string.
- Don't force the calendar: typing «۱۴۰۳/۰۱/۱۲» must be enough.
