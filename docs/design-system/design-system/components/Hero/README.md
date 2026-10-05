# Hero

The magazine's lead story — a large image, CategoryTag, a big headline, summary, ReadTime and a manual carousel of up to four stories — set beside «منتخب همزیست» on desktop.

Use once per editorial landing page (`/` magazine section, `/articles`, `/news`, `/associations/[slug]`). Not for the home page's product intro «ثبت رسمی و پیگیری سگ‌ها، در یک‌جا» — that is the approved text-and-image `.hz-hero` in SiteShell — and not inside PublicShell or OpsShell.

## Anatomy

1. Image — 16:9 RecordImage. Desktop: inset in the panel (12px padding, `radius-sm` = 20 − 12). Mobile: full width, `radius-xl`.
2. CategoryTag — `kindFa` («آموزش», «خبر», «اطلاعیه», «نوشته کلاب»), inline `.hz-tag`.
3. Headline — article-title style, ExtraBold 28/44 (mobile) → 36/56 (≥1024), max 3 lines.
4. Summary — 16/28 → 18/32, `text-secondary`, max 3 lines.
5. Foot — `ReadTime` meta (time + date) at the start; carousel at the end: previous / dots / next.
6. Layout partner — `FeaturedList` in the same row (`.hz-story-row`).

## CSS API

All in `css-additions/Hero.css` (new block, does not touch the bundle's `.hz-hero`):

| Class | Role |
|---|---|
| `.hz-story` | The story. Mobile: no box. ≥768: white panel, `border-default`, `radius-xl` |
| `.hz-story__body` · `__title` · `__summary` · `__foot` | Text column, headline (link inside), summary, foot row |
| `.hz-carousel` | Prev `.hz-icon-btn--outline` + `.hz-carousel-dots` + next |
| `.hz-story--compact` | Forces the mobile form at any viewport (narrow columns, app web views) |
| `.hz-story-row` | Grid: 1 column; ≥1024 `7fr 5fr` — Hero at the start, FeaturedList at the end, equal height |

```html
<div class="hz-story-row">
  <section class="hz-story" aria-roledescription="carousel" aria-label="داستان‌های اصلی مجله">
    <div class="hz-media hz-media--16x9"><img src="…" alt="…"></div>
    <div class="hz-story__body" role="group" aria-roledescription="slide" aria-label="۱ از ۴">
      <span class="hz-tag">آموزش</span>
      <h2 class="hz-story__title"><a href="/articles/c-372435">میکروچیپ چیست و چرا فقط یک بار کاشته می‌شود؟</a></h2>
      <p class="hz-story__summary">…</p>
      <div class="hz-story__foot">
        <div class="hz-meta">…ReadTime…</div>
        <div class="hz-carousel">…prev · dots · next…</div>
      </div>
    </div>
  </section>
  <section class="hz-card hz-featured">…FeaturedList…</section>
</div>
```

## Tokens

`bg-surface`, `border-default`, `bg-media-empty`, `text-primary`, `text-secondary`, `bg-brand-subtle` + `text-brand` (tag), `border-brand` (active dot), `border-control` (arrow buttons), `radius-xl`, `radius-sm`, `focus-ring`, `duration-slow` (slide change).

## Variants & sizes

- **Desktop panel** (≥768) and **mobile/compact** (no box). One size per breakpoint.
- **With image** / **without image** (announcements have none) — symbol empty state keeps the 16:9 frame so the carousel does not jump.
- Single story → hide `.hz-carousel` entirely.

## States

- **Default** · **hover** (pointer): arrow buttons `action-secondary-hover`; headline link underlines (proposed).
- **Focus-visible:** ring on the headline link, arrows and each dot.
- **Active slide:** dot widens to 24px in `border-brand`, `aria-current="true"`.
- **Loading:** 16:9 skeleton + tag + two headline bars + two text lines.
- **Error / empty:** no published story → the row shows FeaturedList only; never an empty hero.
- **Long Persian text:** the 111-character announcement title from edge-cases.json clamps at 3 lines with «…»; summary at 3.

## Mobile ↔ desktop

- <768: full width, no panel; FeaturedList follows under it. Arrow buttons 44px; dots are not the only control.
- 768–1023: panel, mobile type sizes, FeaturedList below.
- ≥1024: panel 7/12 beside FeaturedList 5/12, same height; headline 36/56.

## RTL & LTR

Tag and text start-aligned; ReadTime at the start of the foot, carousel at the end. Previous = `caret-left` mirrored (points to the start), next = `caret-right` mirrored. Dot order follows reading order, so dot 1 is at the start.

## Accessibility

- Carousel pattern: `section[aria-roledescription="carousel"]` with a label; each slide `role="group" aria-roledescription="slide" aria-label="۱ از ۴"`.
- **Never autoplay** (06-motion); with `prefers-reduced-motion` the change is instant.
- Arrow buttons and dots are `<button>`s with Persian `aria-label` («داستان قبلی», «داستان ۲ از ۴»).
- Heading level from the page: `h2` under the page `h1` (or `h1` on `/articles`).

## Data

`content.json`: `kindFa`, `titleFa`, `summaryFa`, `readTimeFa` (derived from body length at render), `publishAt`, `image` (+ `altFa`), `slug`. Editors pick up to 4 stories; the rest go to FeaturedList.

## Code mapping

★ New — proposed `StoryHero` in `src/public/` with props `stories: ContentItem[]` (1–4), `headingLevel?: 2 | 1`. Uses `CategoryTag`, `ReadTime`, `RecordImage`.

## Do / Don't

- Do keep the image 16:9 with a safe area; the same image is cropped elsewhere.
- Do keep one story per slide with its own tag, headline and ReadTime.
- Don't autoplay, and don't put a primary button in the hero — the CtaBand carries the action.
- Don't use `bg-feature`/`bg-band` cream outside SiteShell landing pages; the story panel is always white.
