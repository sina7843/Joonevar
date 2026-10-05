# SectionHeader ★

The system's signature: a 4px orange accent bar at the start, a Bold section title, and «مشاهده همه ←» as a TextLink at the end.

Use it above every content section in all three shells — magazine rows on the home page, «درخواست‌های فعال» on the dashboard, queues in OpsShell (small size). Do not use it for the page title (that is PageHeader with `h1`), for card titles (`h4`), or more than once per section.

## Anatomy

1. **Accent bar** — 4 × 20 (mobile) / 4 × 24 (desktop), `accent-bar`, `radius-full`, at inline-start.
2. **Title** — `h2` look, Bold, `text-primary`.
3. **Count** (optional) — `.hz-section-header__count`, 13/20 · 600, `text-secondary`, after the title: «۱۴ مطلب».
4. **Link** (optional) — TextLink standalone «مشاهده همه» + `arrow-right` mirrored (←), at inline-end.

## CSS API

| Class | Role |
|---|---|
| `.hz-section-header` | Flex row, space-between, gap 16, margin-block-end 16 (24 at ≥1024) |
| `.hz-section-header__title` | The heading element; flex with the bar, 20/32 → 24/38 |
| `.hz-section-header__bar` | The accent bar (`aria-hidden`) |
| `.hz-section-header__count` | Optional count inside the title |
| `.hz-section-header__link` | **New** (css-additions/SectionHeader.css): keeps the link on one line and unshrunk |
| `.hz-section-header--sm` | OpsShell: title 16/26, bar 3 × 16, gap 10, margin 12 |

```html
<div class="hz-section-header">
  <h2 class="hz-section-header__title">
    <span class="hz-section-header__bar" aria-hidden="true"></span>مجله همزیست
    <span class="hz-section-header__count">۱۴ مطلب</span>
  </h2>
  <a class="hz-link hz-link--standalone hz-section-header__link" href="/articles">
    مشاهده همه<span class="hz-visually-hidden"> مطالب مجله</span>
    <svg class="hz-icon hz-icon--xs hz-icon--mirror" viewBox="0 0 256 256" aria-hidden="true">…arrow-right…</svg>
  </a>
</div>
```

## Tokens

`accent-bar` · `text-primary` · `text-secondary` (count) · `text-brand` (link) · `focus-ring` · `radius-full` · `space-12`/`space-16`/`space-24`.

## Variants & sizes

With link · without link (the whole set is already shown) · with count · without count · `--sm` for OpsShell panels and queues (link text can be specific: «مشاهده صف»).

## States

Header itself is static. Link: default `text-brand` no underline; hover (pointer only) underline; focus-visible ring 2px + 2px offset; pressed — browser default; no disabled link — if there is nothing more to see, omit it. Empty section: keep the header and show an EmptyState below it, drop the count and the link. Count «۰ مطلب» is never shown. Long Persian title: the title wraps (≤2 lines), the link stays on one line at the end (`__link`). Loading: header renders immediately; content below shows skeletons.

## Mobile ↔ desktop

<1024: title 20/32, bar 20 tall, 16 below. ≥1024: title 24/38, bar 24, 24 below. The standalone link is 44px tall on every breakpoint (touch target). On narrow phones a very long title plus link still fits: the link never shrinks.

## RTL & LTR

Bar at inline-start, link at inline-end — both from flex order, no physical positions. The arrow is `arrow-right` + `hz-icon--mirror` (← in RTL, → in LTR). The count stays after the title in reading order.

## Accessibility

- The title is a real heading at the right level (`h2` in pages, `h3` inside an OpsShell panel).
- The bar is `aria-hidden`.
- «مشاهده همه» alone is ambiguous in a links list: add the section name in `.hz-visually-hidden` («مشاهده همه مطالب مجله»).
- Focus order: title (not focusable) → link → section content.

## Data

Title: static copy per section. Count: the total from the list query, formatted with Persian digits + unit noun («۱۴ مطلب»، «۳ درخواست»); omit while unknown. Link `href`: the section's list page; omitted when every item is already visible.

## Code mapping

New component `SectionHeader` (★, not in code). Proposed props: `title: string`, `level?: 2 | 3` (default 2), `count?: number`, `countNoun?: string`, `href?: string`, `linkLabel?: string` (default «مشاهده همه»), `size?: 'md' | 'sm'`.

## Do / Don't

- Do use one SectionHeader per section, in every shell (smaller in OpsShell).
- Do keep the bar orange via `accent-bar`; Don't recolour it per category.
- Don't put a button in the link slot; the end slot is a TextLink only.
- Don't let «مشاهده همه» wrap or shrink; let the title wrap.
- Don't show a count of zero or a link to an empty list.

Bundle note for the owner: with a wrapped two-line title the bar is centred between the lines (`align-items: center` on `__title`); aligning it to the first line needs a change in bundle.css, not an addition.
