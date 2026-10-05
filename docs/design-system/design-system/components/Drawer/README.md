# Drawer

A full-height panel that slides in from one side over a scrim — for list filters, record details and inline edits (from the end side) and for navigation (from the start side).

Use it for filters on mobile and tablet (P2, P5), the ops navigation below 1024 (P9–P11), the public site menu below 1024, and settings edits on desktop (P11). Don't use it for confirmations (`Modal`) or for a single choice on mobile (`BottomSheet`).

## Which side for which use

`.hz-drawer` is positioned with `inset-inline-end: 0`, so **by default it opens from the END side — the left in RTL** (the right in LTR).

| Use | Side | Classes |
|---|---|---|
| Navigation (OpsShell, SiteShell menu) | **start** — right in RTL, where the sidebar and the hamburger live | `.hz-drawer--start .hz-drawer--nav` |
| Filters, record details, settings edit, document preview | **end** — left in RTL, away from the navigation | `.hz-drawer` (default), `--full-mobile` for filters |

Navigation comes from the same side as the desktop sidebar so the mental model holds when the layout grows.

## Anatomy

1. Scrim (`.hz-scrim`)
2. Panel, full height, `bg-surface` (nav: `bg-chrome`), `shadow-overlay-lg`
3. Head: title (or logo for nav) + close `IconButton` at the inline end
4. Body — scrolls
5. Foot (filters/edit): primary at start, secondary at end; both stretch

## CSS API

| Class | Role |
|---|---|
| `.hz-drawer` | panel at inline end, `min(400px, 100%)` wide |
| `.hz-drawer--start` | panel at inline start |
| `.hz-drawer__head` · `__title` · `__body` · `__foot` ★ | parts — *css-additions/Drawer.css* |
| `.hz-drawer--nav` ★ | chrome background, `min(320px, 100% − 56px)` so a strip of page stays tappable; hosts `.hz-sidebar` |
| `.hz-drawer--full-mobile` ★ | 100% wide below 768 (full-screen filters), 400px from 768 |

```html
<div class="hz-scrim"></div>
<div class="hz-drawer hz-drawer--full-mobile" role="dialog" aria-modal="true" aria-labelledby="f">
  <div class="hz-drawer__head"><h2 class="hz-drawer__title" id="f">فیلترها</h2><button class="hz-icon-btn" aria-label="بستن فیلترها">…x…</button></div>
  <div class="hz-drawer__body">…</div>
  <div class="hz-drawer__foot"><button class="hz-btn hz-btn--primary">نمایش نتیجه‌ها</button><button class="hz-btn hz-btn--secondary">پاک کردن همه</button></div>
</div>
```

## Tokens

`bg-surface`, `bg-chrome` (nav), `border-subtle`/`border-default`, `shadow-overlay-lg`, `z-overlay`, `z-modal`, `duration-slow` + `ease-enter`/`ease-exit` for the slide.

## Variants & sizes

- **Filter (end)** — `/veterinarians`: «شهر» select, «تخصص» chips (from `taxonomy.vetSpecialties`), «فقط دامپزشک معتمد» checkbox; foot «نمایش نتیجه‌ها» / «پاک کردن همه».
- **Navigation (start)** — association ops: logo + «محیط عملیاتی انجمن», grouped items with queue counts (5–24 items; long lists scroll inside the panel).
- **Detail / edit (end, desktop)** — settings key edit with reason; 400px.

## States

- Open/closed: slides from its side (`duration-slow`), no motion with reduced motion.
- Filter changes apply on «نمایش نتیجه‌ها»; the trigger chip shows the active count («فیلترها ۲»).
- Close `IconButton` hover/focus as usual; foot buttons follow `Button` states (loading while results count).
- **Long text:** long chip labels («اورژانس و مراقبت‌های ویژه») wrap the chip row; long nav labels ellipsise (`hz-side-item__label`).
- Empty filter result → the list shows the filtered `EmptyState`, not the drawer.

## Mobile ↔ desktop

<768: filters full-screen (`--full-mobile`); nav drawer 320px max. 768–1023: filters 400px from the end; OpsShell uses the collapsed icon sidebar, the nav drawer is for SiteShell/PublicShell menus. ≥1024: nav drawers are replaced by the sidebar/header; filters become a side column or bar; the end drawer remains for details and settings edits.

## RTL & LTR

Sides are logical (`inset-inline-start/end`): in LTR nav opens from the left and filters from the right with no CSS change. Slide direction must also be logical — translate by `100%` towards the side the panel lives on, flipped with `[dir]`. `list` and `x` are not mirrored; `sidebar-simple` is.

## Accessibility

- `role="dialog"`, `aria-modal="true"`, labelled by its title (nav: `aria-label="ناوبری محیط عملیاتی انجمن"`, the list inside is a `<nav>`).
- Trigger has `aria-expanded` + `aria-controls`.
- Focus moves into the drawer (first control, or the current nav item), Tab is trapped, Escape and scrim click close, focus returns to the trigger; page behind is `inert`.

## Data

Filter facets from taxonomy (cities, specialties) and the list's query params; nav items and counts from the role's nav (`roles.json`) and queue counts. Counts in Persian digits; missing count → no pill.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/overlay.tsx`: `Drawer(props: OverlayProps)` — `{ open, onClose, title, children, footer? }`. Keep; add `side?` and `variant?`.


`src/ui/overlay.tsx` — `Drawer`. Proposed: `open`, `onClose`, `side?: 'end' | 'start'` (default `end`), `variant?: 'panel' | 'nav'`, `fullOnMobile?`, `title`, `footer?`. OpsShell's mobile navigation (today drawn over the content) moves to `Drawer side="start" variant="nav"`.

## Do / Don't

- Do open navigation from the start side and everything else from the end side.
- Do keep the foot visible while the body scrolls.
- Don't nest drawers or open a modal over a drawer.
- Don't use physical `left/right` to place it — LTR must work unchanged.
