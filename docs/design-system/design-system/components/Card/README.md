# Card

A white, 1px-bordered box with `radius-xl` corners that groups one record, one task or one block of related content.

Use it for any panel in PublicShell and OpsShell (record summary, open requests, membership, service tiles) and for editorial blocks in SiteShell. Do not nest cards inside cards (use `subtle` or a `hz-cardlist__item` inside instead), and never add a shadow — direction A structures with lines.

## Anatomy

1. Container `.hz-card` — `bg-surface`, `border-default`, `radius-xl`.
2. Optional **CardHeader** `.hz-card__header` — title (`.hz-card__title`, 16/26 Bold) at the start, one action at the end (TextLink «مشاهده همه ←», a StatusBadge, or an icon button).
3. Body — any content; spacing comes from the children.
4. Optional footer `.hz-card__footer` — `border-subtle` hairline on top; meta at the start, one action at the end.
5. In `flush` cards, padded sections `.hz-card__section` (css-addition).

## CSS API

| Class | Purpose |
|---|---|
| `.hz-card` | Base: padding 16, 24 at ≥1024 |
| `.hz-card--compact` | Padding stays 16 at every width (side columns, dense dashboards) |
| `.hz-card--flush` | Padding 0 + `overflow: hidden` — media, tables or lists run edge to edge |
| `.hz-card--subtle` | `bg-subtle` ground for a secondary group inside a page (code box, summary) |
| `.hz-card--feature` | `bg-feature` cream — **landing pages only** |
| `.hz-card--interactive` | The whole card is one link; hover lifts 2px and darkens the border |
| `.hz-card__header` / `__title` / `__footer` | Header row, title, footer row |
| `.hz-card__section` ★ | Padded block inside a flush card; consecutive sections get a hairline (`tools/css-additions/Card.css`) |

```html
<article class="hz-card">
  <header class="hz-card__header">
    <h3 class="hz-card__title">درخواست‌های باز</h3>
    <a class="hz-link hz-link--standalone" href="/requests">مشاهده همه <svg class="hz-icon hz-icon--xs hz-icon--mirror">…arrow-right…</svg></a>
  </header>
  …
  <footer class="hz-card__footer"><span class="hz-caption">به‌روزرسانی: ۷ مهر ۱۴۰۵</span> <a class="hz-btn hz-btn--primary hz-btn--sm">پرداخت ۴۰۰٬۰۰۰ تومان</a></footer>
</article>
```

## Tokens

`bg-surface` · `bg-subtle` · `bg-feature` · `border-default` · `border-subtle` · `border-control` (interactive hover) · `radius-xl` · `text-primary` · `focus-ring` · `duration-base` · `ease-standard`.

## Variants & sizes

- **default** — every record and dashboard panel.
- **compact** — side column of the record page (P6), ops tiles, anything narrower than ~320px.
- **flush** — card with a 3:2 / 4:3 RecordImage on top, a DataTable, or a list of rows that bring their own padding.
- **subtle** — a group *inside* a page, e.g. the referral code box «کد مراجعه به دامپزشک». Not a substitute for a status: use Alert for tone.
- **feature** — **SiteShell home and section landings only** (cream `bg-feature`, e.g. «استعلام اصالت سند»). Never in dashboards, records, forms or OpsShell; there a card is always white.
- **interactive** — service tiles, animal tiles, article cards: a single `<a>` wrapping the card. Only one link inside.

## States

- **default** as above.
- **hover (pointer only)** — interactive: `translateY(-2px)` + `border-control`; others have no hover.
- **focus-visible** — interactive: `focus-ring` 2px + 2px offset around the whole card.
- **active/pressed** — no extra style; the navigation itself is the feedback.
- **disabled** — cards are never disabled; a locked service is `LockedServiceCard`.
- **loading** — keep the card, replace body content with `hz-skeleton` lines; keep the title if known.
- **error / empty** — keep the card and put `hz-state` inside; the header stays so the user knows which block failed.
- **long Persian text** — the title wraps (header aligns to the start of the first line); the end action never shrinks or wraps.

## Mobile ↔ desktop

- <768: padding 16; cards go full width with 16px gutter; header action stays inline (it is a ≥44px standalone link).
- 768–1023: padding 16; card grids 2-up.
- ≥1024: padding 24 (except `compact`); grids 3-up (SiteShell) or the 2-column record layout (details + status column).
- Interactive cards are touch targets as a whole; inner content needs no separate targets.

## RTL & LTR

Header title at the start, action at the end via `justify-content: space-between` — no physical sides. «مشاهده همه» uses `arrow-right` + `hz-icon--mirror` (points ← in RTL). Identifiers inside cards are `<bdi class="hz-id" dir="ltr">`.

## Accessibility

- Use `<article>` for a self-contained record, `<section aria-labelledby>` for a dashboard block, plain `<div>` for `subtle` groups.
- Title is a real heading at the right level for the page (usually `h2`/`h3`).
- Interactive card: one `<a>`; its accessible name is the title (avoid «بیشتر» as the only text). Do not put buttons inside an interactive card.

## Data

Cards hold data, they do not invent it: titles, counts and money come from the record (`requests[].titleFa`, `amount.displayFa`, `updatedAt.longFa`). An empty block is shown with `hz-state`, never as an empty white box.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/card.tsx`: `Card({ children, className })` renders a `<section>`; `CardHeader({ title, subtitle?, badge?: { tone, label } })`. Keep; add `variant` and `as`.


`src/ui/card.tsx` — keep `Card` and `CardHeader`. Proposed props: `Card` → `variant: 'default' | 'compact' | 'flush' | 'subtle' | 'feature'`, `as` (`article` | `section` | `div` | `a`), `href` (renders the interactive variant); `CardHeader` → `title`, `action` (node), `level` (heading level); new `CardFooter` and `CardSection`. `LockedServiceCard`, `AnimalCard`, `RequestCard`, `ServiceCard` in the same file compose `Card`.

## Do / Don't

- Do keep one primary action per card at most (usually in the footer).
- Do use `flush` + `__section` when an image or table must touch the border.
- Don't use `feature` outside landing pages; don't tint cards by status.
- Don't add shadows, coloured borders or a second link inside an interactive card.
