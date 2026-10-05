# Breadcrumbs

The path from a section root to the current page («خانه / حیوان‌های من / لونا»), shown from 768px up. On mobile it is replaced by a single «بازگشت» link to the parent.

Use it on public detail pages and on records in every shell (manifest: «صفحه‌های عمومی و پرونده‌ها»), usually inside PageHeader (`.hz-page-header__crumbs`) or the OpsShell top bar (`.hz-topbar__crumbs`). Don't use it on top-level pages (a lone «خانه» is noise), in multi-step forms (Stepper), or as a second main navigation.

## Anatomy

1. `<nav aria-label="مسیر">` landmark.
2. `<ol class="hz-breadcrumbs">`: ancestors as links (`text-secondary`), separators «/» (`__sep`, `text-disabled`, `aria-hidden`), and the **current page** as text (`aria-current="page"`, `text-primary` Bold).
3. Optional **collapsed middle** `__more` «…» button (more than 4 levels).
4. **Mobile back link** `.hz-breadcrumbs-back`: mirrored `arrow-left` + «بازگشت», pointing to the parent crumb.

## CSS API

Bundle: `.hz-breadcrumbs`, `__sep`, `a`, `[aria-current="page"]`; PageHeader's `.hz-page-header__crumbs` / `__back--mobile`; topbar `.hz-topbar__crumbs`; utilities `.hz-show-md` / `.hz-hide-md`.
Additions (`tools/css-additions/Breadcrumbs.css`): `li` alignment, link min-height 32 (44 coarse), `__text` (truncation), `__more`, `.hz-breadcrumbs-back`.

```html
<nav aria-label="مسیر">
  <ol class="hz-breadcrumbs hz-show-md">
    <li><a href="/">خانه</a></li><li class="hz-breadcrumbs__sep" aria-hidden="true">/</li>
    <li><a href="/veterinarians">دامپزشکان</a></li><li class="hz-breadcrumbs__sep" aria-hidden="true">/</li>
    <li><span aria-current="page">دکتر مریم صادقی</span></li>
  </ol>
  <a class="hz-breadcrumbs-back hz-hide-md" href="/veterinarians" aria-label="بازگشت به دامپزشکان">…arrow-left.hz-icon--mirror بازگشت</a>
</nav>
```

## Tokens

`text-secondary` (links) · `text-brand` (link hover) · `text-primary` (current, back link) · `text-disabled` (separator) · `icon-strong` (back arrow) · `bg-subtle` (`…` hover) · `focus-ring` · `radius-xs` (focus on links) · `radius-sm` (back link).

## Variants & sizes

- **Page** (PublicShell, SiteShell): above the H1 in PageHeader, 13/20.
- **Top bar** (OpsShell): in `.hz-topbar__crumbs`, replacing the page title on desktop.
- **Collapsed**: more than 4 levels shows first / … / parent / current. «…» is a button (`aria-label="نمایش ۲ سطح پنهان"`) that expands the trail in place.
- **Mobile back**: one link, 44px high, «بازگشت».
- One text size. Never larger than body-sm.

## States

- **default**: ancestors secondary, current Bold.
- **hover** (pointer only): link turns `text-brand` + underline.
- **focus-visible**: ring on the link (2px offset, `radius-xs`).
- **active / current**: `aria-current="page"`, not a link.
- **loading**: ancestors come from the route and render immediately. Only the record name is a 64px skeleton.
- **error / not found**: the trail ends at the last ancestor that exists (no «یافت نشد» crumb).
- **disabled**: n/a. An ancestor the user can't open (no role) is plain text, not a disabled link.
- **long Persian text**: a crumb is cut with «…» at 240px (current 320px), with the full name in `title` and in the DOM. Preview: «مرکز جامع درمانی، جراحی و تصویربرداری حیوانات خانگی و پرندگان زینتی دکتر صالحی». The H1 below shows it in full.

## Mobile ↔ desktop

- **<768**: only `.hz-breadcrumbs-back` «بازگشت» to the parent crumb, never the trail (manifest). It is a 44px target at the start of the content (PageHeader's `__back--mobile` is the same link inside the header).
- **768–1023**: full trail, wrapping to a second line if needed (no horizontal scroll). Coarse pointers get 44px link heights.
- **≥1024**: full trail. In OpsShell it moves into the top bar.

## RTL & LTR

The trail runs from the start edge (right in RTL), and «/» is direction-neutral. The back arrow is `arrow-left` + `.hz-icon--mirror`, so it points → (to the start) in RTL. Latin identifiers inside a crumb are `<bdi class="hz-id" dir="ltr">` inside a wrapping `<span>` («سفارش 854Q6KUX»), so the space before the code survives.

## Accessibility

- `<nav aria-label="مسیر">` + ordered list. Separators are `aria-hidden`. The current page is `aria-current="page"`.
- The back link's accessible name names the target («بازگشت به دامپزشکان») while the visible label stays «بازگشت».
- Collapsed «…» is a real button with `aria-expanded`. After expanding, focus moves to the first revealed link.
- Truncated text is visual only, and screen readers get the full name.

## Data

Crumbs come from the route tree (`src/authz/routes.ts` labels) plus the record's display name (`animal.name` or «بدون نام», `vet.displayNameFa`, order `number`). The parent link is the previous crumb. On mobile the back link uses that same parent href, not `history.back()`, so a deep link still goes somewhere sensible.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/breadcrumbs.tsx`: `Breadcrumbs({ items: Crumb[], origin: string })` with `Crumb = { name, path }` (from `src/seo/structured-data.ts`); it also emits the BreadcrumbList JSON-LD. Keep both props and the JSON-LD; add `maxItems?`.


`src/ui/breadcrumbs.tsx`: keep its items API. Proposed additions: `maxItems = 4` (collapse), `truncate = 240`, and `mobile: 'back' | 'hidden'` (default `'back'`, rendering `.hz-breadcrumbs-back` from the last ancestor). PageHeader passes `crumbs` through (PageHeader README).

## Do / Don't

- Do end the trail with the current page as text.
- Do keep the mobile label to «بازگشت». The parent's name is in the accessible name.
- Don't show breadcrumbs with fewer than 2 levels.
- Don't put status, counts or icons in crumbs.
