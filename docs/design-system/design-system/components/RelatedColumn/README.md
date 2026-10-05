# RelatedColumn

«مطالب مرتبط» — a white card with a small SectionHeader and up to four compact ArticleCards, beside the article on desktop and after it on phones and tablets.

Use it once on each content detail page (`/articles/[slug]`, news, announcements, club posts) and on public detail pages that link to magazine items (breed profile, vet profile). For the editors' picks on landings use FeaturedList; for full lists use the ArticleCard grid. Do not render it when there is nothing related.

## Anatomy

1. Card — `.hz-card` (white, `border-default`, `radius-xl`, padding 16 → 24).
2. SectionHeader `--sm` — 3px `accent-bar` + «مطالب مرتبط».
3. List — `<ul class="hz-related__list">` of 1–4 `ArticleCard --compact` (CategoryTag, title clamped to 2 lines, ReadTime + date). Rules between items; none above the first or under the last.
4. Foot (optional) — «همه آموزش‌ها ←» (`TextLink --standalone`, `arrow-right` mirrored) to the current category, after a `border-subtle` hairline.

## CSS API

css-additions `RelatedColumn.css` (+ `.hz-reading` from ContentDetail):

| Class | Role |
|---|---|
| `.hz-related` | on the `.hz-card`: flex column |
| `.hz-related__list` | unstyled list; trims first item's top padding and last item's bottom padding and rule |
| `.hz-related__foot` | category link row with a hairline |
| `.hz-related__skeleton` | loading row (pill + two text lines) |
| `.hz-reading__aside` | the side column: 280–340 wide and sticky (`header-site` + 24) from 1024 |

```html
<div class="hz-reading__aside">
  <aside class="hz-card hz-related" aria-labelledby="rel">
    <div class="hz-section-header hz-section-header--sm"><h2 class="hz-section-header__title" id="rel"><span class="hz-section-header__bar" aria-hidden="true"></span>مطالب مرتبط</h2></div>
    <ul class="hz-related__list"><li><a class="hz-article hz-article--compact" href="…">…</a></li>…</ul>
    <div class="hz-related__foot"><a class="hz-link hz-link--standalone" href="/articles?category=…">همه آموزش‌ها …</a></div>
  </aside>
</div>
```

## Tokens

`bg-surface`, `border-default` (card, item rules), `border-subtle` (foot hairline), `accent-bar`, `radius-xl`, `text-brand` (tag, link), `text-secondary` (meta), `bg-disabled` (skeleton), `header-site` (sticky offset).

## Variants & sizes

- **Side column** (≥1024): 280–340px, sticky while the article scrolls; items compact (no image) because a 120px thumb leaves too little room for a two-line title.
- **After the article** (<1024): full width of the reading column, before the footer; same compact items, at most 3 on phones.
- With or without the foot link (no link when the category page does not exist, e.g. club posts).

## States

- Default · item hover (pointer: card lift is not used; title underline from ArticleCard) · **focus-visible** ring on each item link and the foot link (preview: «همه اطلاعیه‌ها»).
- **Loading** — card and header render immediately; three skeleton rows; `aria-busy="true"`.
- **Empty** — the column is not rendered at all; the reading column stays at 720 and the grid keeps its gap (no empty card, no «مطلبی نیست»).
- **One item** — the card shrinks to fit; no filler.
- **Long Persian text** — titles clamp at 2 lines with «…» and keep the full title in `title`; the 111-character announcement title is the test case.

## Mobile ↔ desktop

| | <768 | 768–1023 | ≥1024 |
|---|---|---|---|
| Position | after the article, before the footer | same | side column at the end edge |
| Items | 3 | 4 | 4 |
| Sticky | no | no | yes (`header-site` + 24) |
| Card padding | 16 | 16 | 24 |

Item links are ≥ 44px tall at every width.

## RTL & LTR

The aside sits at the inline end (left in RTL). Arrow in the foot link is `arrow-right` + `hz-icon--mirror`. Dates use Persian digits; meta items are separated by the flex gap, never «·» between digits.

## Accessibility

`<aside aria-labelledby>` with an `h2` — a complementary landmark after the `article` in DOM order (it is reached after the article on every width). Item titles are `h3`. The whole item is one link; its accessible name is title + meta, kept short. Loading uses `aria-busy`; skeletons are not announced.

## Data

`content.json` items: `kindFa` (tag), `titleFa`, `readTimeFa`, `publishAt`. Selection (proposal): same `categoryFa` first, then shared `tags`, newest first, excluding the current slug and non-`PUBLISHED` items; at most 4. Preview: related to the microchip article — برگه ثبتی؛ از نمونه‌گیری تا صدور · دامپزشک معتمد کیست و چه نقشی دارد؟ · شجره‌نامه سگ را چطور بخوانیم؟ · مجوز جفت‌گیری: شرایط، مدارک و زمان‌بندی.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/public/related-column.tsx`: `RelatedColumn({ groups: { titleFa, items: RelatedItem[] }[] })` — grouped, and empty groups are not rendered. Keep.


`src/public/related-column.tsx` — `RelatedColumn`: keep its existing props. Render each item with `ArticleCard layout="compact"`; add optional `moreHref` / `moreLabel` (proposed) for the foot link; return `null` for an empty list.

## Do / Don't

- Do hide the column when the list is empty.
- Do keep items compact in the side column; images belong in the article.
- Don't add ads, CTAs or newsletter boxes to this column.
- Don't repeat the current article or show unpublished items.
