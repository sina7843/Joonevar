# DocumentPreview

A viewer for private documents (national card, licence, payment slip) with a page switcher, zoom and rotate, and a standing «مدرک خصوصی» notice — never a download.

Use it in the evidence column of DecisionDesk, in `ReviewPanel` (vet and centre review) and anywhere an operator must read an uploaded document. Don't use it for public images (listing photos, articles): those are RecordImage. Don't add a download, print or "open in new tab" control; the file is served only inside the desk.

## Anatomy

1. **Head**: title «کارت ملی · علی رضایی» (Bold 15) + page switcher (prev caret · «۱ از ۲» · next caret). The switcher is hidden for a single-page file.
2. **Frame** (`.hz-docview__frame` > `.hz-doc`): the document fitted inside a `bg-disabled` 16:10 box, `radius-lg`. The image is never cropped at 100%.
3. **Toolbar** (`.hz-doc__tools`, bottom inline-end of the frame): کوچک‌نمایی · readout «۱۰۰٪» (click = back to fit) · بزرگ‌نمایی | چرخش ۹۰ درجه · تمام‌صفحه.
4. **Thumbnails** (optional, multi-page): 88px buttons «روی کارت» «پشت کارت»; the current one is brand-subtle.
5. **Meta line**: `.hz-doc__private` «مدرک خصوصی — فقط در میز تصمیم، بدون دانلود» (lock icon) + upload date and size.

## CSS API

Bundle: `.hz-doc`, `.hz-doc__tools`, `.hz-doc__private`, `.hz-icon-btn--sm`, `.hz-spinner--lg`, `.hz-btn--secondary`.
Additions (`tools/css-additions/DocumentPreview.css`): `.hz-docview` `__head` `__title` `__pager` `__frame` `__zoom` `__sep` `__thumbs` `__thumb` `__thumb-img` `__meta`; `.hz-doc--zoomed` (grab cursor), `.hz-doc--full` (fullscreen fill), `.hz-doc--missing` (dashed empty frame), `.hz-doc__status` (+ `--error`).

```html
<figure class="hz-docview" aria-labelledby="dv-t">
  <div class="hz-docview__head"><h3 class="hz-docview__title" id="dv-t">کارت ملی · علی رضایی</h3>
    <span class="hz-docview__pager">…prev · <span aria-live="polite">۱ از ۲</span> · next…</span></div>
  <div class="hz-docview__frame">
    <div class="hz-doc"><img src="…private route…" alt="روی کارت ملی علی رضایی" draggable="false"></div>
    <div class="hz-doc__tools" role="toolbar" aria-label="ابزار مدرک">…</div>
  </div>
  <figcaption class="hz-docview__meta"><span class="hz-doc__private">…</span><span>بارگذاری ۷ مهر ۱۴۰۵، ۱٫۲ مگابایت</span></figcaption>
</figure>
```

## Tokens

`bg-disabled` (frame) `bg-subtle` `bg-surface` (toolbar, thumb) `bg-brand-subtle` + `border-brand` + `text-brand` (current page) `border-default` `border-subtle` (toolbar separator) `icon-default` `text-secondary` `status-error-text` (load error) `action-secondary-hover` `radius-lg` `radius-md` `radius-sm` `radius-xs` `focus-ring`.

## Variants & sizes

- **Image** (JPG/PNG of a card) and **PDF** (licence, several pages; the head shows «۲ از ۳»).
- **Single / multi page**: thumbnails only when there are 2+ pages and room (≥768).
- **Inline** (in the desk, 16:10) and **fullscreen** (`.hz-doc--full` inside a Modal at 100% of the viewport, same toolbar plus «بستن»).
- Zoom steps: ۱۰۰ (fit) · ۱۵۰ · ۲۰۰ · ۳۰۰ درصد. Rotation: 0 · 90 · 180 · 270, clockwise only.

## States

- **Default**: fit (100%); zoom-out disabled.
- **Zoomed**: `.hz-doc--zoomed`, the image pans by drag or arrow keys; zoom-in disabled at 300%.
- **Rotated**: the rotate button shows `aria-pressed="true"` and a subtle background; the caption says «چرخانده‌شده ۹۰°». Rotation is view-only; the file is unchanged.
- **Hover** (pointer): tools and thumbs tint `action-secondary-hover` / `border-control`.
- **Focus-visible**: ring on each tool and thumb; the frame itself is focusable when zoomed (for arrow-key pan).
- **Loading**: `aria-busy`, large spinner + «مدرک در حال بارگذاری است». Never a blank grey box.
- **Error**: `role="alert"`, «مدرک باز نشد» + «تلاش دوباره».
- **Empty / missing**: dashed frame «پشت کارت ملی بارگذاری نشده است» + what the operator can do («نیازمند اصلاح»).
- **Long Persian text**: the title wraps (centre names run to three lines); the pager drops to the next line and never shrinks.

## Mobile ↔ desktop

- **<768**: full width, no thumbnails; the toolbar moves into a row under the frame with 44px buttons (as in DecisionDesk mobile); pinch-zoom works inside the frame; «تمام‌صفحه» opens the fullscreen variant.
- **768–1023**: same as desktop, one document per row.
- **≥1024**: two documents side by side in `.hz-desk__docs`; the toolbar overlays the frame.
- Coarse pointers: `.hz-icon-btn--sm` and the zoom readout grow to `control-md` (44px).

## RTL & LTR

Prev page = `caret-left` + `hz-icon--mirror` (points to the start), next = `caret-right` + mirror. `magnifying-glass-plus/-minus`, `arrow-clockwise`, `corners-out`, `lock-simple`, `image-broken` are not mirrored (rotation is physical and stays clockwise). The toolbar sits at the inline end (left in RTL). Latin text in meta («PDF», file names) goes in `<bdi>`.

## Accessibility

- `figure` labelled by the title; image `alt` names side and person («روی کارت ملی علی رضایی»).
- Toolbar `role="toolbar"` with Persian `aria-label`s; the readout button says «بزرگ‌نمایی فعلی؛ بازگشت به اندازه صفحه».
- Page count is `aria-live="polite"`. Keyboard: `+`/`-` zoom, `0` fit, `R` rotate, arrows pan when zoomed, `PageUp/PageDown` switch page.
- Fullscreen is a Modal: focus trap, Escape closes, focus returns to «تمام‌صفحه».

## Data

From the case: `files[]` with `kind` (NATIONAL_CARD_FRONT/BACK, LICENCE…), `mime`, `pages`, `uploadedAt`, `sizeBytes`, served from a private, signed, short-lived route. Labels per `kind` («روی کارت»). Size in Persian units («۹۸۰ کیلوبایت»، «۱٫۲ مگابایت»). A missing required kind renders the empty frame, never a hole.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/vets/review-forms.tsx`: `DocumentPreview({ fileId, labelFa, testId })` (today a `<details>` with an iframe) and `ReviewPanel({ review, isSuperadmin })`. Keep; add `pages?` and zoom.


Existing `DocumentPreview` and `ReviewPanel` in `src/vets/review-forms.tsx` — keep their current props as in code. Add ★ props: `pages?: {src, label}[]`, `initialPage = 0`, `zoomSteps = [1, 1.5, 2, 3]`, `allowRotate = true`, `allowFullscreen = true`, `onError?`. No `downloadable` prop: download is not offered.

## Do / Don't

- Do keep «مدرک خصوصی — فقط در میز تصمیم، بدون دانلود» visible under every private document.
- Do fit the whole document at 100% so nothing is cropped before the operator zooms.
- Do say what is missing and what to do, in the frame.
- Don't add download, print, share or right-click save affordances; serve with `Content-Disposition: inline` and no cache.
- Don't rotate the stored file; rotation is per viewer and per session.
