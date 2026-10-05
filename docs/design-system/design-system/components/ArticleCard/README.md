# ArticleCard

A magazine item — article, news, announcement or club post — in one of four layouts: vertical (news grid), horizontal (featured list, side columns), compact (no image) and feature (the one highlighted story in a section).

Use wherever content items are listed: home «تازه‌ها», `/articles`, `/news`, `/announcements`, related columns, club pages. Not for the lead story (`Hero`) and not for the full article (`ContentDetail` + `RichText`).

## Anatomy

1. Image — RecordImage 16:9 (vertical, feature) or 4:3 thumb 120px (horizontal); none in compact.
2. CategoryTag — on the image (`.hz-tag--on-media`) in vertical/feature; inline before the title in horizontal/compact.
3. Kicker (feature only) — `categoryFa` in `text-brand` («میکروچیپ»).
4. Title — Bold 17/28 (vertical), 16/27 (horizontal/compact), 22/36 → 24/38 (feature); 2 lines, feature 3.
5. Summary — 14/24 `text-secondary`, 2 lines; omitted in compact.
6. Meta — `ReadTime`: clock + «۶ دقیقه مطالعه», date, author (feature).

## CSS API

| Class | Role |
|---|---|
| `.hz-article` | Vertical (default): image, then body; no box |
| `.hz-article--horizontal` | Row with 120px 4:3 thumb at the start, bottom rule |
| `.hz-article--compact` | No image, bottom rule |
| `.hz-article--feature` | White bordered card, full-bleed image, larger title |
| `.hz-article__body` · `__kicker` · `__title` · `__summary` | Body parts (title and summary are line-clamped) |
| `.hz-tag--on-media` | Tag pinned to the image's top start corner |

Addition (`css-additions/ArticleCard.css`): `.hz-article__body > .hz-tag` keeps an inline tag at its own width.

```html
<a class="hz-article hz-article--horizontal" href="/articles/c-56536">
  <div class="hz-media"><div class="hz-media__empty"><img src="…symbol" alt=""></div></div>
  <div class="hz-article__body">
    <span class="hz-tag">آموزش</span>
    <h3 class="hz-article__title">برگه ثبتی؛ از نمونه‌گیری تا صدور</h3>
    <p class="hz-article__summary">گام‌به‌گام: مراجعه به دامپزشک معتمد، نمونه‌گیری خون، پرداخت و دریافت برگه ثبتی.</p>
    <div class="hz-meta"><span class="hz-meta__item"><svg …clock…></svg>۷ دقیقه مطالعه</span><time class="hz-meta__item" datetime="2026-09-21">۳۰ شهریور ۱۴۰۵</time></div>
  </div>
</a>
```

## Tokens

`bg-surface` + `border-default` (feature), `border-default` (row rules), `bg-media-empty`, `bg-brand-subtle` + `text-brand` (tag, kicker), `text-primary`, `text-secondary`, `icon-default`, `radius-xl` / `radius-lg` (thumb), `focus-ring`.

## Variants & sizes

- **Vertical** — grid of 3–4 in «تازه‌ها»; 2 on tablet; 1 on mobile.
- **Horizontal** — stacked lists (FeaturedList, related column, mobile «تازه‌ها»).
- **Compact** — announcements (they have no photo) and dense lists.
- **Feature** — one per section, 7/12 wide beside a horizontal list. It stays **white** even inside the landing band (`bg-band` cream is for the band itself, SiteShell landing pages only).

## States

- **Default** · **hover** (pointer): proposed title underline; feature card `border-control` — not yet in bundle.css.
- **Focus-visible:** ring around the whole link (vertical uses `radius-xl` on the ring).
- **Loading:** skeleton in the same layout (16:9 or thumb + 2 lines).
- **Empty list:** section hidden on landing pages; `EmptyState` on `/articles` with filters.
- **Missing image:** symbol empty state keeps the frame; announcements use compact instead.
- **Long Persian text:** titles clamp at 2 lines with «…» (feature 3) and carry the full title in `title`; the 111-character announcement title fits 2 lines in compact at 500px.

## Mobile ↔ desktop

- <768: vertical cards 1-up; «تازه‌ها» switches to horizontal rows; thumb 120px stays.
- 768–1023: vertical 2-up; feature full width.
- ≥1024: vertical 4-up (3 with a side column); feature 7/12 + horizontal list 5/12.

## RTL & LTR

Thumb and on-media tag at the start; meta items flow start → end. Clock is never mirrored. Dates Jalali with Persian digits; `<time datetime>` holds the ISO value.

## Accessibility

- One `<a>` per card; the title is a heading (`h3` under the section `h2`).
- Image `alt=""` inside the link when the title says it all; feature/hero images use `altFa`.
- Tag text is part of the link name («خبر»), so the kind is announced.

## Data

`content.json`: `kind`/`kindFa`, `categoryFa`, `titleFa`, `summaryFa`, `readTimeFa` (derived from `bodyFa` length — not stored), `publishAt`, `authorFa`, `image` (+ `altFa`), `slug`.

## Code mapping

Today `ContentList` (plain list). ★ Proposed `ArticleCard` in `src/content/` with `item: ContentItem`, `layout: 'vertical' | 'horizontal' | 'compact' | 'feature'`, `headingLevel?`. Uses `CategoryTag`, `ReadTime`, `RecordImage`.

## Do / Don't

- Do pick the layout by context, not by content length.
- Do show the kind (خبر · آموزش · اطلاعیه) on every card.
- Don't put more than one feature card per section.
- Don't make the feature card cream; cream belongs to landing feature cards and the band.
