# ReadTime

Reading-time meta — a clock icon and «۶ دقیقه مطالعه» — shown with the publish date inside the shared `.hz-meta` line of every editorial item.

Use on ArticleCard, Hero, FeaturedList and the article header. Not for countdowns or deadlines (use the date with `calendar-blank` / `.hz-age`), and not on non-editorial records.

## Anatomy

1. `.hz-meta` — inline flex line, 12/20 `text-secondary`, wraps with 6px × 14px gaps.
2. ReadTime item — `clock` (16px, `icon-default`) + «N دقیقه مطالعه».
3. Date item — `<time datetime="ISO">` Jalali «۶ مهر ۱۴۰۵».
4. Optional items — author («نگار رستمی»), reviewed date («بازبینی: ۲۹ شهریور ۱۴۰۵»).

## CSS API

Bundle: `.hz-meta`, `.hz-meta__item`, `.hz-icon--xs`.

```html
<div class="hz-meta">
  <span class="hz-meta__item"><svg class="hz-icon hz-icon--xs" viewBox="0 0 256 256" aria-hidden="true">…clock…</svg>۶ دقیقه مطالعه</span>
  <time class="hz-meta__item" datetime="2026-09-28">۶ مهر ۱۴۰۵</time>
</div>
```

## Tokens

`text-secondary`, `icon-default` (via `currentColor`), type `caption` 12/20.

## Variants & sizes

- **Time + date** (default) · **time only** (FeaturedList, tight rows) · **with author** (feature, article header) · **with reviewed date** (article page).
- One size (caption). Items keep order: time, date, author, reviewed.

## States

Static text: no hover, focus or disabled. **Missing data:** no `publishAt` → date item omitted; read time is always computed, minimum «۱ دقیقه مطالعه». **Long values:** «۱۲ دقیقه مطالعه» is the longest sample; in a narrow column items wrap to the next line but never break inside themselves.

## Mobile ↔ desktop

Same at every breakpoint; it wraps instead of truncating.

## RTL & LTR

Items flow start → end; the clock is never mirrored. Persian digits for minutes and dates; `datetime` stays ISO. Do not join items with «·» next to Persian digits — it reads as «۰»; the flex gap separates them.

## Accessibility

- The icon is `aria-hidden`; the text says «دقیقه مطالعه».
- Dates use `<time datetime>` so assistive tech and crawlers get the real date.
- Inside a card link the meta is part of the link's name; keep it short.

## Data

`content.json`: `readMinutes` → «N دقیقه مطالعه» (`readTimeFa`), **derived at render from `bodyFa` length — not stored in `content_item`**; `publishAt` (`displayFa`/`longFa`, ISO); `authorFa`; `reviewedOn` (nullable). Preview pairs are real: «۶ دقیقه مطالعه» · ۶ مهر ۱۴۰۵ (microchip article), «۳ دقیقه مطالعه» · ۸ مهر ۱۴۰۵ (show news).

## Code mapping

★ New — proposed `ReadTime` in `src/content/` with `minutes: number`, `publishAt?: Date`, `author?: string`, `reviewedOn?: Date`; formats with `Intl` `fa-IR-u-ca-persian` (`Asia/Tehran`). Needs a shared `readingMinutes(bodyFa)` helper.

## Do / Don't

- Do compute minutes from the body; don't ask authors to type it.
- Do keep the long Jalali form («۶ مهر ۱۴۰۵») in editorial meta; the numeric form «۱۴۰۵/۰۷/۰۶» is for tables.
- Don't colour it orange or bold it — it is secondary information.
