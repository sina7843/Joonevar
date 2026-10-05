# FileField

A single-file input shown as one bordered row — file icon, name, size/date or progress, and the action («انتخاب فایل», «جایگزینی», «بارگذاری دوباره»).

Use it when a form needs exactly one document: «تصویر پروانه کسب» (kennel registration), «تصویر روی کارت ملی» (KYC), a contract scan. For several files or listing/product photos use MultiFileUploader; for a profile, logo or cover image use ImageUploader.

## Anatomy

1. Field label (`<span id>` referenced by the input).
2. Row `.hz-file`: icon tile (file-text / file-pdf / image / warning) · body (name, meta or progress) · actions.
3. Hidden native `<input type="file">` + its `<label class="hz-btn">` as the visible button.
4. Hint (formats, size, privacy «فقط کارشناس انجمن این فایل را می‌بیند.») / error.

## CSS API

| Class | Use |
|---|---|
| `.hz-file` | Row (64px min) |
| `.hz-file--empty` | Dashed border, «فایلی انتخاب نشده» |
| `.hz-file--invalid` | Error border + red icon tile |
| `.hz-file--disabled` | Locked (under review) |
| `.hz-file__icon` · `__body` · `__name` · `__meta` · `__actions` | Parts; name ellipsizes |
| `.hz-progress__track` / `__fill` | Upload progress (bundle) |
| `.hz-doc__private` | Lock + privacy note (bundle) |

```html
<div class="hz-file hz-file--empty">
  <span class="hz-file__icon">…file-text…</span>
  <span class="hz-file__body"><span class="hz-file__name">فایلی انتخاب نشده</span>
    <span class="hz-file__meta" id="lic-h"><bdi>PDF</bdi>، <bdi>JPG</bdi> یا <bdi>PNG</bdi>؛ حداکثر ۵ مگابایت</span></span>
  <span class="hz-file__actions">
    <input class="hz-visually-hidden" type="file" id="lic" accept=".pdf,.jpg,.jpeg,.png" aria-labelledby="lic-l" aria-describedby="lic-h">
    <label class="hz-btn hz-btn--secondary hz-btn--sm" for="lic">…upload…انتخاب فایل</label>
  </span>
</div>
```

## Tokens

`bg-surface` · `border-control` (dashed when empty) · icon tile `bg-subtle` / `icon-strong` · error `status-error-border`, `status-error-bg`, `status-error-text` · disabled `bg-disabled`, `border-disabled`, `text-disabled` · progress `bg-disabled` track + `border-brand` fill · `radius-md`, tile `radius-sm`.

## Variants & sizes

Document (PDF or image) · image-only (KYC card photos) · private (with the lock note). One size.

## States

Empty · selected/uploaded (name, «۱٫۲ مگابایت، بارگذاری ۷ مهر ۱۴۰۵», «جایگزینی» + delete) · uploading (progress + «در حال بارگذاری، ۶۴٪ از ۲٫۴ مگابایت», «لغو») · error: too large («حجم فایل ۸٫۴ مگابایت است و حداکثر ۵ مگابایت پذیرفته می‌شود…»), wrong type, failed upload · **needs correction** from the reviewer — the request's correction note becomes the field error («تصویر پروانه کسب خوانا نیست؛ نسخه واضح‌تری بارگذاری کنید.») with «بارگذاری دوباره» · disabled while the case is under review · hover (button only) · focus-visible (drawn on the button via `:has(input:focus-visible)`) · **long file name** — one line with ellipsis, full name in `title`.

## Mobile ↔ desktop

Same row on all widths; on <360px the action becomes icon-only (upload icon with `aria-label`). On phones the picker offers camera or files; image-only fields add `accept="image/*"` (and `capture` only where a live photo is required). Touch targets ≥ 44: on <768 / coarse pointers render the action as `.hz-btn` (44px) instead of `.hz-btn--sm` (36px); the row stays ≥ 64px.

## RTL & LTR

Icon at inline-start, actions at inline-end. File names are user data: `<bdi dir="auto">` so a Latin name reads LTR and a Persian name RTL. Format names (PDF, JPG) are each wrapped in `<bdi>` so the Persian list order holds. Sizes use Persian digits and «٫» as decimal separator.

## Accessibility

Real `<input type="file">` (visually hidden, not `display:none`) labelled by the field label; the `<label for>` button opens it with Enter/Space. Progress uses `role="progressbar"` with `aria-valuenow`; status text in `role="status"`. Errors linked via `aria-describedby`; `aria-invalid` on the input. Delete button: «حذف فایل parvaneh-kasb-aria.pdf».

## Data

One `fileId` per field (plus original name, size, mime, uploadedAt). Private documents (KYC, licences) are never public URLs; only operators see them in DecisionDesk. Limits and accepted types are per field (in the code: `maxBytes` per call — 5 MB for images, 10 MB for most documents, up to 12–20 MB for some media); the preview uses 5 MB and PDF/JPG/PNG as examples.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/field.tsx`: `FileField({ label, name, accept, maxBytes, hint?, required?, testId? })`. There is no `error` or `onChange` today; add `error?` and `value?`.


`src/ui/field.tsx` — `FileField` (keep as in code). Proposed additions: `value?: { name, sizeBytes, uploadedAt }`, `progress?: number`, `onCancel?`, `onRemove?`, `private?: boolean` (shows the lock note), `maxSizeBytes?`.

## Do / Don't

- Do show the size limit and formats before the person picks a file.
- Do turn a reviewer's correction into the field error, word for word.
- Don't hide the native input with `display:none` (keyboard and screen readers lose it).
- Don't preview private documents as thumbnails in public or shared views.
