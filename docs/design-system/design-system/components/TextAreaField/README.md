# TextAreaField

A multi-line text control inside a Field, three rows or more, with a live character counter «۹۱ از ۵۰۰ نویسه» at the end of the hint line.

Use it for free text longer than one line: listing description «توضیحات آگهی», operator messages «دلیل درخواست اصلاح» / «پیام به متقاضی», product questions, review text, content summaries. Use TextField for one line, ReasonField (ops) when a mandatory decision reason needs draft chips and an internal note — it reuses this control and its counter. Never use a textarea for structured data (address parts belong to LocationField).

## Anatomy

1. Field label (+ «*» or «(اختیاری)»).
2. `.hz-textarea` — 3 rows minimum (`rows="3"`, 104px), 6 rows for long messages; vertical resize only.
3. Foot row `.hz-field__foot`: hint **or** error at the start, counter `.hz-field__counter` at the end.

## CSS API

| Class | Use |
|---|---|
| `.hz-textarea` | Control (bundle) |
| `.hz-field__foot` | Hint/error + counter on one line (css-addition `TextAreaField.css`) |
| `.hz-field__counter` | «۹۱ از ۵۰۰ نویسه», `text-secondary` |
| `.hz-field__counter--near` | ≥ 90% of the limit: warning tone, 600 |
| `.hz-field__counter--over` | Over the limit: error tone, 700 |

```html
<div class="hz-field">
  <label class="hz-field__label" for="desc">توضیحات آگهی<span class="hz-field__req" aria-hidden="true">*</span></label>
  <textarea class="hz-textarea" id="desc" rows="3" aria-describedby="desc-hint desc-count"></textarea>
  <div class="hz-field__foot">
    <div class="hz-field__hint" id="desc-hint">سن، واکسن و شرایط تحویل را بنویسید.</div>
    <div class="hz-field__counter" id="desc-count">۹۱ از ۵۰۰ نویسه</div>
  </div>
</div>
```

## Tokens

`bg-surface` · `border-control` · hover `text-secondary` border · focus `focus-ring` as a single 2px border (no outer ring) · invalid `status-error-border` · disabled `bg-disabled`, `border-disabled`, `text-disabled` · counter `text-secondary` → `status-warning-text` → `status-error-text` · `radius-md`.

## Variants & sizes

3 rows (default: descriptions, questions) · 6 rows (operator messages, summaries) · with or without counter (counter only when the field has a limit) · one width: the column.

## States

- **Default / filled** — counter shows the real length (`value.length`, ZWNJ counts as a character).
- **Hover** (pointer) — border darkens. **Focus-visible** — the border turns `focus-ring` orange at 2px — one stroke, same corners, no outer ring.
- **Near limit** (≥ 90%) — counter turns warning («۱۹۱ از ۲۰۰ نویسه»).
- **Over limit / error** — no hard `maxlength`: pasted text is never silently cut. The counter turns error, the control gets `aria-invalid`, and the error says by how much: «خلاصه ۱ نویسه از حد مجاز بیشتر است؛ کوتاهش کنید.» Submit is blocked.
- **Required empty** — «دلیل درخواست اصلاح را بنویسید.» after submit/blur, never while typing.
- **Disabled** — keep the text readable and say why: «نظر ثبت‌شده در انتظار بررسی است و تا آن زمان ویرایش نمی‌شود.»
- **Loading** — n/a (the control never waits; the form does).
- **Long Persian text** — wraps naturally; the textarea scrolls past its rows, the user can resize it taller.

## Mobile ↔ desktop

Full column width at every size. On <768 keep 3 rows (the keyboard takes half the screen); the foot row wraps the hint above the counter if it runs out of space. Touch: the whole control is the target (≥ 104px tall).

## RTL & LTR

Text, hint and error start at the start edge; the counter sits at the end (`margin-inline-start: auto`). Digits in the counter are Persian. Latin words inside the text follow the bidi algorithm; no forced direction.

## Accessibility

`<label for>` · `aria-describedby` lists hint, counter, then error · the counter is silent while far from the limit and gets `aria-live="polite"` from 90% up (set by the component), so screen readers are not flooded on every key · `aria-invalid="true"` only when over the limit or empty after submit.

## Data

Plain strings, trimmed on save. Limits come from the schema/validation per field (verify each in repo): listing description, correction reason, message to applicant, review, product question, content summary. The preview uses 500 / 300 / 200 as examples. Read views show the text with line breaks preserved; empty optional text shows «—».

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/field.tsx`: `TextAreaField({ label, hint, error, required, rows = 5, ...native textarea props })`. Confirmed.


`src/ui/field.tsx` — `TextAreaField` (keep as in code): `label`, `hint`, `error`, `required`, `rows`, native textarea props (`name`, `value`, `onChange`, `disabled`). Proposed additions: `maxLength?: number` (renders the counter and validates; **not** passed to the DOM `maxlength`), `counterThreshold = 0.9`.

## Do / Don't

- Do show the counter only when there is a limit, and always as «n از max نویسه».
- Do let people paste more than the limit and then ask them to shorten it.
- Don't use `maxlength` on the element; truncation loses text silently.
- Don't put the format example only in a placeholder; the hint stays visible.
- Don't colour the counter orange (brand) — near-limit is a warning, not emphasis.
