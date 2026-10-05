# Shells — پوسته‌ها

Hamzist has three shells, one per environment. They share one breakpoint and grid system, one chrome treatment and one set of navigation parts, so a screenshot of an operator queue and of the home page read as the same product. Component specs: **SiteShell**, **PublicShell**, **OpsShell**, **GroupedNav**, **PageHeader** (each shell also has *Tablet* and *Mobile* preview folders).

## Who uses which shell

| Shell | Roles | Pages | Density | Device priority |
|---|---|---|---|---|
| **SiteShell** | visitor (and everyone, signed in or not) | 42 — `/`, magazine, directory, market, shop, `/verify`, `/login` | editorial | mobile = desktop |
| **PublicShell** | USER, BREEDER, TRUSTED_VET | 111 — `/dashboard`, `/animals`, `/requests`, `/payments`, `/documents`, `/account/*`, `/vet/*` | comfortable (vet: compact) | mobile first |
| **OpsShell** | ASSOCIATION_OPERATOR, GENETICS_OPERATOR, SUPERADMIN, AUTHOR, CONTENT_ADMIN, REVIEW_OPERATOR, six marketplace roles | 93 — `/assoc`, `/genetics`, `/admin`, `/author`, `/content`, `/review`, `/market` | dense | desktop first, must work on a phone |

A person with an operator role still lands in PublicShell for their own animals; the dashboard's «محیط‌های عملیاتی شما» links into OpsShell. The shell follows the route, never the person.

## One breakpoint and grid system

| Range | Name | Columns | Gutter | Side margin | Content container |
|---|---|---|---|---|---|
| 360–767 | `bp-mobile` | 4 | 16 | 16 | full width |
| 768–1023 | `bp-tablet` | 8 | 20 | 32 | full width |
| 1024–1439 | `bp-desktop` | 12 | 24 | 40 | site 1280 · app 1200 |
| ≥ 1440 | `bp-wide` | 12 | 24 | 80 (the 1280 container centres) | site 1280 · app 1200 · reading 720 |

- Breakpoints are min-width and mobile-first: base styles are the phone, `768` and `1024` add structure. 1440 changes nothing structural; it only centres the site container.
- Containers: `container-site` 1280 (SiteShell, centred), `container-app` 1200 (PublicShell and OpsShell work area, start-aligned next to the sidebar), `container-reading` 720 (article body).
- Inside the app shells the grid is measured on the work area, not the viewport: a 1440 screen with a 264 sidebar leaves 1176 for 12 columns.
- 200% zoom on a 1280 laptop behaves like the tablet range — no horizontal scroll at any range.

## Anatomy per breakpoint

### SiteShell

| | < 768 | 768–1023 | ≥ 1024 |
|---|---|---|---|
| Header | 64 · logo · search · menu | same | 80 · one row, no dividers: logo · 5 groups with caret + «استعلام اصالت» · search · «ورود / ثبت‌نام» (primary sm, filled `user` icon; chrome, not counted as the page's primary) |
| Navigation | full menu in a Drawer, groups as accordions | same | dropdown panel per group |
| Page | white, 4-col grid | white, 8-col grid | white, 12-col grid in 1280 |
| Footer | brand, then 6 accordion rows | brand row + 3 columns | brand column + 6 columns |

### PublicShell

| | < 768 | 768–1023 | ≥ 1024 |
|---|---|---|---|
| Top bar | 56 · logo · bell | same | 64 · search · bell · the view's one primary action |
| Navigation | bottom tab bar, 4 tabs (vet: its own 4) | tab bar (no side rail) | sidebar 264: primary items, «حساب من» group, user box |
| Work area | one column | two-column cards | grid up to 1200 |
| Primary action | sticky ActionRow above the tab bar | in content | top bar or content |

### OpsShell

| | < 768 | 768–1023 | ≥ 1024 |
|---|---|---|---|
| Top bar | 56 · page title + environment · menu | 56 · breadcrumbs · account initial | 64 · breadcrumbs · account name + role |
| Navigation | Drawer from the end edge (max 320) | 72 icon rail (expandable over content) | grouped sidebar 248, collapsible to the rail |
| Queues | card list | table with fewer columns | full dense table |
| Decision desk | full page, decision in a sticky bar / bottom sheet | modal | fixed side column 380 |

## Density

| | SiteShell | PublicShell | OpsShell |
|---|---|---|---|
| Body | 16/28 | 16/28 (15/26 phone) | 14/24 |
| Page title | h1 (display on home) | h1 | h3 style on the `h1` |
| Between sections | 64 (48 phone) | 24 | 16 |
| Card padding | 24 (16 phone) | 24 (16 phone) | 16–20 |
| Nav item | 40 header item, 52 menu row | 44 sidebar item, 68 tab | 36 dense item (44 on touch and in the Drawer) |
| Buttons | 44–48 | 44–48 | 36 allowed with a fine pointer |

## Chrome rules

- **Chrome is cream, the page is white.** Header, footer, sidebars, top bars, tab bar, Drawers used for navigation and sticky action bars use `bg-chrome` with a 1px `border-default` edge facing the page. Everything the user works on — page, cards, tables, panels — sits on `bg-page` / `bg-surface`.
- **Lines, not shadows.** Chrome never casts a shadow; only floating layers do (`shadow-overlay-sm` for nav panels, `shadow-overlay-lg` for Drawers, `shadow-sticky` for a mobile sticky bar over content).
- **Orange is emphasis.** In chrome it appears only as: the current item (`bg-brand-subtle` + `text-brand`), the environment label, alert counts and badges (`action-primary`), the tab indicator, the bell dot (`logo-mark`) and focus. At most one primary button per view, counting the top bar. Exception: the SiteShell header's «ورود / ثبت‌نام» / «پنل من» is a primary sm button (filled `user` icon) and does not count (v1.0.3).
- **Current location** is shown twice: the item (`aria-current="page"`, fill icon) and the page title. In SiteShell the parent group in the header is also marked.
- Landing pages may add `bg-feature` cards and one `bg-band`; the shell never changes colour per page.

## Sticky and scroll behaviour

- SiteShell header, PublicShell and OpsShell top bars: `position: sticky` at the top, `z-header`. The header never hides on scroll — the registry is used in short task bursts and the search/menu must stay reachable.
- PublicShell tab bar: sticky to the bottom (`z-header`); a page's sticky ActionRow stacks directly above it. Main content reserves the tab-bar height so the last card and the focused element are never covered (`scroll-padding-block-end`).
- Desktop sidebars (PublicShell, OpsShell): sticky to the viewport height; the item list scrolls on its own (`hz-sidebar__nav`), the head and foot stay put.
- OpsShell decision column: sticky below the top bar (`inset-block-start` = top bar + 16).
- Drawers and nav panels lock page scroll while open (Drawer) or close on outside scroll (panel).

## Focus order and skip link

1. `hz-skip-link` «رفتن به محتوای اصلی» — first element in every shell, visible on focus, jumps to `main#main` (which has `tabindex="-1"`).
2. Logo → navigation (header groups / sidebar items top to bottom / rail) → chrome actions (search, bell, primary action, account) → `main` → footer (SiteShell) or tab bar (PublicShell, last in DOM).
3. Opening a panel or Drawer moves focus into it; Esc closes and returns focus to the control that opened it. Drawers trap focus; header panels do not (Tab out closes them).
4. Focus ring everywhere: `focus-ring`, 2px, 2px offset (text fields: their own border at 2px, no outer ring); it must stay visible on cream chrome and on `bg-brand-subtle`.

## OpsShell sidebar — 5 to 24 items

Item counts per environment come from the code: author 2, genetics 5, content 6, review 6, superadmin `/admin` 12, association 14, marketplace roles 6–11 (capability-filtered), superadmin in the marketplace 24.

| Items | Structure | Item size | Collapsing |
|---|---|---|---|
| ≤ 7 | one flat list after the environment label; no group labels | 44 regular (dense allowed) | none |
| 8–14 | unlabelled home item, then 2–5 labelled groups of 2–5 items | 36 dense | groups always open |
| 15–24 | same groups, each label is a toggle button with a caret | 36 dense | the current page's group is always open; others remember the user's choice per environment; first visit opens groups that have counts. A collapsed group shows its overdue total as an alert count. |
| > 24 | not allowed — split the environment | | |

- Counts: a plain `hz-count` is the number waiting; `hz-count--alert` means at least one case is past its deadline; no pill at zero or while loading (never «۰»).
- Rail (tablet and collapsed desktop): icons only, `aria-label` and tooltip per item, hairline between groups, an alert dot instead of counts, all items visible regardless of group state.
- Labels never wrap: they ellipsize with the full label in `title`. Every item has an icon (needed by the rail); the current item uses the fill weight.
- Marketplace groups (design decision): آگهی و نظارت · فروشندگان · سفارش و مالی · اختلاف و پشتیبانی · جفت‌یابی · پیکربندی. Association groups follow the approved KYC mockup: هویت و عضویت · دامپزشکان · پرورش · اسناد و ارسال.

## Code mapping summary

- `src/public/site-shell.tsx` — `DesktopNav` moves from a flat list to the 5 grouped panels; `MobileMenu` becomes a Drawer; a footer is added. Groups derive from `src/public/sections.ts`.
- `src/ui/shell.tsx` (PublicShell) — the always-768px column becomes the responsive app grid with a ≥1024 sidebar; the USER tabs and `VET_TABS` stay.
- `src/ui/shell.tsx` (OpsShell) — the flat 224 sidebar becomes the grouped, collapsible 248 sidebar with icons and counts, a 72 rail from 768, and a Drawer below 768; `marketNav` filtering stays.
