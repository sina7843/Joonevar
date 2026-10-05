# فاصله، grid و نقطه شکست — Layout

## Breakpoints — one system for all three shells

Today the three shells use three widths and two breakpoints (SiteShell from 1024 up to 1152/1280; PublicShell always a 768px column; OpsShell from 768 up to 1152). They are unified:

| Token | Width | Columns | Gutter | Margin | SiteShell | PublicShell | OpsShell |
|---|---|---|---|---|---|---|---|
| `bp-mobile` | 360–767 | 4 | 16 | 16 | Full menu in a Drawer | Bottom tab bar (4) | Nav in a Drawer |
| `bp-tablet` | 768–1023 | 8 | 20 | 32 | Full menu in a Drawer | Tab bar or side rail | Sidebar collapsed to icons (72) |
| `bp-desktop` | 1024–1439 | 12 | 24 | 40 | Grouped header nav | **Real desktop layout:** sidebar 264 + content | Full grouped sidebar 248 |
| `bp-wide` | ≥ 1440 | 12 | 24 | 80 | Container 1280 | Content ≤ 1200 | Content fluid, ≤ 1200 per column group |

Containers: `container-site` 1280 · `container-app` 1200 · `container-reading` 720.

Responsive rules that hold everywhere:

| | Mobile | Tablet | Desktop |
|---|---|---|---|
| Tables | Card list — never forced horizontal scroll | Table with fewer columns | Full table |
| Primary action | Sticky at the bottom | In content | In content or the side column |
| Overlay | Bottom sheet | Modal | Modal or drawer |
| Filters | Full-screen drawer | Drawer | Side column or bar |

200% zoom must not cause horizontal scrolling.

## Spacing — 2px base, up to 96

`space-0` 0 · `space-2` 2 · `space-4` 4 · `space-8` 8 · `space-12` 12 · `space-16` 16 · `space-20` 20 · `space-24` 24 · `space-32` 32 · `space-40` 40 · `space-48` 48 · `space-64` 64 · `space-80` 80 · `space-96` 96

| Context | SiteShell | PublicShell | OpsShell |
|---|---|---|---|
| Between sections | `space-64` (mobile `space-48`) | `space-24` | `space-16` |
| Card / panel padding | `space-24` (mobile `space-16`) | `space-24` (mobile `space-16`) | `space-16`–`space-20` |
| Gap in a card grid | `space-20` | `space-16` | `space-12` |
| Section title → content | `space-24` | `space-16` | `space-12` |
| List row vertical padding | `space-16` | `space-12`–`space-16` | `space-8`–`space-12` (row 36–40) |

## Radius — approved: B's corners on direction A

| Token | Value | Use |
|---|---|---|
| `radius-none` | 0 | Tables, full-bleed images |
| `radius-xs` | 4 | Progress bars, tiny indicators |
| `radius-sm` | 8 | Tooltips, image toolbars, thumbnails ≤ 64 |
| `radius-md` | **12** | **Controls:** buttons, inputs, selects, nav items |
| `radius-lg` | 16 | Inner panels, list cards inside a surface, alerts, radio cards |
| `radius-xl` | **20** | **Cards, panels, modals**, images inside cards |
| `radius-2xl` | 28 | CTA box, stat band, bottom-sheet top corners |
| `radius-full` | pill | Tags, status badges, avatars, switches |

Nested corners: an inner element's radius = outer radius − padding (never larger than its container).

## Borders and elevation

- **Structure with lines:** `border-default` 1px on cards, panels, header/footer edges, table rules; `border-subtle` for row hairlines inside a surface.
- **Controls:** `border-control` 1px (3.43:1) on fields, checkbox, radio, switch-off and secondary buttons. Focus adds `focus-ring` 2px with 2px offset. Text fields (input, textarea, select, OTP, combobox, message box) are the one exception: their own border becomes the focus indicator — `focus-ring` at 2px (1px border + 1px inset), same radius, no outer ring.
- **No shadow on cards.** Elevation exists only for floating layers: `shadow-overlay-sm` (menu, popover, combobox, tooltip), `shadow-overlay-lg` (modal, drawer, bottom sheet), `shadow-sticky` (mobile sticky bar over scrolling content).
- **Layers:** `z-base` 0 · `z-sticky` 100 · `z-header` 200 · `z-dropdown` 300 · `z-overlay` 400 · `z-modal` 500 · `z-toast` 600.

## Sizes

Controls `control-sm` 36 (desktop OpsShell only) · `control-md` 44 (default, touch minimum) · `control-lg` 48 (primary, search, mobile block buttons). Headers: site 80 (mobile 64), app top bar 64 (mobile 56). Sidebars: PublicShell 264, OpsShell 248 / 72 collapsed. Tab bar 68.
