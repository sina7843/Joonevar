# MultiFileUploader

Several files at once: a drop zone with a picker button, then a list where every file shows its progress or error — and every image has its own required Persian alt-text field.

Use it for listing media (marketplace), product media (shop), and seller / Claim documents. Images need a description because `imageAltFa` is mandatory in the service layer; documents (PDF) do not. For one file use FileField; for a single record image with crop preview use ImageUploader.

## Anatomy

1. Drop zone `.hz-dropzone`: upload icon · title «تصویرها را اینجا رها کنید» · rules (formats, size, count, «تصویر اول، تصویر اصلی آگهی است.») · «انتخاب از دستگاه» (label for the hidden multi-file input).
2. List head: title + count «۴ از ۸ تصویر».
3. Row `.hz-upload`: thumbnail (64px; RecordImage symbol while the preview is not ready) · name (+ «تصویر اصلی» tag on the first) · meta or progress · actions (reorder handle, delete / «لغو» / «تلاش دوباره»).
4. Under each image row: `.hz-upload__alt` Field «متن جایگزین تصویر n» (required).
5. Document rows `.hz-upload--doc`: icon tile, document type as the name, file name + size as meta, «خصوصی» note; no alt field.

## CSS API

| Class | Use |
|---|---|
| `.hz-dropzone` · `--over` · `--invalid` · `--disabled` · `--compact` | Drop zone and its states; compact = one row (after the first files, or when locked) |
| `.hz-dropzone__icon` · `__title` · `__hint` | Parts |
| `.hz-upload-list` · `__head` | List + count line |
| `.hz-upload` · `--error` · `--doc` | File row |
| `.hz-upload__body` · `__head` · `__name` · `__meta` · `__actions` · `__file-icon` | Parts |
| `.hz-upload__alt` | Full-width alt-text Field under the row |
| reuse | `.hz-media--thumb-lg`, `.hz-tag`, `.hz-progress__track/__fill`, `.hz-doc__private`, `.hz-field__error` |

```html
<li class="hz-upload">
  <div class="hz-media hz-media--thumb-lg"><img src="…" alt=""></div>
  <div class="hz-upload__body"><div class="hz-upload__head"><bdi class="hz-upload__name" dir="auto">IMG_2481.jpg</bdi><span class="hz-tag">تصویر اصلی</span></div>
    <span class="hz-upload__meta">۲٫۴ مگابایت، بارگذاری شد</span></div>
  <div class="hz-upload__actions">…handle… …trash…</div>
  <div class="hz-field hz-upload__alt"><label class="hz-field__label" for="alt-1">متن جایگزین تصویر ۱<span class="hz-field__req" aria-hidden="true">*</span></label>
    <input class="hz-input" id="alt-1" value="سگ ژرمن شپرد بالغ کنار یک گربه پرشین روی مبل"></div>
</li>
```

## Tokens

Drop zone `border-control` 2px dashed, `bg-surface`; over `border-brand` + `bg-brand-subtle`; invalid `status-error-border`; disabled `bg-subtle` + `border-default` · rows `border-default`, `radius-lg`, error `status-error-border` / `status-error-bg` · progress `bg-disabled` + `border-brand` · thumbnails `bg-media-empty` · `radius-xl` on the zone.

## Variants & sizes

Images (listing, product — with alt per image, first = main) · documents (seller, Claim — no alt, private) · full zone (empty list) or compact zone (files present, locked, or space-tight).

## States

Zone: default · drag-over («رها کنید تا ۳ فایل بارگذاری شود») · rejected files (error under the zone naming each file and the reason: «فایل shenasnameh.docx پذیرفته نشد؛ فقط تصویر JPG یا PNG بارگذاری کنید.») · full («۸ از ۸ تصویر — برای افزودن، یکی را حذف کنید.», disabled) · locked during review · focus-visible on the button.
Row: uploading (progress + «لغو»; the alt field can already be filled) · uploaded · failed («بارگذاری نشد؛ اتصال قطع شد.» + «تلاش دوباره») · alt missing after submit («بنویسید در تصویر چه دیده می‌شود، مثلاً «ژرمن شپرد — چهره». آگهی بدون آن منتشر نمی‌شود.») · long file name (ellipsis, full name in `title`). Loading of an existing list: Skeleton rows.

## Mobile ↔ desktop

<768: no drag and drop — the zone collapses to the picker button with the rules under it («انتخاب یا گرفتن عکس»); rows stack thumbnail · text · actions with the alt field full width below; reorder by long-press or the handle's menu («انتقال به بالا/پایین»). 768–1023: as desktop, single column. ≥1024: zone beside or above the list (form column ≤ `container-reading`). Icon buttons are 44px on coarse pointers.

## RTL & LTR

Thumbnail at inline-start, actions at inline-end. File names `<bdi dir="auto">`; format names `<bdi>`. The reorder handle (dots-six-vertical) and trash are non-directional. Upload order = reading order (first = top/start).

## Accessibility

Hidden native `<input type="file" multiple>` labelled by the button; drag and drop is an enhancement, never the only way. List `aria-label`; each row's buttons name the file («حذف تصویر ۲»). Progress `role="progressbar"`; completion and failures announced in a polite live region; rejected files in `role="alert"`. Reordering: handle is a button; arrow keys move the item and announce «تصویر ۲ به جایگاه ۱ رفت». Alt fields are real labelled inputs; the thumbnail's own `alt` is empty (the text is being authored next to it).

## Data

Listing/product media: ordered array of `{ imageFileId, imageAltFa }` (listing samples carry `altFa` like «ژرمن شپرد — تمام‌قد»). Documents: `{ fileId, kind, name, sizeBytes }`, private. Count and size limits per entity (size: `maxBytes` per call, 5 MB images / 10 MB documents in the code today) (preview uses 8 images, 5 MB as placeholders).

## Code mapping

★ Proposed `MultiFileUploader` in `src/ui/multi-file-uploader.tsx`: `kind: 'images' | 'documents'`, `value: UploadItem[]`, `onChange`, `accept`, `maxFiles`, `maxSizeBytes`, `requireAlt = kind === 'images'`, `onUpload(file) => Promise<{ fileId }>`, `onRetry(id)`, `onRemove(id)`, `onReorder(from, to)`, `disabled?`, `disabledReason?`, `error?`. `UploadItem = { id, name, sizeBytes, status: 'uploading' | 'done' | 'error', progress?, error?, imageAltFa? }`.

## Do / Don't

- Do require alt text per image before publishing, and keep the example in the error.
- Do keep failed rows in the list with a retry; never drop them silently.
- Do mark the first image as «تصویر اصلی» and let people reorder.
- Don't block the rest of the form while files upload; block only publish.
- Don't ask for alt text on PDFs; ask for the document type instead.
