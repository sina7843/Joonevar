# InlineMessage

A one- or two-line message with a small status icon that sits directly under a section or group to help, warn or report an error about that part of the page.

Use it under a fieldset of radios/checkboxes, under a card section («مدارک هویتی»), under an upload area or a KV block — where the message belongs to a group rather than one input. For a single field use the field's own `hz-field__error` / `hz-field__hint`; for news about the whole page or case use `Alert`; for a confirmation that disappears use `Toast`.

## Anatomy

1. Icon — 16px, `status-{tone}-text`, aligned with the first line.
2. Text — 13/20 Regular in `status-{tone}-text`; may end with one `hz-link` («بارگذاری پروانه»).

No box, no border, no title, no close button — that is what separates it from `Alert`.

## CSS API

| Class | Role |
|---|---|
| `.hz-inline-msg` | Row (icon + text); use on a `<p>` |
| `.hz-inline-msg--info` · `--success` · `--warning` · `--error` | Tone (colour of icon and text) |
| `.hz-inline-msg__text` | Text wrapper (wraps; may contain one `.hz-link`) |

```html
<p class="hz-inline-msg hz-inline-msg--error" id="delivery-err">
  <svg class="hz-icon hz-icon--xs" …warning-circle…></svg>
  <span class="hz-inline-msg__text">یکی از دو روش دریافت را انتخاب کنید.</span>
</p>
```

## Tokens

`status-info-text` · `status-success-text` · `status-warning-text` · `status-error-text` (all ≥5.4:1 on `bg-surface`/`bg-page`) · `text-brand` (link) · `space-4/6`.

## Variants & sizes

| Tone | Icon | Example |
|---|---|---|
| info | `info` | «مدارک فقط برای کارشناس انجمن و دامپزشک معتمد دیده می‌شود.» |
| success | `check-circle` | «پیش‌نویس در ۱۰ مهر ۱۴۰۵، ساعت ۹:۳۰ ذخیره شد.» |
| warning | `warning` | «میکروچیپ هنوز ثبت نشده است؛ بدون آن برگه ثبتی صادر نمی‌شود.» |
| error | `warning-circle` | «تصویر کارت ملی هنوز بارگذاری نشده است.» |

No neutral tone (neutral notes are plain `hz-caption`). One size.

## States

Default · with link (link gets the focus ring, shown statically) · loading: the same slot shows `.hz-spinner` + «در حال ذخیره پیش‌نویس» in `text-secondary` before turning success/error · error: when it reports a group error, the group's inputs also get `aria-invalid="true"` · empty: render nothing (no empty slot keeping space) · long Persian text: wraps freely, icon stays on the first line (edge-case notification body at 360px). No hover, no disabled.

## Mobile ↔ desktop

Same at all breakpoints; full width of its section. The link inside keeps 44px touch height only when it is the sole action (`hz-link--standalone` on its own line on phones).

## RTL & LTR

Icon at inline start; status icons are never mirrored. Latin identifiers inside the text go in `<bdi class="hz-id" dir="ltr">`.

## Accessibility

- Connect it to its group: `aria-describedby` on the `<fieldset>`/section (or input) → the message `id`.
- Message present at load: no role. Message that appears after an action: `role="alert"` for error, `role="status"` for info/success/warning (warning is advisory here, not an interruption — unlike `Alert`).
- Colour is not the only cue: icon + wording. Text contrast ≥5.4:1.
- Error text names the fix («… را انتخاب کنید»), not just "invalid".

## Data

Text is UI copy or server messages (`correctionFa`, validation messages); times from data (`updatedAt` → «۱۰ مهر ۱۴۰۵، ساعت ۹:۳۰»), Persian digits.

## Code mapping

★ New — none in code (ad-hoc `<p className="text-sm text-red…">`). Proposed `InlineMessage` in `src/ui/alert.tsx` beside `Alert`: `tone: 'info' | 'success' | 'warning' | 'error'`, `id` (for `aria-describedby`), `live?: boolean` (adds the role), `children`.

## Do / Don't

- Do place it directly under the group it talks about, after the last control.
- Do keep it to one or two sentences with at most one link.
- Don't use it for page-level news or anything that needs a title or buttons — use `Alert`.
- Don't stack two InlineMessages under one group; merge them or use the higher tone.
- Don't use orange (brand) text for a message.
