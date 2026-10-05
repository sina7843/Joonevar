# OpsShell

The operator and admin frame: a dense, grouped, collapsible 248px cream sidebar with an environment label and queue counts, a cream top bar with breadcrumbs and the account menu, and a white work area on a 16px rhythm.

Use it for all 12 operator roles (93 pages: `/assoc/*`, `/genetics/*`, `/admin/*`, `/author/*`, `/content/*`, `/review/*`, `/market/*`). Never for users or visitors. This folder shows the **high end** — SUPERADMIN in the marketplace environment, 24 items in 7 groups (desktop 1440). `OpsShellTablet` shows the association operator (14 items) as a 72px rail; `OpsShellMobile` shows the genetics operator (5 items, the low end) with the Drawer open.

## Anatomy

1. **Skip link** «رفتن به محتوای اصلی».
2. **Sidebar** (`bg-chrome`, `border-default` end edge): head (logo `hz-logo--ops` 26px + env label `hz-sidebar__env` in `text-brand`, e.g. «محیط عملیاتی انجمن») → nav: an unlabelled home section, then labelled groups (`hz-sidebar__group--toggle`, caret, `aria-expanded`) with dense items (icon 20 · label · count) → foot: «جمع‌کردن منو» (`sidebar-simple`, mirrored).
3. **Top bar** (`bg-chrome`, sticky, 64 desktop / 56 below): breadcrumbs · spacer · account button (initial, name, role, caret) ≥768; title + env subtitle and the menu IconButton <768.
4. **Main** `hz-main__inner hz-main__inner--ops` — 16px gaps, padding 24/32 ≥1024: PageHeader (title as h3), queue tiles, dense tables.

## CSS API

| Class | Role |
|---|---|
| `.hz-app.hz-app--ops` | grid: 1 col <768 · 72px rail 768–1023 · `sidebar-ops` 248 ≥1024 |
| `.hz-sidebar.hz-sidebar--ops` | hidden <768 (Drawer instead), shown ≥768 (css-addition) |
| `.hz-sidebar--collapsed` | rail: icons only, group hairlines, alert dot, labels/counts hidden |
| `.hz-sidebar__head`, `__env`, `__nav`, `__section`, `__items`, `__foot`, `__collapse(-label)` | sidebar parts |
| `.hz-sidebar__group.hz-sidebar__group--toggle` | collapsible group header (button) |
| `.hz-side-item.hz-side-item--dense` (+`__icon`, `__dot`, `__label`) | 36px item; `__dot` shows only in the rail |
| `.hz-count`, `.hz-count--alert` | waiting count / overdue count |
| `.hz-topbar`, `__title`, `__primary`, `__sub`, `__crumbs`, `__account(-text/-name/-role)` | top bar parts |
| `.hz-drawer.hz-drawer--nav`, `.hz-nav-drawer__head/__brand/__foot` | mobile nav Drawer |
| `.hz-show-md` / `.hz-hide-md` | 768 visibility helpers (css-addition) |

```html
<div class="hz-sidebar__section">
  <button type="button" class="hz-sidebar__group hz-sidebar__group--toggle" aria-expanded="true" aria-controls="g1"><span>آگهی و نظارت</span><svg class="hz-icon hz-icon--xs">…caret-down…</svg></button>
  <div class="hz-sidebar__items" id="g1" role="group" aria-label="آگهی و نظارت">
    <a class="hz-side-item hz-side-item--dense" href="/market/listings"><span class="hz-side-item__icon"><svg class="hz-icon">…flag…</svg><span class="hz-side-item__dot"></span></span><span class="hz-side-item__label">گزارش آگهی‌ها</span><span class="hz-count hz-count--alert">۷</span></a>
  </div>
</div>
```

## Tokens

`bg-chrome`, `bg-page`, `bg-surface`, `border-default`, `border-subtle` (group hairlines, foot rule), `bg-brand-subtle` + `text-brand` (current item, env label), `bg-subtle` (hover), `action-primary` (alert count, rail dot), `text-secondary` (group labels, plain counts), `status-warning-*` (late tiles/ages), `sidebar-ops` 248, rail 72, `header-app`, `control-sm` 36 (dense items, sm buttons), `space-16`.

## Variants & sizes — 5 to 24 items

| Items | Rule |
|---|---|
| **≤ 7** (genetics 5, author 2, content 6, review 6) | One flat list, **no group labels**, regular 44px items (dense optional). No collapsing. |
| **8–14** (superadmin `/admin` 12, association 14) | Group labels (2–5 groups of 2–5 items); first section unlabelled (the env home). Dense 36px items. Groups expanded, not collapsible — 14 dense items + labels ≈ 700px fits a 768px-tall laptop. |
| **15–24** (market roles, SUPERADMIN market 24) | Groups become **collapsible** buttons. The group holding the current page is always open; others keep the user's last state (stored per user per environment); default open = groups with counts. A collapsed group shows the sum of its overdue items as `hz-count--alert` so nothing urgent hides. |
| **> 24** | Not designed; split the environment. |

Each market role sees only the items its capability allows (`marketNav`); empty groups are not rendered, so a 5-item role automatically falls into the flat rule. Group names for the 24 market items: آگهی و نظارت · فروشندگان · سفارش و مالی · اختلاف و پشتیبانی · جفت‌یابی · پیکربندی (design decision). Association groups follow the approved KYC mockup.

## States

Item: default · hover (pointer, `bg-subtle`) · focus-visible ring · current (`aria-current="page"`, fill icon, `bg-brand-subtle`). Counts: plain `hz-count` = cases waiting; `hz-count--alert` = at least one case past its deadline; zero = no pill. Group: expanded / collapsed (caret points to the end edge). Long labels («مرجوعی و سیاست آن», «میز بررسی دامپزشکان») ellipsize with the full label in `title`; the rail always uses `aria-label`. Loading counts: pill hidden, never «۰».

## Mobile ↔ desktop

| | <768 | 768–1023 | ≥1024 |
|---|---|---|---|
| Sidebar | none — menu IconButton → Drawer from the end edge (`hz-drawer--nav`, max 320, page visible behind the scrim) | 72px icon rail (`hz-sidebar--collapsed`); «بازکردن منو» expands it over the content | full 248 grouped; «جمع‌کردن منو» collapses to the rail |
| Top bar | 56 · title + env + menu | 56 · breadcrumbs + account avatar | 64 · breadcrumbs + account name/role |
| Queue | card list | table with fewer columns | full dense table |
| Decision | full page, decision in a sticky bar / bottom sheet | modal | side column |

In the Drawer and on coarse pointers items are 44px and group toggles 44px; dense 36px rows only with a fine pointer.

## RTL & LTR

Sidebar at the start; rail hairlines and counts are logical. Mirrored glyphs: `sidebar-simple`, `sign-out`, `arrow-u-up-left` (مرجوعی), «←» links. Collapsed caret rotates toward the end edge (RTL +90°, LTR −90°). «Export Pedigree» and «Claim» stay Latin inside Persian labels.

## Accessibility

`aside` labelled «ناوبری محیط عملیاتی بازار», inner `nav`. Group toggles are buttons with `aria-expanded` + `aria-controls`; item lists are `role="group"` with the group name. Counts carry `aria-label` («۷ مورد»). Rail items carry `aria-label` (label + count) and show a tooltip on hover/focus. Drawer: `role="dialog"`, `aria-modal`, focus moves to the first item, Esc and the scrim close it, focus returns to the menu button. Focus order: skip → logo → items (top to bottom) → collapse → top bar → main. Sidebar scrolls independently (`hz-sidebar__nav` overflows) and is sticky to the viewport height on desktop.

## Data

Nav per role from `roles.json` and `marketNav` in `src/ui/shell.tsx`; counts and oldest-case age from each queue's count query (the preview's counts are illustrative — sample-content has no queue totals). Env label from the environment; user name/role from the session.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/shell.tsx`: `OpsShell({ actor, title, pathname, nav: NavItem[], children })` with `NavItem = { href, label, icon }` and the lists `ASSOC_NAV`, `GENETICS_NAV`, `ADMIN_NAV`, `AUTHOR_NAV`, `REVIEW_NAV`, `CONTENT_NAV`, `marketNav(actor)`. Keep; add `group?`, `count?`, `alert?` to `NavItem`.


`src/ui/shell.tsx` — today a flat 224px sidebar and nav stacked over content on mobile. Keep `marketNav` (capability-filtered) and each environment's item list; add `group` and `icon` to each item (proposed `OpsNavItem { href, label, icon, group?, count?, overdue? }`), `collapsed` state persisted per user, and the Drawer below 768.

## Do / Don't

- Do keep the env label visible in every state except the rail (there it is the logo's `aria-label`).
- Do surface overdue work: `hz-count--alert` on items, on collapsed groups and as a rail dot.
- Don't put a primary button in the shell; ops pages decide per view.
- Don't mix densities in one sidebar; don't nest groups.
