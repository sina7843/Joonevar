# SiteShell

The public site and magazine frame: cream header with the grouped navigation, a white page, and a cream footer that lists all 16 sections.

Use it for every visitor page (42 routes: `/`, `/articles`, `/veterinarians`, `/shop`, `/verify`, `/login` …). Never use it for signed-in work (`/dashboard`, `/account/*` → PublicShell) or operator pages (→ OpsShell). This folder is the desktop (1440) reference; `SiteShellTablet` (768) and `SiteShellMobile` (390) show the same markup at the other breakpoints.

## Anatomy

1. **Skip link** «رفتن به محتوای اصلی» — first focusable element, visible only on focus.
2. **Header** (`bg-chrome`, `border-default` bottom edge, sticky) — one row, no dividers: logo · nav of 5 groups with caret + «استعلام اصالت» · search IconButton + «ورود / ثبت‌نام» (**primary sm, filled `user` icon** — v1.0.3). Signed-in visitors see «پنل من» in the same slot.
3. **Page** (`bg-page`, white) inside `hz-container` (1280 max). Content comes from the page (here: PageHeader + three article cards).
4. **Footer** (`bg-chrome`, `border-default` top edge) — brand block (logo, one-line description, trust-badge slot) + six link groups + bottom row (© ۱۴۰۵ همزیست · support hours · «تماس با ما»).

## CSS API

| Class | Role |
|---|---|
| `.hz-site-header` / `__bar` / `__end` | sticky chrome row; `__end` is pushed to the end edge |
| `.hz-logo.hz-logo--responsive` | 30px below 1024, 36px from 1024 (css-addition) |
| `.hz-nav`, `.hz-nav__item`, `.hz-nav-group` | desktop nav (see GroupedNav) inside a `.hz-show-lg` wrapper |
| `.hz-icon-btn.hz-hide-lg` | menu button, only below 1024 |
| `.hz-site-footer`, `__grid`, `__brand`, `__tagline`, `__trust`, `__bottom`, `__contact` | footer layout (css-addition) |
| `.hz-footer-col`, `__title`, `__links` + `.hz-accordion-row` | one link group: heading ≥768, accordion row <768 |
| `.hz-skip-link` | skip link (css-addition, shared by all shells) |

```html
<a class="hz-skip-link" href="#main">رفتن به محتوای اصلی</a>
<header class="hz-site-header"><div class="hz-container"><div class="hz-site-header__bar">
  <a class="hz-logo hz-logo--responsive" href="/" aria-label="همزیست — خانه"><img src="…" alt="همزیست"></a>
  <div class="hz-show-lg"><nav class="hz-nav" aria-label="ناوبری اصلی">…</nav></div>
  <div class="hz-site-header__end">
    <button class="hz-icon-btn" aria-label="جستجو در همزیست">…</button>
    <span class="hz-show-lg"><a class="hz-btn hz-btn--primary hz-btn--sm" href="/login"><svg class="hz-icon hz-icon--xs" …>user (fill)</svg>ورود / ثبت‌نام</a></span>
    <button class="hz-icon-btn hz-hide-lg" aria-label="منوی همزیست" aria-expanded="false" aria-controls="site-menu">…</button>
  </div>
</div></div></header>
<main id="main" tabindex="-1">…</main>
<footer class="hz-site-footer">…</footer>
```
Wrap `hz-show-lg` around flex elements (it reverts `display`, which would undo `inline-flex`).

## Tokens

`bg-chrome` (header, footer), `bg-page` (page), `border-default` (chrome edges, footer rule, accordion rows), `text-primary`, `text-secondary` (footer links, tagline), `text-brand` (current group, link hover), `icon-strong`, `icon-default`, `focus-ring`, `z-header`, `z-toast` (skip link), `header-site` 80 / 64, `container-site` 1280, `space-16/32/40` margins.

## Variants & sizes

- **Guest** — «ورود / ثبت‌نام»; **signed in** — «پنل من» (same primary sm button, filled `user` icon). The mobile menu's foot button is the same action as a primary block button. This header button is chrome: it does not count toward a page's one primary button.
- **Landing pages** may add `bg-feature` cards and one `bg-band`; the shell itself never changes colour.
- Header 80px ≥1024, 64px below; footer padding 56/32 desktop, 28/24 mobile.

## States

- Nav item: default · hover (pointer only, `bg-subtle`) · focus-visible ring · open (`aria-expanded="true"`, `bg-subtle`, caret rotated) · current group (`hz-nav__item--current`, `text-brand` + 700).
- Footer group <768: collapsed / expanded (caret rotates 180°). Links: hover underline in `text-brand`.
- Long text: at 1024–1279 the nav items use 8px inline padding and the bar gap is 24 (bundle, v1.0.4), so logo, 5 groups, «استعلام اصالت», search and the primary «ورود / ثبت‌نام» fit in one row. If an admin-defined label grows, the nav never wraps — move «استعلام اصالت» into the «خدمات» panel.
- Missing trust image: the RecordImage empty state with «نماد اعتماد».

## Mobile ↔ desktop

| | <768 | 768–1023 | ≥1024 |
|---|---|---|---|
| Header | 64px · logo + search + menu | same | 80px · logo + 5 groups + verify + search + login |
| Menu | full menu in a Drawer (GroupedNav) | same | dropdown panels |
| Footer | brand, then accordion rows (52px) | brand row + 3 columns | brand column 280 + 6 columns |
| Margins | 16 | 32 | 40 (container 1280) |

Footer links are 44px tall on coarse pointers at every width.

## RTL & LTR

Logo at the start, actions at the end, all spacing logical. Carets (`caret-down`) are not mirrored. No Latin text except identifiers, which use `bdi`.

## Accessibility

Skip link first; `<header>`, `<nav aria-label="ناوبری اصلی">`, `<main id="main" tabindex="-1">`, `<footer>` landmarks. Menu button has `aria-expanded` + `aria-controls`. Footer below 768: each group title is a `button[aria-expanded]` (inside the group's heading in code) controlling its list; from 768 the button is `display:none` and a real `h2` shows, so only one is ever in the accessibility tree. Focus order: skip → logo → nav groups → «استعلام اصالت» → search → login/menu → page → footer.

## Data

Sections and routes from `src/public/sections.ts` (16 sections) plus four off-nav pages placed in the footer: «شرایط عضویت انجمن» and «مقررات انجمن» under انجمن‌ها, «تست اصالت نسب» and «وضعیت‌ها و مراحل» under خدمات. Grouping is the design decision documented in GroupedNav. Session decides «ورود / ثبت‌نام» vs «پنل من».

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/public/site-shell.tsx`: `SiteShell({ children })` (async) with `DesktopNav({ links })` and `MobileMenu({ links })` from `site-nav.tsx`, `NavLink = { href, label }` — a flat list today. Keep; add groups for GroupedNav.


`src/public/site-shell.tsx` — keep `DesktopNav` (now from 1024 with grouped panels, see GroupedNav) and `MobileMenu` (now a Drawer with accordion groups). Keep `sections.ts` as the single source; add a `NAV_GROUPS` map (proposed) rather than a second list. Footer is new (★ «پانویس سایت»): proposed `SiteFooter` reading the same groups.

## Do / Don't

- Do keep the header one row with no dividers; one button only — the primary sm «ورود / ثبت‌نام» / «پنل من» (chrome, v1.0.3).
- Do keep chrome cream and the page white; never put cream behind page content except landing feature cards / band.
- Don't add a seventh top-level item; extend a group panel instead.
- Don't hide «استعلام اصالت» on desktop — it is the trust entry point.
