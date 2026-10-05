# ContentDetail

The full article page body — header, lead image with caption, the RichText long-form body and the article foot — set in the dedicated long-form type scale inside the 720px reading measure.

Use it on `/articles/[slug]` (and the same route shape for news, announcements and club posts) inside SiteShell, and as the author's live preview (`--compact`). Not for cards or lists (ArticleCard), and not for system help text inside apps (use the interface type scale). RichText styles only what an author can produce; it is never used for UI copy.

## Anatomy

1. **Head** — breadcrumbs (≥768; PageHeader back link below) · CategoryTag «آموزش · میکروچیپ» (link to the category) · `article-title` (36/56 ExtraBold, phone 28/44) · lead = `summaryFa` (18/32 `text-secondary`, phone 16/28) · byline row between two `border-subtle` rules: author (initial + name + role) at the start, ReadTime + date at the end.
2. **Lead figure** — RecordImage 16:9 + caption (13/22) + credit «عکس: …» (600). Omitted entirely when `image` is null (announcements) — never an empty frame at the top of an article.
3. **RichText body** (`.hz-prose`) — paragraphs 17/34 with 1.25em spacing; h2 24/40 (phone 20/34) with 48 above; h3 20/34 (phone 18/32) with 32 above; ordered lists with Persian numerals («۱.»); bullet lists; pull quote (20/36 Medium, 4px `accent-bar` at the start, attribution 14/24); figure + figcaption; links; inline identifiers in `bdi`; the source line («منبع: …») after a hairline.
4. **Foot** — tag list (neutral CategoryTags) and «بازبینی محتوا: ۲۹ شهریور ۱۴۰۵» when `reviewedOn` exists.

## CSS API

css-additions `ContentDetail.css`:

| Class | Role |
|---|---|
| `.hz-reading`, `__main`, `__aside` | page grid: reading column (≤ `container-reading`) + side column 280–340 from 1024 (sticky under the 80px header); stacked below |
| `.hz-content-detail` | article stack, max 720 |
| `__head`, `__title`, `__lead`, `__byline`, `__author`, `__author-role`, `__foot`, `__reviewed` | header and foot parts |
| `.hz-figure`, `__caption`, `__credit` | lead figure (the same styles apply to `figure` inside RichText) |
| `.hz-prose` | RichText output: `p h2 h3 ul ol li blockquote(p, footer) figure figcaption a strong hr` — element selectors, because author content carries no classes |
| `.hz-prose__source` | source/citation line |
| `.hz-content-detail--compact` | forces phone type sizes at any width (author preview pane, narrow columns) |

```html
<div class="hz-reading">
  <article class="hz-reading__main hz-content-detail" aria-labelledby="t">
    <header class="hz-content-detail__head">… <h1 class="hz-content-detail__title" id="t">…</h1> <p class="hz-content-detail__lead">…</p> …</header>
    <figure class="hz-figure"><div class="hz-media hz-media--16x9"><img …></div><figcaption class="hz-figure__caption"><span>…</span><span class="hz-figure__credit">عکس: …</span></figcaption></figure>
    <div class="hz-prose"><p>…</p><h2>…</h2><ol><li>…</li></ol><blockquote><p>…</p><footer>…</footer></blockquote>…<p class="hz-prose__source">منبع: …</p></div>
    <footer class="hz-content-detail__foot">…</footer>
  </article>
  <div class="hz-reading__aside"><!-- RelatedColumn --></div>
</div>
```

## Tokens

`text-primary`, `text-secondary`, `text-brand` (links), `accent-bar` (quote bar), `icon-default` (bullet markers), `border-subtle` (byline rules, source rule), `border-default` (foot rule), `bg-media-empty`, `radius-xl` (images), `container-reading` 720, `header-site` (sticky offset). Type: `article-title`, `article-h2`, `article-body`, `article-quote`, `article-caption` (values are in the CSS; there are no CSS variables for type).

## Variants & sizes

- **Article / news / club post** — with lead image. **Announcement** — no image, often long title; same structure.
- **Default** (responsive) · **`--compact`** (phone sizes everywhere — for `/author/content/[id]` preview and any column under ~480px).
- Reading column max 720 at every width; on phones it is the full width minus 16px gutters.

## States

- Default · link hover (pointer: underline stays, colour unchanged) · **focus-visible** ring on every link/tag (preview: the «اطلاعیه» tag).
- **Loading** — skeleton: tag pill, two title lines, 16:9 media block, three text lines; `aria-busy` on the article.
- **Missing image** — the lead figure is not rendered; figures inside the body use the RecordImage empty state with the alt text.
- **Long Persian text** — the 111-character announcement title is shown in full (no clamp on the detail page); long words wrap (`overflow-wrap: anywhere`).
- **Not published / hidden** — the route shows PageStates (not this component). Author preview of a draft adds an Alert above the article (outside this component).
- Empty body: never — publishing requires `bodyFa`.

## Mobile ↔ desktop

| | <768 | 768–1023 | ≥1024 |
|---|---|---|---|
| Title | 28/44 | 28/44 | 36/56 |
| Lead | 16/28 | 18/32 | 18/32 |
| h2 · h3 · quote | 20/34 · 18/32 · 18/32 | 24/40 · 20/34 · 20/36 | same |
| Body | 17/34 | 17/34 | 17/34, max 720 |
| Related | under the article | under the article | side column 280–340, sticky |
| Breadcrumbs | back link | crumbs | crumbs |

## RTL & LTR

Quote bar and list markers sit at the inline start; list indentation is `padding-inline-start`. Persian numerals come from `list-style-type: persian` (the LTR build switches to `decimal`). Identifiers and microchip numbers inside text are `<bdi dir="ltr">`. No italics anywhere (Persian has none; `cite`/`em` are normalised).

## Accessibility

`<article aria-labelledby>` with the only `h1`; RichText headings start at `h2` (an author `h1` should be demoted to `h2` on render — verify in RichText). Lists are real `ol`/`ul`; quotes are `blockquote` with the attribution in `footer`. Images need `altFa` (mandatory in the model); decorative empty-state symbols are `alt=""`. `<time datetime>` on dates. Links are underlined (not colour only). Reading width ≤ 720 keeps lines near 68 characters.

## Data

`content.json`: `kindFa`, `categoryFa`, `titleFa`, `summaryFa` (lead), `readMinutes` (derived from `bodyFa`), `publishAt`, `authorFa`, `reviewedOn` (nullable), `image` (`altFa`, nullable), `tags`. `bodyFa` is not in the sample pack; the preview body is written for the microchip article (c-372435) using real ids (`PET-8JDUN4GH`, `364416562459223`). Not in the model today: image caption, image credit and source line — proposed optional fields `imageCaptionFa`, `imageCreditFa`, `sourceFa`.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/content/public-views.tsx`: `ContentDetail({ kind: 'ARTICLE' | 'NEWS' | 'ANNOUNCEMENT', rawSlug })` (server component that loads its own data) and `src/content/rich-text.tsx`: `RichText({ source, className })`. Keep both APIs; only the rendered markup and classes change.


`src/content/` — `ContentDetail` and `RichText`: keep their existing props. RichText keeps parsing the code's own formatting language (`BodyEditor` output); only the rendered element set above is styled, wrapped in `.hz-prose`. Proposed additions: `ContentDetail` `compact?: boolean` (author preview), `related?: ContentItem[]` rendered into `.hz-reading__aside` via `RelatedColumn`.

## Do / Don't

- Do keep everything inside the 720 measure, including the lead image.
- Do show the full title on this page — clamping is for cards only.
- Don't use orange for anything but links and the quote bar; no coloured boxes or call-outs inside the body.
- Don't let RichText styles leak into UI: never put `.hz-prose` around forms, tables of fees or app copy.
- Don't show an empty image frame when an article has no image.
