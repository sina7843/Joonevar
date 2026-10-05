# Alert

A bordered message box in one of five status tones, with icon, optional title, body and actions, used for page- and section-level news the user must see.

Use it for account and case conditions («پرونده شما نیازمند اصلاح است»), stale-decision warnings on decision desks, payment results, saved-draft notices and unread notifications on the dashboard. Don't use it for a field error (use the field's `__error`), for a short-lived confirmation such as "copied" (Toast ★, P1), or for a whole empty/failed page (use `PageStates`).

## Anatomy

1. Container — 1px `status-{tone}-border`, `status-{tone}-bg`, `radius-lg`, 14×16 padding
2. Icon (20px) in `status-{tone}-text`
3. Body: optional Bold title (15px) + text (14/24)
4. Optional actions row (max one primary + one secondary/ghost)

## CSS API

| Class | Role |
|---|---|
| `.hz-alert` | container |
| `.hz-alert--neutral` · `--info` · `--success` · `--warning` · `--error` | tone |
| `.hz-alert__icon` | the icon (put the class on the `svg`) |
| `.hz-alert__body` · `__title` · `__actions` | content |
| `.hz-alert--inline-action` | ≥768: actions sit at the inline end on the same row |

```html
<div class="hz-alert hz-alert--warning" role="alert">
  <svg class="hz-icon hz-icon--sm hz-alert__icon" …warning…></svg>
  <div class="hz-alert__body">
    <span class="hz-alert__title">تصمیم ثبت نشد</span>
    <span>این پرونده پس از باز کردن شما تغییر کرده است. صفحه را دوباره بار کنید و سپس تصمیم بگیرید.</span>
    <div class="hz-alert__actions"><button class="hz-btn hz-btn--secondary hz-btn--sm">بارگذاری دوباره</button></div>
  </div>
</div>
```

## Tokens

`status-{neutral|info|success|warning|error}-bg/-text/-border`, `text-primary`, `radius-lg`; actions use `Button` tokens.

## Variants & sizes

| Tone | Icon (Phosphor) | Role | Example |
|---|---|---|---|
| error | `warning-circle` | `alert` | «پرداخت انجام نشد» · a rejected document |
| warning | `warning` | `alert` | «پرونده شما نیازمند اصلاح است» · «حساب شما هنوز کامل نیست» · stale decision «تصمیم ثبت نشد» (approved 11 Mehr 1405: nothing is lost, the operator reloads and decides again) |
| success | `check-circle` | `status` | «احراز هویت تأیید شد» |
| info | `info` (or `bell` for notifications) | `status` | «۲ اعلان خوانده‌نشده دارید» |
| neutral | `file-text` | `status` | «پیش‌نویس ثبت «مکس» ذخیره شده است» |

Tone follows the status family of what the alert reports (failed payment = blocked = error; needs correction = action = warning). With or without title; with 0–2 actions; `--inline-action` for single-action, one-line alerts.

## States

- **Default**; alerts themselves have no hover/focus — their buttons do (`focus-ring`, shown statically in the preview).
- **Loading action:** the action button gets `aria-busy="true"` + `.hz-spinner` («در حال انتقال به درگاه»).
- **Dismissible:** not in P0 — alerts reflect server state and disappear when the condition clears.
- **Long Persian text:** the notification body from `edge-cases.json` wraps to three lines; the icon stays top-aligned with the first line.

## Mobile ↔ desktop

<768: full width, actions wrap under the text; on coarse pointers actions use the default 44px button, not `--sm` (36px). 768–1023 and ≥1024: `--inline-action` puts a single action at the end of the row.

## RTL & LTR

Icon at inline start (right), actions at inline end on `--inline-action`. Directional icons in actions (e.g. «ادامه ←») use the LTR glyph + `hz-icon--mirror`; status icons are never mirrored.

## Accessibility

- `role="alert"` **only** for error and warning (interrupts the screen reader); `role="status"` for info, success and neutral. Alerts already on the page at load can omit the role.
- Title is plain text, not a heading, unless the alert is a section on its own.
- Colour is never the only cue — every tone has its icon and wording.
- Inject alerts into an existing live region so they are announced; don't move focus, except the stale-decision warning which returns focus to «بارگذاری دوباره».

## Data

Title/body come from the code's messages (`notifications.titleFa/bodyFa`, `correctionFa`, `reasonFa`, `staleDecisionMessageFa`). Counts («۲ اعلان») come from data, in Persian digits. Empty body → title-only alert; no empty alerts.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/alert.tsx`: `Alert({ tone = 'info', title: string, children?, action?: ReactNode })`. Tones already equal the 5 status tones. Keep; make `title` optional, keep `action` as the single slot and add `secondaryAction?` and `inlineAction?`.


`src/ui/alert.tsx` — `Alert`. Keep existing `tone`; proposed: `tone: 'neutral'|'info'|'success'|'warning'|'error'`, `title?`, `children`, `actions?`, `inlineAction?: boolean`. The component sets `role` from `tone` — callers can't override it.

## Do / Don't

- Do say the cause and the fix: «تصویر کارت ملی مات است؛ لطفاً دوباره بارگذاری کنید.»
- Do keep one primary action per view — if the page already has a primary button, the alert's action is secondary.
- Don't stack more than two alerts; merge or prioritise (error > warning > info).
- Don't use `role="alert"` for success messages, and don't use orange for an alert.
