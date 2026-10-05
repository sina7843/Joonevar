# Divider

A 1px warm rule that separates regions horizontally or vertically, optionally with a short label such as «یا».

Use it where a line explains structure better than space: between two page regions, between groups inside a card, between toolbar groups, between equal alternatives («یا»). Don't use it under every list row (rows bring their own `border-subtle`), around a card (the card has its own border) or as decoration under a SectionHeader (the accent bar already marks the section).

## Anatomy

1. Rule — 1px line, `border-block-start` (horizontal) or `border-inline-start` (vertical); no margin of its own — the parent's `gap` spaces it.
2. Label (optional) — 13/20 SemiBold `text-secondary`, centred between two rules (each ≥24px), or at the start with a single rule after it.

## CSS API

| Class | Effect |
|---|---|
| `.hz-divider` | Horizontal rule in `border-default` (use on `<hr>`) |
| `.hz-divider--subtle` | `border-subtle` — inside a surface (card, sheet, menu, table cell group) |
| `.hz-divider--vertical` | Vertical rule, stretches to the row height (min 20px) |
| `.hz-divider--label` + `.hz-divider__label` | Labelled divider, rules on both sides |
| `.hz-divider--label-start` | Label at the start, Bold `text-primary`, one rule after it (form sub-section) |

```html
<hr class="hz-divider">
<hr class="hz-divider hz-divider--subtle">
<span class="hz-divider hz-divider--vertical" aria-hidden="true"></span>
<p class="hz-divider hz-divider--label"><span class="hz-divider__label">یا</span></p>
```

## Tokens

`border-default` · `border-subtle` · `text-secondary` · `text-primary` (label-start) · spacing comes from the parent (`space-8` … `space-24`).

## Variants & sizes

| Variant | Token | Where in Hamzist |
|---|---|---|
| Horizontal, default | `border-default` | Between page regions on `bg-page` or `bg-chrome`: «حیوان‌های من» / «درخواست‌های فعال», sidebar foot, drawer foot |
| Horizontal, subtle | `border-subtle` | Inside a white card: between KV groups (identity / documents), inside menus, the «یا» inside the verify card |
| Vertical | `border-default` or `--subtle` | Between toolbar groups (zoom · rotate | download), between meta items, between the topbar search and account |
| With label, centred | — | «یا» between two equal routes: document number vs QR scan in «استعلام اصالت» |
| With label, start | — | «اطلاعات تکمیلی (اختیاری)» inside a long form step |

One thickness only (1px). The rule is never orange and never dashed (dashed borders mean "locked" in LockedServiceCard).

**Rule of thumb:** the divider takes the colour of the edge it sits closest to — `border-default` where it separates things that also have `border-default` outlines (cards, chrome, page sections), `border-subtle` inside one surface, matching KV and list-row hairlines.

## States

Static — no hover, focus, disabled, loading or error. Empty: never render a divider at the start/end of a container or two in a row (hide it when the group after it is empty). Long Persian text: the label wraps (max 75% of the width) and both rules keep ≥24px; on a 360px column the label simply grows taller.

## Mobile ↔ desktop

Identical at <768, 768–1023 and ≥1024. Vertical dividers in toolbars disappear when the toolbar wraps on phones (the wrap itself separates the groups) — hide with the toolbar's own layout, not per breakpoint.

## RTL & LTR

Logical borders only (`border-block-start`, `border-inline-start`), so the vertical rule sits between items in either direction. `--label-start` puts the label at the inline start (right in RTL). No icons.

## Accessibility

- `<hr class="hz-divider">` has an implicit `separator` role — use it only for a real thematic break.
- Decorative rules (vertical toolbar/meta lines, the hairline between KV groups) are `<span aria-hidden="true">` or CSS borders; never announce them.
- Labelled «یا»: plain text (`<p>`), not `role="separator"` — a separator's content is not read, and «یا» must be.
- Never the only cue: the regions on each side keep their own headings.

## Data

No data of its own. A labelled divider's text is UI copy. Rendered conditionally: no divider before an empty or hidden group.

## Code mapping

★ New — none in code (today `border-t` utilities and ad-hoc `<hr>`). Proposed `Divider` in `src/ui/divider.tsx`: `orientation?: 'horizontal' | 'vertical'` (default horizontal), `tone?: 'default' | 'subtle'`, `label?: string`, `labelAlign?: 'center' | 'start'`, `decorative?: boolean` (vertical defaults to `true` → `aria-hidden`).

## Do / Don't

- Do use `border-subtle` inside cards and `border-default` between page regions.
- Do use a vertical divider between meta items with numbers instead of «·» (a middle dot beside Persian digits reads as «۰»).
- Don't stack a divider under a SectionHeader or directly on a card edge.
- Don't add margins to the divider itself; let the parent's gap do it.
- Don't use a labelled divider as a heading — a real section needs SectionHeader.
