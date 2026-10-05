# PageHeader

The top of every page in all three shells: breadcrumbs (or «بازگشت» on phones), the page title with its identifier or status, a meta line, and the page's actions.

Use one per page, first thing inside `main`. Not for section titles inside a page (SectionHeader) or for the dashboard greeting's alerts (Alert).

## Anatomy

1. **Breadcrumbs** `.hz-page-header__crumbs` → `ol.hz-breadcrumbs` (≥768). Separator «/» (`hz-breadcrumbs__sep`, `aria-hidden`), last item `aria-current="page"`.
2. **Back link** `.hz-page-header__back` «بازگشت» with `arrow-left` + `hz-icon--mirror` (→ in RTL). Modifier `--mobile` shows it only below 768.
3. **Title row** `.hz-page-header__title-row`: `h1` + optional Identifier (`PET-…`, copy button) or StatusBadge or a count.
4. **Meta** `.hz-page-header__meta`: species · breed · sex, dates, microchip, case age, «به‌روزشده …».
5. **Actions** `.hz-page-header__actions`: start = primary, end = secondary.

## CSS API

```html
<header class="hz-page-header">
  <div class="hz-page-header__text">
    <nav class="hz-page-header__crumbs" aria-label="مسیر"><ol class="hz-breadcrumbs">
      <li><a href="/dashboard">خانه</a></li><li class="hz-breadcrumbs__sep" aria-hidden="true">/</li>
      <li><a href="/animals">حیوان‌های من</a></li><li class="hz-breadcrumbs__sep" aria-hidden="true">/</li>
      <li><span aria-current="page">رکس</span></li></ol></nav>
    <a class="hz-page-header__back hz-page-header__back--mobile" href="/animals"><svg class="hz-icon hz-icon--sm hz-icon--mirror">…arrow-left…</svg>بازگشت</a>
    <div class="hz-page-header__title-row"><h1 class="hz-h1">رکس</h1><span class="hz-identifier"><bdi dir="ltr">PET-8JDUN4GH</bdi>…</span></div>
    <div class="hz-page-header__meta"><span>سگ · ژرمن شپرد · نر</span>…</div>
  </div>
  <div class="hz-page-header__actions"><a class="hz-btn hz-btn--primary">درخواست شجره‌نامه</a><a class="hz-btn hz-btn--secondary">ویرایش اطلاعات</a></div>
</header>
```
Bundle: `hz-page-header`, `__text`, `__meta`, `__actions`, `hz-breadcrumbs`. Additions: `__crumbs`, `__back(--mobile)`, `__title-row`, `__meta-item`.

## Tokens

`text-primary` (title, current crumb, back link), `text-secondary` (crumbs, meta), `text-disabled` (separator), `text-brand` (crumb hover), `icon-default` / `icon-strong`, `status-warning-text` (late age), `focus-ring`; type `h1` (SiteShell, PublicShell) and `h3` (OpsShell).

## Variants & sizes

- **Record (PublicShell / SiteShell):** h1 32/48 desktop, 24/38 mobile; identifier or status in the title row; one primary action at most.
- **Ops queue / desk (OpsShell):** breadcrumbs live in the shell's top bar (`hz-topbar__crumbs`), so the header starts with the title; h3, count pill (`hz-count--alert` if overdue), meta with oldest age (`hz-age--late`), `hz-btn--sm` secondary actions (فیلترها، قدیمی‌ترین اول); no primary in the header of a queue.
- **Landing (SiteShell lists):** crumbs + h1 + meta count, no actions.

## States

Crumb link: default · hover (`text-brand` underline) · focus-visible (preview on «حیوان‌های من»). Missing values: «بدون نام» + «پیش‌نویس» badge, «نژاد —», «شناسه —» (edge-animal-1). Long title wraps (`overflow-wrap: anywhere`), never truncates: «شاهزاده کوچولوی باغ ارم شیراز». Identifiers never wrap. Loading: skeleton title + one meta line.

## Mobile ↔ desktop

<768: breadcrumbs hidden, «بازگشت» (44px target) to the parent from the crumb trail; title 24/38; secondary actions full size (44) under the meta; **the primary action moves to a sticky ActionRow at the bottom** (above the tab bar in PublicShell). 768–1023: crumbs visible, title 24/38, actions wrap under the text when space runs out. ≥1024: actions sit at the end of the row, aligned to the bottom of the text.

## RTL & LTR

Crumbs run from the start; «/» needs no mirroring. Back uses `arrow-left` + mirror (never a hand-picked right arrow). Identifiers, microchip and case codes in `bdi dir="ltr"`.

## Accessibility

One `h1` per page (ops uses the h3 *style* on an `h1` element). Breadcrumbs: `nav aria-label="مسیر"` + ordered list + `aria-current="page"`. Back link text «بازگشت» (the icon is `aria-hidden`). Copy button `aria-label="کپی شناسه PET-8JDUN4GH"` with a polite live-region confirmation. Focus order: crumbs → title-row controls → actions.

## Data

Title from the record (`name` or «بدون نام»), identifier `petId` or «—», meta from the record fields (`speciesFa`, `breedFa`, `sexFa`, `birthDate.longFa` with «حدود» when approximate, `registeredAt`, `microchipNumber`). Ops: queue count, oldest-case age, last refresh. Crumbs from the route tree (`src/authz/routes.ts`).

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** No component today; `Breadcrumbs` takes `Crumb = { name, path }` (not `label`/`href`). ★ New.


★ New. Existing `src/ui/breadcrumbs.tsx` (keep its items API) becomes the crumbs slot. Proposed `PageHeader { title, titleAs?: 'h1', density?: 'default' | 'ops', crumbs?: Crumb[], backHref?, meta?: ReactNode[], badge?, identifier?, actions? }`; `backHref` defaults to the parent crumb.

## Do / Don't

- Do keep actions to one primary + up to two secondary; overflow goes into a `dots-three` menu.
- Do show who acts next in the page body (ActionOwner), not in the header meta.
- Don't repeat the shell's environment label as a crumb on SiteShell/PublicShell pages.
- Don't truncate Persian titles.
