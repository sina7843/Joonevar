# Tooltip

A small white label that appears beside a control on pointer hover or keyboard focus to repeat its name or show truncated text in full — never the only place that information lives.

Use it on icon-only buttons (document tools «بزرگ‌نمایی», «چرخش ۹۰ درجه», «تمام‌صفحه»; Identifier «کپی شناسه») and on ellipsised names in dense ops tables. Don't use it to explain why something is disabled, for definitions or rules, for anything with a link or button inside (use PopoverMenu or a visible hint), or on touch-only screens.

## Anatomy

1. Anchor — `.hz-tooltip-anchor` wrapping the trigger (inline-flex, positioning context).
2. Bubble — `bg-surface`, 1px `border-default`, `radius-sm`, `shadow-overlay-sm`, padding 4/10, 12/20 SemiBold `text-primary`, max 240px, 6px from the anchor. No arrow (structure by lines, not pointers).

## CSS API

| Class | Role |
|---|---|
| `.hz-tooltip-anchor` | Wrapper; shows the bubble on `:hover` (fine pointers only, 400ms delay) and when a child has `:focus-visible` |
| `.hz-tooltip` | Bubble, centred above the anchor |
| `--below` · `--start` | Below the anchor · aligned to the anchor's start edge (long text, near the inline-end edge) |
| `--open` | Forced open (JS-controlled or static preview) |
| `.hz-tooltip-anchor--dismissed` | Set by Escape; cleared on pointer leave / blur |

```html
<span class="hz-tooltip-anchor">
  <button class="hz-icon-btn hz-icon-btn--sm" type="button" aria-label="چرخش ۹۰ درجه">…arrow-clockwise…</button>
  <span class="hz-tooltip" aria-hidden="true">چرخش ۹۰ درجه</span>
</span>
```

## Tokens

`bg-surface` · `border-default` · `radius-sm` · `shadow-overlay-sm` · `text-primary` · `z-dropdown` · `duration-fast` + `ease-standard`.

## Variants & sizes

| Use | Placement | Text source | ARIA |
|---|---|---|---|
| Icon button name | above (default) | same string as `aria-label` | bubble `aria-hidden="true"` (no double reading) |
| Truncated name in a table | `--below --start` | full `displayNameFa` | `role="tooltip"` + `aria-describedby` on the link |

One size. Text up to two short lines; anything longer belongs on the page.

## States

Hidden · shown on hover after 400ms (pointer: fine only) · shown immediately on keyboard focus-visible · dismissed by Escape (stays dismissed until leave/blur) · hoverable: the pointer can move onto it without it closing (WCAG 1.4.13) · no disabled/loading/error/empty — a disabled control gets no tooltip at all · long Persian text: wraps inside 240px; use `--start` so it grows inward. Reduced motion: no fade.

## Mobile ↔ desktop

- **<768 and coarse pointers:** never shown (no long-press tooltips). Icon buttons still have `aria-label`; truncated names open their detail page, where the full name is shown.
- **≥768 with a mouse/trackpad, and keyboard users everywhere:** shown as above. Collision handling (flip below/above, shift inward) is done in code; the CSS default is centred above.

## RTL & LTR

Centring is direction-neutral (`inset-inline` + `margin-inline: auto`); `--start` uses the logical start. Tooltips contain no directional icons.

## Accessibility

- Never the only carrier: every tooltip text also exists as `aria-label` or as visible text elsewhere (detail page, column header).
- Supplementary descriptions use `role="tooltip"` + `aria-describedby`; name-duplicating bubbles are `aria-hidden`.
- Opens on focus as well as hover; Escape dismisses without moving focus; does not block the pointer from the next control.
- Contrast `text-primary` on white 11.3:1.

## Data

Icon names are UI copy; truncated names are the record's own field (`displayNameFa`, `titleFa`). Never put identifiers that must be copied only in a tooltip.

## Code mapping

★ New (P2) — none in code; `title=""` attributes are used today and should be removed where a Tooltip is added (they duplicate and can't be styled). Proposed `src/ui/tooltip.tsx`: `<Tooltip content placement?: 'top' | 'bottom' align?: 'center' | 'start' describes?: boolean>` wrapping a single focusable child; `describes=false` (default for IconButton) renders the bubble `aria-hidden`.

## Do / Don't

- Do mirror the icon button's `aria-label` in its tooltip.
- Do show the full text of an ellipsised name — and keep it on the detail page too.
- Don't explain a disabled button with a tooltip; write the reason under it.
- Don't put links, buttons or rules in a tooltip.
- Don't rely on tooltips on phones.
