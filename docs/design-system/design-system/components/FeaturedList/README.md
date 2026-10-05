# FeaturedList

«منتخب همزیست» — the editors' picks: a small SectionHeader and four horizontal ArticleCards in a white card, beside the Hero on desktop and under it on mobile.

Use once per editorial landing, paired with `Hero` in `.hz-story-row`. For "related" items on an article page use `RelatedColumn`; for a full list use the ArticleCard grid.

## Anatomy

1. Card — `.hz-card` (white, `border-default`, `radius-xl`), padding 16 → 24.
2. SectionHeader `--sm` — 3px `accent-bar` + «منتخب همزیست» (16/26 Bold); no «مشاهده همه».
3. List — `<ul>` of 4 `ArticleCard --horizontal`: thumb, tag, title (2 lines), summary (2 lines), ReadTime.
4. Rules — `border-default` between items; none above the first or below the last.

## CSS API

Addition (`css-additions/FeaturedList.css`):

| Class | Role |
|---|---|
| `.hz-featured` | On the `.hz-card`: flex column |
| `.hz-featured__list` | Unstyled list; trims the first item's top padding and the last item's bottom padding and rule |

```html
<section class="hz-card hz-featured" aria-labelledby="ft">
  <div class="hz-section-header hz-section-header--sm">
    <h2 class="hz-section-header__title" id="ft"><span class="hz-section-header__bar" aria-hidden="true"></span>منتخب همزیست</h2>
  </div>
  <ul class="hz-featured__list">
    <li><a class="hz-article hz-article--horizontal" href="…">…</a></li>
    …
  </ul>
</section>
```

## Tokens

`bg-surface`, `border-default`, `accent-bar`, `radius-xl`, plus the ArticleCard tokens (`bg-media-empty`, `bg-brand-subtle`, `text-brand`, `text-secondary`).

## Variants & sizes

- **Side column** (≥1024) — 5/12 of the row, stretched to the Hero's height.
- **Stacked** (<1024) — full width under the Hero.
- Item count: 4 by design; 2–3 render as is; 0–1 → hide the section (one pick is not a list).

## States

- **Default**; item hover/focus as `ArticleCard` (focus ring around each link).
- **Loading:** header + three horizontal skeleton rows.
- **Empty:** hidden (see above).
- **Long Persian text:** titles and summaries clamp at 2 lines; at 390px the text column is ~190px, so titles usually take 2 lines — still within the clamp.

## Mobile ↔ desktop

- <768: under the Hero, full width, card padding 16; each item is a ≥ 90px tap target.
- 768–1023: same, wider text column.
- ≥1024: beside the Hero in `.hz-story-row`, equal height.

## RTL & LTR

Header bar at the start; thumbs at the start of each row. Nothing is mirrored except through ArticleCard.

## Accessibility

- `<section>` labelled by its `h2`; items are `<li>` so the count is announced.
- Items are `h3`. The accent bar is `aria-hidden`.

## Data

`content.json` items flagged as featured by the content admin (`/content`); fields as `ArticleCard`. Stories in the Hero carousel are not repeated here.

## Code mapping

★ New — proposed `FeaturedList` in `src/public/` with `items: ContentItem[]` (max 4), `title = 'منتخب همزیست'`. Renders `ArticleCard layout="horizontal"`.

## Do / Don't

- Do keep it in a white card, even on the landing page — not `bg-feature` cream.
- Do keep four items and the same layout for each.
- Don't add «مشاهده همه» — picks are not a feed.
- Don't repeat a Hero story in the list.
