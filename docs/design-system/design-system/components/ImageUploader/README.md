# ImageUploader

Uploads the one image a record has — avatar, square (logo, product), cover or animal photo — and shows how it will be cropped in every frame it appears in, around a focal point the person sets.

Each record stores a single image that is cropped into 16:9, 4:3, 1:1 and a 56px thumbnail (`images.json`: «compose the subject inside the centre 60%»). This component makes those crops visible before saving. Use MultiFileUploader for listing/product galleries and FileField for documents.

## Anatomy

1. Field label.
2. Preview in its shape: avatar 96 circle · square 120 · cover 16:9 full width; empty = RecordImage empty state (brand symbol, «تصویر ثبت نشده»).
3. Actions: «افزودن تصویر» / «تغییر تصویر» (label of the hidden file input), «حذف تصویر».
4. After upload (cover / animal photo): crop editor `.hz-crop` with a 44px focal-point handle, hint, and `.hz-crop-frames` — the same image in 16:9 «بنر صفحه و کارت», 4:3 «عکس حیوان و آگهی», 1:1 «محصول و فهرست», 56px thumb and circle.
5. Required alt-text Field «متن جایگزین».

## CSS API

| Class | Use |
|---|---|
| `.hz-image-up` · `__actions` | Stack: preview + actions |
| `.hz-image-up__preview` + `--avatar` · `--square` · `--cover` | Frame sizes (on a `.hz-media`) |
| `--invalid` · `--disabled` · `__busy` | Error outline · locked · upload overlay (spinner + «۴۰٪») |
| `.hz-crop` (`dir="ltr"`) · `__focus` · `__hint` | Crop editor; handle positioned with `inset-inline-start/-block-start` in % |
| `.hz-crop-frames` · `.hz-crop-frame` · `__caption` · `__row` | Frame previews (reuse `.hz-media--16x9/4x3/1x1/thumb/avatar`) |

```html
<div class="hz-crop" dir="ltr">
  <img src="…" alt="">
  <button class="hz-crop__focus" type="button" aria-label="نقطه کانونی تصویر؛ با کلیدهای جهت جابه‌جا کنید"
          style="inset-inline-start:63%;inset-block-start:62%"></button>
</div>
<figure class="hz-crop-frame"><div class="hz-media hz-media--1x1"><img src="…" alt="" style="object-position:79.5% 50%"></div>
  <figcaption class="hz-crop-frame__caption"><b>۱:۱</b>محصول و فهرست</figcaption></figure>
```

## Tokens

`bg-media-empty` (empty and letterbox) · frames `border-default` · handle `bg-surface` ring with `overlay-scrim` hairline (visible on any photo) · busy overlay `overlay-scrim` + `text-on-action` · error `status-error-border` · focus `focus-ring` · radii from RecordImage (`radius-xl`, `radius-lg`, `radius-full`).

## Variants & sizes

Avatar (people, 1:1 shown as circle) · square (seller logo, product packshot) · cover / animal photo (16:9 source, all frames). Small frames: 56px thumb and circle.

## States

Empty (symbol + «افزودن تصویر»; avatar optional — the brand placeholder is used everywhere) · uploading (overlay with spinner and percent, «لغو بارگذاری») · uploaded with crop preview · error (wrong format «قالب HEIC پذیرفته نمی‌شود؛ تصویر JPG یا PNG بارگذاری کنید.», too small, too large) · disabled with reason («فروشگاه در حال بررسی است؛ پس از تأیید می‌توانید نشان را تغییر دهید.») · hover (buttons only) · focus-visible on the handle and buttons · alt missing → field error · long Persian alt text wraps in the field.

## Mobile ↔ desktop

<768: editor full width, frames in a 2-column grid below it; the handle is dragged with a finger (`touch-action: none` on the stage) and is 44px. 768–1023: same stacked layout. ≥1024: editor (7/12) beside the frames (5/12), as in the preview. The picker on phones offers camera or gallery.

## RTL & LTR

The crop stage is `dir="ltr"`: image coordinates are physical, so the focal point's x is measured from the image's left edge in every language; captions and actions stay RTL. Ratios «۱۶:۹» are Persian digits (the colon keeps them in order). Icons (camera, upload, trash) are non-directional.

## Accessibility

Hidden native file input labelled by the action button. The focal handle is a button: arrow keys move it by 2% (Shift: 10%), its `aria-describedby` points to the hint. Frame previews are decorative (`alt=""`) — the alt text field is the description; preview group has `aria-label="پیش‌نمایش برش"`. Upload progress and errors announced politely (`role="status"`).

## Data

`imageFileId` + `imageAltFa` (mandatory) per record; frames from `images.json` (`banner` 16:9 1200×675, card 4:3, packshot/avatar 1:1, `thumb` 56). Each frame's `object-position` is computed so the focal point sits in the frame's centre, clamped to the image edges. **Focal point (`imageFocusX`, `imageFocusY`, 0–100) is not in the current schema** — product-owner decision; without it every frame centre-crops and the «centre 60%» rule is the only guidance (show the safe-area hint instead of the handle).

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** Display is `RecordImage` (`fileId`, `altFa`, `variant`); uploads go through `FileField`. ★ New uploader.


`src/ui/record-image.tsx` (RecordImage — display, keep as in code). ★ Proposed `ImageUploader` in `src/ui/image-uploader.tsx`: `shape: 'avatar' | 'square' | 'cover'`, `value?: { fileId, url, altFa, focus? }`, `onChange`, `onUpload(file) => Promise<{ fileId, url }>`, `frames?: Array<'16:9' | '4:3' | '1:1' | 'thumb' | 'avatar'>`, `accept`, `maxSizeBytes`, `required?`, `disabled?`, `disabledReason?`, `error?`.

## Do / Don't

- Do show every frame the image will be used in before saving.
- Do require the alt text and describe what is in the picture, not the file name.
- Don't let a crop silently cut off the animal; the focal point (or the centre 60% rule) prevents it.
- Don't use real people's photos for avatars in samples — portraits are placeholders only.
