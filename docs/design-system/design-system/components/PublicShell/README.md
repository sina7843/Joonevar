# PublicShell

The signed-in user app: a real desktop layout with a 264px cream sidebar, a cream top bar and a white work area up to 1200px; on phones and tablets a top bar and a 4-tab bottom bar.

Use it for every USER, BREEDER and TRUSTED_VET route (111 pages: `/dashboard`, `/animals/*`, `/requests/*`, `/payments`, `/documents/*`, `/account/*`, `/vet/*`). Not for visitor pages (SiteShell) or operator work (OpsShell). This folder is the desktop (1440) reference; `PublicShellTablet` and `PublicShellMobile` show the same markup at 768 and 390.

## Anatomy

1. **Skip link** «رفتن به محتوای اصلی».
2. **Sidebar** (≥1024 only, `bg-chrome`, `border-default` on the end edge): logo → primary nav (خانه · حیوان‌های من · درخواست‌ها · پرداخت‌ها · اسناد · اعلان‌ها · پروفایل) → group «حساب من» (آگهی‌های من · سفارش‌ها · جفت‌یابی · احراز هویت, plus `/account/*` areas the user owns: مرکز، کلاب، فروشگاه) → user box (initial, name, role · city) pinned to the bottom.
3. **Top bar** (`bg-chrome`, sticky): ≥1024 search field (420) · spacer · notifications bell · the one primary action «ثبت حیوان»; <1024 logo · spacer · bell.
4. **Main** `hz-main__inner` (max 1200, padding 32/40 desktop, 20/16 mobile, 24px rhythm): PageHeader, alerts, cards.
5. **Tab bar** (<1024, `bg-chrome`, sticky bottom, 68px): 4 tabs; current tab uses the **fill** icon, `text-brand`, and a 3px `border-brand` indicator.

## CSS API

| Class | Role |
|---|---|
| `.hz-app` | grid: 1 column <1024, `sidebar-app` (264) + content ≥1024 |
| `.hz-sidebar.hz-sidebar--app` | hidden <1024, flex column ≥1024 (css-addition modifier) |
| `.hz-sidebar__head`, `__nav`, `__section`, `__group`, `__user` (+`-text/-name/-role`) | sidebar parts (css-additions) |
| `.hz-side-item` (+`__icon`, `__label`), `.hz-count--alert` | nav item; `aria-current="page"` = current |
| `.hz-topbar`, `__logo`, `__search`, `__spacer` | top bar parts |
| `.hz-icon-btn__dot` | unread dot on the bell |
| `.hz-main`, `.hz-main__inner` | work area |
| `.hz-tabbar`, `.hz-tab`, `.hz-tab__badge` | bottom tabs, hidden ≥1024 |

```html
<div class="hz-app">
  <aside class="hz-sidebar hz-sidebar--app" aria-label="ناوبری حساب">…</aside>
  <div class="hz-main">
    <header class="hz-topbar">…</header>
    <main class="hz-main__inner" id="main" tabindex="-1">…</main>
    <nav class="hz-tabbar" aria-label="ناوبری اصلی">
      <a class="hz-tab" href="/dashboard" aria-current="page"><svg class="hz-icon">…house-fill…</svg><span>خانه</span></a>…
    </nav>
  </div>
</div>
```

## Tokens

`bg-chrome` (sidebar, top bar, tab bar), `bg-page`, `bg-surface` (cards), `border-default`, `bg-brand-subtle` + `text-brand` (current item), `bg-subtle` (hover), `action-primary` (count, tab badge, the one primary button), `logo-mark` (bell dot), `icon-default`, `icon-strong`, `sidebar-app` 264, `header-app` 64 / 56, `tabbar` 68, `container-app` 1200, `z-header`.

## Variants & sizes

- **USER / BREEDER tabs:** خانه `house` · درخواست‌ها `file-text` · اعلان‌ها `bell` (badge = unread count) · پروفایل `user`. BREEDER adds sidebar items (کنل، جفت‌گیری، زایمان، کارت توله) in a «پرورش» group — the tab bar never grows past 4.
- **TRUSTED_VET tabs (VET_TABS):** صف من `tray` (badge = waiting check-ins) · پذیرش `qr-code` · نمونه‌ها `test-tube` · پروفایل `user`; same shell, compact density (shown in the mobile preview).
- Sidebar items 44px, icons 20; tab icons 24.

## States

Side item: default · hover (pointer) · focus-visible · current (`aria-current="page"`, fill icon, `bg-brand-subtle`). Count pill `hz-count--alert` only for something that needs the user (unread, payment due). Tab: default `text-secondary` · current (fill icon, 800, indicator) · badge. Empty states, long names (`hz-side-item__label` and user name ellipsize, full text in `title`) and the locked services live in the page, not the shell.

## Mobile ↔ desktop

| | <768 | 768–1023 | ≥1024 |
|---|---|---|---|
| Navigation | tab bar (4) | tab bar (4) — decision: no side rail for PublicShell, so phone and tablet behave the same | sidebar 264 |
| Top bar | 56 · logo + bell | 56 · logo + bell | 64 · search + bell + primary action |
| Primary action | sticky ActionRow above the tab bar | in content | in the top bar / content |
| Content | 1 column, margin 16 | 2-column card grid | 2-column grid, max 1200 |

Items that are not in the 4 tabs (حیوان‌های من، پرداخت‌ها، اسناد، حساب من) are reached from خانه sections and from پروفایل on phones. Tabs are ≥ 97px wide × 68px — far above the 44px touch minimum.

## RTL & LTR

Sidebar sits at the start (right in RTL) with its border on the end edge; tab order runs from the start. «همه ←» uses `arrow-right` + `hz-icon--mirror`. Identifiers (`PET-…`, `HZ-…`) in `bdi dir="ltr"`.

## Accessibility

Landmarks: `aside` (ناوبری حساب) with an inner `nav`, `header`, `main#main`, `nav` (tab bar). Current item and tab: `aria-current="page"`. Bell: `aria-label="اعلان‌ها، ۲ خوانده‌نشده"`; tab badge has its own label. Group «حساب من» is a labelled `role="group"`. Focus order: skip → sidebar (logo, items, user) → top bar → main → tab bar (tab bar last in DOM so it is reached after content). Sticky bars must not cover the focused element: main gets `scroll-padding-block-end: tabbar` on mobile.

## Data

Nav per role from `sample-content/roles.json` (`USER`, `BREEDER`, `TRUSTED_VET` / VET_TABS). Counts: unread notifications, payments due — from the dashboard queries; zero hides the pill. User box: `displayName`, role label, `city`.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/shell.tsx`: `PublicShell({ actor, title, pathname, unreadCount = 0, children })` (async server component). Keep; the sidebar layout is internal.


`src/ui/shell.tsx` — today a 768px column with a top bar on every width. Keep the existing tab definitions (USER tabs and `VET_TABS`) and the role → tabs logic; add the ≥1024 sidebar (proposed `AppSidebar` with `items`, `groups`, `user`) and move the page's primary action into `PublicShell`'s `topbarAction` slot (proposed).

## Do / Don't

- Do keep one primary button per view — the top bar's «ثبت حیوان» counts; pages then use secondary buttons.
- Do use the fill icon only for the current tab/item.
- Don't add a fifth tab; don't show the tab bar at ≥1024.
- Don't use cream behind cards — the work area is white, chrome is cream.
