# Pagination

Moves through a long list page by page: numbered pages with «…» gaps and «قبلی / بعدی» at ≥768px, «قبلی / بعدی» or «نمایش بیشتر» on mobile, always with the result count.

Use it under any DataTable, CardList or article list that the server pages. The logic already exists in `src/domain/pagination.ts`; the UI is re-implemented in **15 pages** today — replace all of them with this one component. Do not use it for steps of a form (Stepper) or for carousels (CarouselDots).

## Anatomy

1. `<nav class="hz-pagination" aria-label="صفحه‌بندی …">`.
2. Count `.hz-pagination__count` ★ — «نمایش ۲۱ تا ۴۰ از ۲۳۸» at the start, numbers in `text-primary`.
3. Pages `<ul class="hz-pagination__pages">` at the end: «قبلی» step → page links → gap «…» → last page → «بعدی» step.
4. Mobile: two secondary buttons with «صفحه ۲ از ۱۲» between them, or a block «نمایش بیشتر» button under its count (`.hz-pagination__more` ★).

## CSS API

| Class | Purpose |
|---|---|
| `.hz-pagination` | Row: count at start, pages at end, wraps if needed |
| `.hz-pagination__pages` | Page list |
| `.hz-page` | Page link 36×36 (44 on coarse pointers) |
| `.hz-page[aria-current="page"]` | Current page: `bg-brand-subtle`, `border-brand`, `text-brand` Bold |
| `.hz-page--gap` | «…», not interactive |
| `.hz-page--step` ★ | «قبلی» / «بعدی» with icon; `[aria-disabled="true"]` greys it out |
| `.hz-pagination__count` ★ | Result count |
| `.hz-pagination__more` ★ | Mobile load-more block (count + button) |

★ in `tools/css-additions/Pagination.css`.

```html
<nav class="hz-pagination" aria-label="صفحه‌بندی درخواست‌ها">
  <p class="hz-pagination__count" aria-live="polite">نمایش <b>۲۱</b> تا <b>۴۰</b> از <b>۲۳۸</b></p>
  <ul class="hz-pagination__pages">
    <li><a class="hz-page hz-page--step" href="?page=1" rel="prev"><svg class="hz-icon hz-icon--xs hz-icon--mirror">…caret-left…</svg>قبلی</a></li>
    <li><a class="hz-page" href="?page=2" aria-current="page">۲</a></li>
    <li><span class="hz-page hz-page--gap" aria-hidden="true">…</span></li>
    <li><a class="hz-page hz-page--step" href="?page=3" rel="next">بعدی<svg class="hz-icon hz-icon--xs hz-icon--mirror">…caret-right…</svg></a></li>
  </ul>
</nav>
```

## Tokens

`bg-subtle` (hover) · `bg-brand-subtle` + `border-brand` + `text-brand` (current) · `text-primary` · `text-secondary` (count, gap) · `text-disabled` · `border-control` + `action-secondary` (mobile buttons) · `radius-md` · `focus-ring`.

## Variants & sizes

- **Numbered** (≥768): first, last, current ±1, gaps «…» where pages are skipped. Page 2 of 12 → «۱ [۲] ۳ … ۱۲»; page 6 → «۱ … ۵ [۶] ۷ … ۱۲»; last → «۱ … ۱۰ ۱۱ [۱۲]». At most 7 slots between the steps.
- **Prev/next** (<768): two `hz-btn--secondary` (44px) + «صفحه ۲ از ۱۲». Use where the URL must keep the page (ops queues, search results).
- **Load more** (<768): block `hz-btn--secondary` «نمایش بیشتر» under «۴۰ از ۲۳۸ مورد نمایش داده شد». Use for feeds (magazine, market, notifications). Ends with «همه ۲۳۸ مورد نمایش داده شد» and no button.
- **Single page:** when every result fits on one page, show only the range text («۱ تا ۶ از ۶ پرونده») — no page buttons, no previous/next.

## States

- **default** · **hover (pointer only)** — `bg-subtle` · **focus-visible** — `focus-ring` on the page link · **current** — `aria-current="page"`.
- **disabled** — first page: «قبلی» is `aria-disabled="true"` without `href`; last page: same for «بعدی». Never hide them (the row would jump).
- **loading** — load-more button gets `aria-busy="true"` + spinner + «در حال بارگذاری»; numbered pagination keeps its state while the table shows skeleton rows.
- **error** — load more failed: the button becomes «تلاش دوباره» and an inline Alert names the cause.
- **empty / single page** — don't render pagination; keep the count only if filters are active («۳ نتیجه»).
- **long Persian text** — labels are short and fixed; large counts use the Persian separator («۱۲٬۴۵۰»).

## Mobile ↔ desktop

- <768: prev/next or load more; buttons 44px; count centred between or above.
- 768–1023: numbered, 5 slots max (current ±1).
- ≥1024: numbered, 7 slots; 36px pages on fine pointers, 44px on coarse.

## RTL & LTR

In RTL «قبلی» sits at the **start (right)** and its arrow points **→** (outwards); «بعدی» sits at the end and points **←**. Implement as LTR glyphs + `hz-icon--mirror`: «قبلی» = `caret-left` before the text, «بعدی» = `caret-right` after the text. Page numbers use Persian digits and run start→end (۱ on the right).

## Accessibility

- `<nav aria-label>` naming the list; `aria-current="page"` on the current page; page links get `aria-label="صفحه ۳"`.
- `rel="prev"` / `rel="next"` on steps; disabled steps are not links.
- Count is a polite live region, so filtering or paging announces «نمایش ۲۱ تا ۴۰ از ۲۳۸».
- After paging, move focus to the list heading (not the top of the page); after load more, focus the first newly added item.

## Data

From `src/domain/pagination.ts`: `page`, `pageSize`, `total` → `from = (page-1)×pageSize+1`, `to = min(page×pageSize, total)`, `pageCount`. The 238 / 20 example gives 12 pages. All numbers are formatted with `toLocaleString('fa-IR')`.

## Code mapping

★ New UI over existing logic. Proposed `src/ui/pagination.tsx`: `Pagination` — `page`, `pageSize`, `total`, `hrefFor(page)` (links, SSR-friendly) or `onPageChange`, `mode: 'numbered' | 'prevNext' | 'loadMore'` (default: numbered ≥768, prevNext below), `onLoadMore`, `loading`, `label` (aria-label). Window computation stays in `src/domain/pagination.ts`.

## Do / Don't

- Do always show the count with the pages.
- Do keep disabled steps in place.
- Don't hand-pick `caret-right` for «قبلی» in RTL markup — mirror the LTR glyph.
- Don't use infinite scroll without a «نمایش بیشتر» button; footers must stay reachable.
