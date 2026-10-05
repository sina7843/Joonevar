# GroupedNav

The public site's navigation for 16 sections in 5 groups: dropdown panels with labels, descriptions and separators on desktop, and a full accordion menu in a Drawer on phones and tablets.

Use it only inside SiteShell. The 16 sections come from the code (`src/public/sections.ts`); the grouping is a design decision approved with the header mockup (5 groups + «استعلام اصالت»). For app and operator navigation use PublicShell / OpsShell.

## Anatomy — the 5 groups

| Group (header button) | Panel sections (label · description) |
|---|---|
| مجله | آموزش‌ها · اخبار · اطلاعیه‌ها |
| راهنمای دامپزشکی | دامپزشکان · مراکز دامپزشکی · نژادهای سگ |
| انجمن‌ها | انجمن‌ها و کلاب‌ها · کلاب‌ها |
| بازار | بازار فروش حیوان · فروشگاه کالا |
| خدمات | «خدمات سامانه»: خدمات · راهنمای سامانه — separator — «همزیست»: درباره همزیست · تماس با ما |
| «استعلام اصالت» (plain link) | `/verify` |

«خانه» is the logo (and the first row of the mobile menu) → 16 sections. Footer-only pages (تست اصالت نسب، شرایط عضویت انجمن، مقررات انجمن، وضعیت‌ها و مراحل) are not in the header.

Desktop: `nav.hz-nav` → per group `div.hz-nav-group` (button `hz-nav__item` with `caret-down` + panel `hz-menu hz-menu--nav`) → panel: optional `hz-menu__group-label`, `ul.hz-menu__list` of `a.hz-menu__item` (label + desc), `hz-menu__sep` between groups.
Mobile: `div.hz-drawer.hz-mobile-menu` → head (logo, close) → `nav.hz-mobile-menu__body` with `hz-accordion-row` buttons/links and `ul.hz-mobile-menu__list` → foot with «ورود / ثبت‌نام» (secondary, block).

## CSS API

```html
<div class="hz-nav-group">
  <button type="button" class="hz-nav__item" aria-expanded="true" aria-controls="nav-services">خدمات<svg class="hz-icon hz-icon--xs">…caret-down…</svg></button>
  <div class="hz-menu hz-menu--nav" id="nav-services">
    <p class="hz-menu__group-label" id="nav-services-g0">خدمات سامانه</p>
    <ul class="hz-menu__list" aria-labelledby="nav-services-g0">
      <li><a class="hz-menu__item" href="/services"><span class="hz-menu__label">خدمات</span><span class="hz-menu__desc">برگه ثبتی، شجره‌نامه، مجوز و تعرفه‌ها</span></a></li>
    </ul>
    <div class="hz-menu__sep" role="separator"></div> …
  </div>
</div>
```
Modifiers (css-additions): `hz-nav__item--current` (group of the current page), `hz-menu--nav` (absolute panel, 320 wide, below the item, aligned to its start), `hz-menu--static` (documentation only), `hz-menu__item[aria-current="page"]`. Mobile: `hz-mobile-menu`, `__head`, `__body`, `__list`, `__sep`, `__foot`.

## Tokens

Panel `bg-surface`, `border-default`, `radius-lg`, `shadow-overlay-sm`, `z-dropdown`; item hover `bg-subtle`; current `bg-brand-subtle` + `text-brand`; group label and desc `text-secondary`; separator `border-subtle`; open nav button `bg-subtle`; mobile head/foot `bg-chrome`; rows `border-default`.

## Variants & sizes

Panel width 320 (one column — at most 4 items per group, so no multi-column mega menu). Menu item ≥ 52px (label 15/24 + desc 12/20); mobile items 52px; accordion rows 52px.

## States

Nav button: default · hover (pointer) · focus-visible · open (`aria-expanded="true"`, caret 180°) · current group (`--current`). Menu item: default · hover · focus-visible (preview: «راهنمای سامانه») · current page. Long descriptions wrap to two lines (preview: «مراحل ثبت حیوان، پیگیری درخواست و دریافت سند، گام به گام»). Only one panel is open at a time.

## Mobile ↔ desktop

≥1024: header buttons + dropdown panels, opened by click / Enter / Space (not hover, so touch laptops behave the same). <1024 (phone and tablet): the menu IconButton opens a full-width Drawer (max 400) from the end edge; the group containing the current page is expanded, the rest collapsed; «استعلام اصالت» and «خانه» are plain rows; login sits in the sticky foot. All targets ≥ 44px.

## RTL & LTR

Panels align to the button's start edge; carets are not mirrored. Descriptions and labels are start-aligned. The Drawer comes from the end edge in both directions (same side as the menu button).

## Accessibility

Disclosure pattern (not `role="menu"` — these are links): button `aria-expanded` + `aria-controls`; panel lists labelled by their group label; separators `role="separator"`. Keyboard: Tab moves through buttons; Enter/Space toggles; Arrow Down from an open button enters the panel; Esc closes and returns focus to the button; clicking outside or moving focus out closes. Current group: `aria-current="true"` on the button; current page: `aria-current="page"` on the link. Mobile Drawer: `role="dialog"`, `aria-modal="true"`, labelled «منوی همزیست»; focus to close button on open, trapped while open, returns to the menu button on close.

## Data

Section labels and hrefs from `src/public/sections.ts`; descriptions are new copy (proposed in this preview, editable in code). Proposed `NAV_GROUPS = [{ key, labelFa, sections: [...], subgroups? }]` derived from the same keys, so a renamed section updates header, menu and footer together.

## Code mapping

`src/public/site-shell.tsx` — `DesktopNav` becomes the 5 group buttons + panels (★ «ناوبری گروه‌بندی‌شده»); `MobileMenu` becomes the Drawer with accordion groups. Proposed props: `groups: NavGroup[]`, `currentPath`, `session` (switches «ورود / ثبت‌نام» ↔ «پنل من»).

## Do / Don't

- Do keep descriptions to one short phrase; they are wayfinding, not marketing.
- Do keep «استعلام اصالت» as a top-level link.
- Don't open panels on hover; don't put buttons or forms inside a panel.
- Don't add a sixth group — fold new sections into the closest group.
