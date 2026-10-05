# رنگ — Color & contrast

The palette is **fixed at 27 colours** (25 from `app/globals.css` without `#171A17`, plus the logo ink `#3A3B36` and the approved field border `#938980`). Nothing here is new. Colour is organised in two layers:

- **Primitives** (`white`, `cream-50`, `sand-*`, `ink-900`, `orange-*`, `blue-*`, `green-*`, `amber-*`, `red-*`, `logo-cream`) hold the values. **Components never use a primitive directly.**
- **Semantic tokens** (`bg-*`, `text-*`, `border-*`, `action-*`, `status-*`, `focus-ring`, `logo-*`) are aliases of primitives and are the only names a component spec, preview or code may use. Dark mode later = new values for the `dark` theme on these semantic tokens only; the theme is already declared and currently inherits light.

## Surface rule (approved at checkpoint 1)

| Ground | Token | Value | Where |
|---|---|---|---|
| Page | `bg-page` | `white` #FFFFFF | Every shell, every breakpoint |
| Cards, panels, tables, overlays | `bg-surface` | `white` #FFFFFF | Always outlined with `border-default` (1px) — white on white is separated by the line, never by a shadow |
| Chrome | `bg-chrome` | `cream-50` #FFFCF8 | Header and footer (SiteShell); sidebar and top bar (PublicShell, OpsShell); mobile tab bar and sticky action bars. Always with a `border-default` edge toward the page |
| Landing feature cards | `bg-feature` | `cream-50` #FFFCF8 | **SiteShell landing pages only** (home and section landings): quick links, breed, community, service and step cards, stats box, hero verify box — with `border-default` |
| Landing band | `bg-band` | `cream-50` #FFFCF8 | **SiteShell landing pages only:** one full-width band, edge to edge (approved: «تازه‌ها»), `border-subtle` hairlines top and bottom; cards inside are `bg-surface` white. Max one per page |
| Quiet fill | `bg-subtle` | `sand-100` #FAF7F2 | Inside a surface: «اقدام بعدی با» box, locked-service card, table header, hover of secondary/ghost |
| Brand tint | `bg-brand-subtle` | `peach-50` #FFF6ED | CTA box, active nav item, selected option, category tags |

Secondary buttons are **white** (`action-secondary`) with a `border-control` outline everywhere. In **PublicShell and OpsShell** cream is structure only (chrome): cards stay white. Only **landing pages** use cream for feature cards and one band, to give the editorial pages warmth (approved at checkpoint 2).

> `#FFFCF8` is ~1% from white (1.01:1). It reads as warmth, not as a separate colour, so cream surfaces always keep their border or hairline.

## The three oranges — hard rule

| Token | Value | Allowed | Forbidden | Why |
|---|---|---|---|---|
| `orange-500` → `logo-mark`, `accent-bar`, `border-brand`, `focus-ring` | #E46A1D | Logo, accent bar, active borders, focus ring, icons | **Any text**; any fill under white text | White on it 3.29:1; it on white 3.29:1 |
| `orange-600` → `action-primary` | #C94F12 | Primary button fill under white text | Text on light grounds | White on it 4.55:1; it on white 4.55:1 but 4.45:1 on cream — too close to fail |
| `orange-700` → `text-brand`, `action-primary-hover` | #A83D0B | **Every orange text**: links, tags, «مشاهده همه», overlines; primary hover fill | — | ≥5.89:1 on every light ground |

One primary button per view. Orange is emphasis, never a background area.


## Primitives — the 27 approved colours

| Token | Value | Use |
|---|---|---|
| `white` | #FFFFFF | Pure white — page, cards, inputs, secondary buttons, text on the primary button. |
| `cream-50` | #FFFCF8 | Logo-family cream — chrome only: header, footer, sidebars, top bars, tab bar, sticky bars (code: bg-canvas). |
| `sand-100` | #FAF7F2 | Warm off-white — quiet fills and the neutral status background (code: bg-subtle, status-neutral-bg). |
| `peach-50` | #FFF6ED | Brand tint — CTA box, selected/active fills, category tags (code: bg-brand-subtle). |
| `sand-200` | #F0EAE2 | Hairline and disabled fill — decorative dividers, disabled controls, empty-image placeholder (code: bg-disabled, border-subtle, border-disabled). |
| `sand-300` | #DED5CA | Warm border — card and panel outlines, table rules, neutral status border. |
| `sand-400` | #B9AEA2 | Disabled text only (2.13:1 — WCAG-exempt for disabled controls) (code: text-disabled). |
| `sand-500` | #938980 | Approved addition (10 Mehr 1405). Control borders: fields, checkbox, radio, switch-off, secondary button — 3.43:1 on white. |
| `sand-700` | #685F57 | Secondary text, meta, captions, icons at rest (code: text-secondary). |
| `sand-800` | #4F4842 | Neutral status text (code: status-neutral-text). |
| `ink-900` | #3A3B36 | Logo ink — primary text, headings, secondary-button label. Replaces the code's #171A17. |
| `orange-500` | #E46A1D | Logo orange — mark, accent bar, focus ring, active borders, icons. NEVER text, NEVER a fill under white text. |
| `orange-600` | #C94F12 | Primary action fill under white text only (4.55:1). Never text on light grounds. |
| `orange-700` | #A83D0B | Every orange text: links, category tags, small headings, «مشاهده همه»; also primary-button hover fill. |
| `logo-cream` | #FFF1D6 | Logo cut-out only (the shapes inside the symbol). |
| `blue-50` | #EFF8FF | Info status background. |
| `blue-500` | #2E90FA | Info status border / dot (decorative). |
| `blue-700` | #175CD3 | Info status text and icon. |
| `green-50` | #ECFDF3 | Success status background. |
| `green-500` | #22A06B | Success status border / dot (decorative). |
| `green-700` | #166B48 | Success status text and icon. |
| `amber-50` | #FFFAEB | Warning status background. |
| `amber-500` | #F79009 | Warning status border / dot — decorative only (2.35:1 on white). |
| `amber-700` | #B54708 | Warning status text and icon. |
| `red-50` | #FEF3F2 | Error status background. |
| `red-500` | #F04438 | Error status border / dot (decorative). |
| `red-700` | #B42318 | Error status text, destructive button fill under white text (6.57:1). |

## Semantic tokens

| Token | → Primitive | Use |
|---|---|---|
| `bg-page` | `white` | Page background in every shell (decision, checkpoint 1). |
| `bg-surface` | `white` | Cards, panels, tables, modals, sheets — always with border-default. |
| `bg-chrome` | `cream-50` | Header, footer, PublicShell/OpsShell sidebar and top bar, mobile tab bar, sticky action bars. Always separated from the page by border-default. |
| `bg-feature` | `cream-50` | Landing pages only: feature cards (quick links, breed, community, service, step cards, stats box, hero verify box). Always with border-default. Never in PublicShell or OpsShell. |
| `bg-band` | `cream-50` | Landing pages only: one full-width band edge to edge (e.g. «تازه‌ها»), border-subtle hairlines top and bottom; cards inside are bg-surface. |
| `bg-subtle` | `sand-100` | Quiet fills inside surfaces: «اقدام بعدی با» box, locked-service card, table header row, hover on secondary/ghost controls. |
| `bg-brand-subtle` | `peach-50` | Brand tint: CTA box, active nav item, selected radio card, category tag, avatar initials. |
| `bg-disabled` | `sand-200` | Disabled control fill. |
| `bg-media-empty` | `sand-200` | Designed missing-image placeholder (brand symbol + Persian alt text in text-secondary). |
| `text-primary` | `ink-900` | Body copy and headings on bg-page, bg-surface, bg-chrome, bg-subtle, bg-brand-subtle and every status background (≥10.39:1). |
| `text-secondary` | `sand-700` | Meta, captions, helper text, secondary labels on bg-page, bg-surface, bg-chrome, bg-subtle, bg-brand-subtle (≥5.84:1) and on bg-media-empty (5.23:1). Hierarchy vs text-primary comes from size and weight, not colour alone (1.81:1 apart). |
| `text-brand` | `orange-700` | All orange text: links, «مشاهده همه», category tags, small overlines — on bg-page, bg-surface, bg-chrome, bg-subtle, bg-brand-subtle (≥5.89:1). |
| `text-disabled` | `sand-400` | Disabled labels only — WCAG-exempt; never for information. |
| `text-on-action` | `white` | Label on action-primary (4.55:1), action-primary-hover (6.29:1) and action-destructive (6.57:1). |
| `border-default` | `sand-300` | Card, panel, header/footer, table and divider rules (decorative — structure, not meaning). |
| `border-subtle` | `sand-200` | Hairlines inside a surface: list-row separators, key-value rows. |
| `border-control` | `sand-500` | Fields, checkbox, radio, switch-off and secondary-button outlines — 3.43:1 on white, 3.35:1 on bg-chrome (WCAG 1.4.11). |
| `border-brand` | `orange-500` | Active/selected outline, accent bar at the start of section titles (3.29:1 on white). |
| `border-disabled` | `sand-200` | Disabled control outline. |
| `focus-ring` | `orange-500` | 2px focus ring with 2px offset on every interactive element; on text fields it is the field's own 2px border instead (no second ring) — 3.29:1 on white, 3.22:1 on bg-chrome. |
| `action-primary` | `orange-600` | Primary button fill — one per view. Label: text-on-action. |
| `action-primary-hover` | `orange-700` | Primary button hover/pressed fill (pointer devices only for hover). |
| `action-secondary` | `white` | Secondary button fill (decision: white). Outline border-control, label text-primary. |
| `action-secondary-hover` | `sand-100` | Secondary and ghost button hover/pressed fill. |
| `action-destructive` | `red-700` | Destructive button fill (reject, suspend, delete). Label: text-on-action. |
| `accent-bar` | `orange-500` | The 4px bar at the start of every section title — the system's signature. |
| `logo-mark` | `orange-500` | Logo symbol fill. |
| `logo-cutout` | `logo-cream` | Logo symbol cut-outs. |
| `logo-ink` | `ink-900` | Wordmark «همزیست» on light grounds. |
| `icon-default` | `sand-700` | Icons at rest next to text-secondary. |
| `icon-strong` | `ink-900` | Icons in icon buttons and next to text-primary. |
| `status-neutral-bg` | `sand-100` | StatusBadge/Alert background for the draft + closed families. |
| `status-neutral-text` | `sand-800` | StatusBadge/Alert text and icon on status-neutral-bg, bg-surface and bg-page. |
| `status-neutral-border` | `sand-300` | StatusBadge/Alert border and dot — decorative; meaning is carried by the label text. |
| `status-info-bg` | `blue-50` | StatusBadge/Alert background for the waiting family — someone else must act. |
| `status-info-text` | `blue-700` | StatusBadge/Alert text and icon on status-info-bg, bg-surface and bg-page. |
| `status-info-border` | `blue-500` | StatusBadge/Alert border and dot — decorative; meaning is carried by the label text. |
| `status-success-bg` | `green-50` | StatusBadge/Alert background for the done family. |
| `status-success-text` | `green-700` | StatusBadge/Alert text and icon on status-success-bg, bg-surface and bg-page. |
| `status-success-border` | `green-500` | StatusBadge/Alert border and dot — decorative; meaning is carried by the label text. |
| `status-warning-bg` | `amber-50` | StatusBadge/Alert background for the action family — the user must act. |
| `status-warning-text` | `amber-700` | StatusBadge/Alert text and icon on status-warning-bg, bg-surface and bg-page. |
| `status-warning-border` | `amber-500` | StatusBadge/Alert border and dot — decorative; meaning is carried by the label text. |
| `status-error-bg` | `red-50` | StatusBadge/Alert background for the blocked family. |
| `status-error-text` | `red-700` | StatusBadge/Alert text and icon on status-error-bg, bg-surface and bg-page. |
| `status-error-border` | `red-500` | StatusBadge/Alert border and dot — decorative; meaning is carried by the label text. |

## Contrast — computed (WCAG 2.2 relative luminance), light theme

Every text/ground and control/ground pair the system uses. Text needs 4.5:1, UI marks (control borders, focus ring, meaningful icons) 3:1. "Decorative" lines carry no meaning on their own; status meaning is always carried by the label text.

| Foreground | Ground | Ratio | Kind | Result |
|---|---|---|---|---|
| `text-primary` #3A3B36 | `bg-page` #FFFFFF | 11.30:1 | text | ✓ |
| `text-primary` #3A3B36 | `bg-surface` #FFFFFF | 11.30:1 | text | ✓ |
| `text-primary` #3A3B36 | `bg-chrome` #FFFCF8 | 11.05:1 | text | ✓ |
| `text-primary` #3A3B36 | `bg-subtle` #FAF7F2 | 10.57:1 | text | ✓ |
| `text-primary` #3A3B36 | `bg-brand-subtle` #FFF6ED | 10.58:1 | text | ✓ |
| `text-secondary` #685F57 | `bg-page` #FFFFFF | 6.24:1 | text | ✓ |
| `text-secondary` #685F57 | `bg-surface` #FFFFFF | 6.24:1 | text | ✓ |
| `text-secondary` #685F57 | `bg-chrome` #FFFCF8 | 6.10:1 | text | ✓ |
| `text-secondary` #685F57 | `bg-subtle` #FAF7F2 | 5.84:1 | text | ✓ |
| `text-secondary` #685F57 | `bg-brand-subtle` #FFF6ED | 5.84:1 | text | ✓ |
| `text-secondary` #685F57 | `bg-media-empty` #F0EAE2 | 5.23:1 | text | ✓ |
| `text-brand` #A83D0B | `bg-page` #FFFFFF | 6.29:1 | text | ✓ |
| `text-brand` #A83D0B | `bg-surface` #FFFFFF | 6.29:1 | text | ✓ |
| `text-brand` #A83D0B | `bg-chrome` #FFFCF8 | 6.15:1 | text | ✓ |
| `text-brand` #A83D0B | `bg-subtle` #FAF7F2 | 5.89:1 | text | ✓ |
| `text-brand` #A83D0B | `bg-brand-subtle` #FFF6ED | 5.89:1 | text | ✓ |
| `text-on-action` #FFFFFF | `action-primary` #C94F12 | 4.55:1 | text | ✓ |
| `text-on-action` #FFFFFF | `action-primary-hover` #A83D0B | 6.29:1 | text | ✓ |
| `text-on-action` #FFFFFF | `action-destructive` #B42318 | 6.57:1 | text | ✓ |
| `status-neutral-text` #4F4842 | `status-neutral-bg` #FAF7F2 | 8.40:1 | text | ✓ |
| `status-neutral-text` #4F4842 | `bg-surface` #FFFFFF | 8.98:1 | text | ✓ |
| `status-neutral-border` #DED5CA | `bg-surface` #FFFFFF | 1.45:1 | decorative | — (no requirement) |
| `status-info-text` #175CD3 | `status-info-bg` #EFF8FF | 5.57:1 | text | ✓ |
| `status-info-text` #175CD3 | `bg-surface` #FFFFFF | 5.99:1 | text | ✓ |
| `status-info-border` #2E90FA | `bg-surface` #FFFFFF | 3.24:1 | decorative | — (no requirement) |
| `status-success-text` #166B48 | `status-success-bg` #ECFDF3 | 6.16:1 | text | ✓ |
| `status-success-text` #166B48 | `bg-surface` #FFFFFF | 6.50:1 | text | ✓ |
| `status-success-border` #22A06B | `bg-surface` #FFFFFF | 3.33:1 | decorative | — (no requirement) |
| `status-warning-text` #B54708 | `status-warning-bg` #FFFAEB | 5.20:1 | text | ✓ |
| `status-warning-text` #B54708 | `bg-surface` #FFFFFF | 5.43:1 | text | ✓ |
| `status-warning-border` #F79009 | `bg-surface` #FFFFFF | 2.35:1 | decorative | — (no requirement) |
| `status-error-text` #B42318 | `status-error-bg` #FEF3F2 | 6.05:1 | text | ✓ |
| `status-error-text` #B42318 | `bg-surface` #FFFFFF | 6.57:1 | text | ✓ |
| `status-error-border` #F04438 | `bg-surface` #FFFFFF | 3.76:1 | decorative | — (no requirement) |
| `text-primary` #3A3B36 | `status-neutral-bg` #FAF7F2 | 10.57:1 | text | ✓ |
| `text-primary` #3A3B36 | `status-info-bg` #EFF8FF | 10.51:1 | text | ✓ |
| `text-primary` #3A3B36 | `status-success-bg` #ECFDF3 | 10.71:1 | text | ✓ |
| `text-primary` #3A3B36 | `status-warning-bg` #FFFAEB | 10.83:1 | text | ✓ |
| `text-primary` #3A3B36 | `status-error-bg` #FEF3F2 | 10.39:1 | text | ✓ |
| `border-control` #938980 | `bg-page` #FFFFFF | 3.43:1 | UI | ✓ |
| `border-control` #938980 | `bg-chrome` #FFFCF8 | 3.35:1 | UI | ✓ |
| `border-control` #938980 | `bg-subtle` #FAF7F2 | 3.21:1 | UI | ✓ |
| `focus-ring` #E46A1D | `bg-page` #FFFFFF | 3.29:1 | UI | ✓ |
| `focus-ring` #E46A1D | `bg-chrome` #FFFCF8 | 3.22:1 | UI | ✓ |
| `focus-ring` #E46A1D | `bg-subtle` #FAF7F2 | 3.08:1 | UI | ✓ |
| `focus-ring` #E46A1D | `bg-brand-subtle` #FFF6ED | 3.08:1 | UI | ✓ |
| `border-brand` #E46A1D | `bg-page` #FFFFFF | 3.29:1 | UI | ✓ |
| `border-brand` #E46A1D | `bg-chrome` #FFFCF8 | 3.22:1 | UI | ✓ |
| `accent-bar` #E46A1D | `bg-page` #FFFFFF | 3.29:1 | UI | ✓ |
| `accent-bar` #E46A1D | `bg-chrome` #FFFCF8 | 3.22:1 | UI | ✓ |
| `accent-bar` #E46A1D | `bg-subtle` #FAF7F2 | 3.08:1 | UI | ✓ |
| `action-primary` #C94F12 | `bg-page` #FFFFFF | 4.55:1 | UI (button edge) | ✓ |
| `action-primary` #C94F12 | `bg-chrome` #FFFCF8 | 4.45:1 | UI (button edge) | ✓ |
| `icon-default` #685F57 | `bg-page` #FFFFFF | 6.24:1 | UI | ✓ |
| `icon-default` #685F57 | `bg-surface` #FFFFFF | 6.24:1 | UI | ✓ |
| `icon-default` #685F57 | `bg-chrome` #FFFCF8 | 6.10:1 | UI | ✓ |
| `border-default` #DED5CA | `bg-page` #FFFFFF | 1.45:1 | decorative | — (no requirement) |
| `text-disabled` #B9AEA2 | `bg-page` #FFFFFF | 2.18:1 | disabled (exempt) | — (no requirement) |
| `text-disabled` #B9AEA2 | `bg-disabled` #F0EAE2 | 1.82:1 | disabled (exempt) | — (no requirement) |
| `orange-500` #E46A1D | `white` #FFFFFF | 3.29:1 | text — FORBIDDEN | ✗ — why the rule exists |
| `orange-600` #C94F12 | `white` #FFFFFF | 4.55:1 | text — FORBIDDEN | ✗ — why the rule exists |
| `orange-600` #C94F12 | `cream-50` #FFFCF8 | 4.45:1 | text — FORBIDDEN | ✗ — why the rule exists |

Notes:
- `text-primary` vs `text-secondary` differ by only 1.81:1 — build hierarchy with **size and weight**, not colour alone.
- `status-warning-border` (#F79009) is 2.35:1 on white — decorative only; the badge text (`status-warning-text`, 5.43:1) carries the meaning.
- `text-disabled` (2.13:1) is allowed only on disabled controls (WCAG-exempt), never for information.

## Mapping — code token → new token (for Claude Code's migration)

| Code (`app/globals.css`) | Value | New semantic token |
|---|---|---|
| `bg-canvas` | #FFFCF8 | `bg-chrome` (page itself becomes `bg-page` = white — checkpoint-1 decision) |
| `bg-surface` | #FFFFFF | `bg-surface` / `bg-page` |
| `bg-subtle` | #FAF7F2 | `bg-subtle` |
| `bg-brand-subtle` | #FFF6ED | `bg-brand-subtle` |
| `bg-disabled` | #F0EAE2 | `bg-disabled` (also `bg-media-empty`) |
| `text-primary` | #171A17 → **#3A3B36** | `text-primary` |
| `text-secondary` | #685F57 | `text-secondary` |
| `text-brand` | #A83D0B | `text-brand` |
| `text-disabled` | #B9AEA2 | `text-disabled` |
| `border-subtle` | #F0EAE2 | `border-subtle` (row hairlines); card outlines move to `border-default` #DED5CA |
| `border-brand` | #E46A1D | `border-brand`, `accent-bar`, `focus-ring` |
| `border-disabled` | #F0EAE2 | `border-disabled` |
| — (fields used #F0EAE2, 1.20:1) | **#938980** | `border-control` (approved addition) |
| `action-primary-default` | #C94F12 | `action-primary` (hover: `action-primary-hover` #A83D0B) |
| `action-primary-on` | #FFFFFF | `text-on-action` |
| `action-secondary-default` / `-on` | #FFFFFF / #171A17 → **#3A3B36** | `action-secondary` / `text-primary` |
| — (no destructive in code) | #B42318 | `action-destructive` (existing error text colour, new role) |
| `status-{neutral,info,success,warning,error}` bg / text / border | as code | `status-{tone}-bg` / `-text` / `-border` |
| `logo-mark` · `logo-cutout` · wordmark | #E46A1D · #FFF1D6 · #3A3B36 | `logo-mark` · `logo-cutout` · `logo-ink` |

## Ink alpha uses — approved (11 Mehr 1405)

**No new colour was added.** Two alpha uses of the existing ink, approved by the product owner on 11 Mehr 1405 (v1.0.3):

| Use | Value | Why |
|---|---|---|
| Overlay shadows (`shadow-overlay-sm/-lg`, `shadow-sticky`) | `#3A3B36` at 12–24% alpha | Floating layers (menus, modal, sheet) need separation from white content; same hue as the ink, no new colour |
| Scrim (`overlay-scrim`) | `#3A3B36` at 48% alpha | Behind Modal, Drawer and BottomSheet (approved at checkpoint 2); an alpha of the ink, no new colour |

