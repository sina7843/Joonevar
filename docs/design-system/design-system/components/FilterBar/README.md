# FilterBar

The control row above a list: quick-filter chips with counts, a «فیلترها» button that opens the full filter set, a sort select, and «پاک کردن همه».

Every list gets one (requests, animals, payments, queues, directory, market, magazine). On mobile the chips scroll horizontally and the full set opens in a full-screen Drawer; on desktop it is a bar, or a side column for long public lists. Do not use chips as navigation tabs or as form choices (use Tabs / RadioCard).

## Anatomy

1. `.hz-filterbar` container.
2. Chip group `<fieldset class="hz-filterbar__chips">` ★ — `.hz-chip` toggle buttons with `.hz-chip__count`.
3. End group `.hz-filterbar__end` ★ — «پاک کردن همه» TextLink (only when something is active), «فیلترها» button (`funnel-simple` + `.hz-count--alert` with the number of active filters), sort select.
4. Mobile: the Drawer `.hz-drawer.hz-drawer--full-mobile` (Drawer component; full width <768, 400px from 768) — head (title + close), body with `.hz-filter-group` fieldsets of checkboxes with counts, foot with primary «نمایش N نتیجه» + ghost «پاک کردن همه».
5. Desktop side column: the same `.hz-filter-group`s in a Card at the start of the page.

## CSS API

| Class | Purpose |
|---|---|
| `.hz-filterbar` | Wrapping row, 8px gap |
| `.hz-filterbar--scroll` | One line, horizontal scroll, hidden scrollbar (mobile) |
| `.hz-filterbar--bleed` ★ | Scroll row runs to the screen edge (−16px inline margin) so a cut chip shows there is more |
| `.hz-chip` · `[aria-pressed="true"]` · `.hz-chip__count` | Toggle chip, active state, count |
| `.hz-filterbar__chips` / `__end` / `__sort` ★ | Chip group, end group, sort width 220 |
| `.hz-select--sm` ★ | 36px select for the desktop bar (44 on coarse pointers) |
| `.hz-drawer--full-mobile` | From Drawer: full width <768, 400px ≥768 |
| `.hz-filter-group` / `__title` ★ | Fieldset of checkboxes in drawer or side column |

★ in `tools/css-additions/FilterBar.css`. Drawer internals are the Drawer component's `hz-drawer__head / __title / __body / __foot`.

```html
<div class="hz-filterbar">
  <fieldset class="hz-filterbar__chips" aria-label="وضعیت درخواست">
    <button class="hz-chip" type="button" aria-pressed="true">نیازمند اقدام شما <span class="hz-chip__count">۲</span></button>
  </fieldset>
  <div class="hz-filterbar__end">
    <a class="hz-link hz-body-sm" href="?">پاک کردن همه</a>
    <button class="hz-btn hz-btn--secondary hz-btn--sm" type="button" aria-haspopup="dialog">…funnel-simple… فیلترها <span class="hz-count hz-count--alert">۲</span></button>
    <label class="hz-select-wrap hz-filterbar__sort"><span class="hz-visually-hidden">مرتب‌سازی</span><select class="hz-select hz-select--sm">…</select></label>
  </div>
</div>
```

## Tokens

`bg-surface` · `border-control` (chip, button, select) · `bg-brand-subtle` + `border-brand` + `text-brand` (pressed chip) · `text-secondary` (counts) · `action-primary` + `text-on-action` (active-count badge) · `shadow-overlay-lg` (drawer) · `border-subtle` (group hairlines) · `radius-full` (chips) · `radius-md` (controls) · `focus-ring`.

## Variants & sizes

- **Bar** (≥768): chips + end group on one row; wraps to two rows when needed (end group stays together).
- **Scroll** (<768): chips one line with `--scroll --bleed`; below it «فیلترها» (44px) + sort select side by side.
- **Drawer** (<768, and 768–1023): full-screen on mobile, 400px side drawer on tablet. Changes are applied only with «نمایش N نتیجه»; N updates live.
- **Side column** (≥1024, long public lists: directory, market, magazine archive): 280px column at the start; each change applies immediately.
- Chips 36px on fine pointers, 44px on coarse.

## States

- **default** — «همه» pressed, no clear link, no active count.
- **hover (pointer only)** — button: `action-secondary-hover`; chip: proposed `action-secondary-hover` ground (bundle.css has no chip hover yet).
- **focus-visible** — `focus-ring` on chips, button, select.
- **pressed** — `aria-pressed="true"`; a pressed chip counts as one active filter.
- **disabled** — an option with ۰ results stays visible; in the drawer its checkbox is disabled, as a chip it stays enabled and shows ۰ (choosing it gives the filtered-empty state).
- **loading** — counts are replaced by a 16px spinner, chips stay usable.
- **error** — counts that failed to load are hidden (never show ۰ for "unknown").
- **empty result** — the list shows «نتیجه‌ای با این فیلترها پیدا نشد» + «پاک کردن همه».
- **long Persian text** — chips never wrap internally (`nowrap`); long labels push the row to scroll (mobile) or wrap the row (desktop).

## Mobile ↔ desktop

- <768: scroll chips + «فیلترها» + sort; full-screen Drawer; sticky foot in the drawer.
- 768–1023: bar; «فیلترها» opens a 400px Drawer from the end.
- ≥1024: bar above DataTable (PublicShell/OpsShell) or side column (SiteShell lists).

## RTL & LTR

Chips flow from the start; the end group is pushed to the end with `margin-inline-start: auto`. Scroll starts at the start edge. `funnel-simple` and `x` are not mirrored. Counts use Persian digits.

## Accessibility

- Chip group is a `<fieldset>` with `aria-label`; chips are `<button aria-pressed>`.
- «فیلترها» has `aria-haspopup="dialog"` and `aria-expanded`; its count badge has `aria-label="۲ فیلتر فعال"`.
- Drawer: `role="dialog" aria-modal="true" aria-labelledby`, focus trapped, Esc closes, focus returns to «فیلترها».
- Result count is announced in a polite live region after every change.
- Sort select has a visually hidden label «مرتب‌سازی».

## Data

Chip sets come from the status dictionary families for the list (requests: «نیازمند اقدام شما» = family `action` with owner USER, «در انتظار دیگران» = `waiting`, «پایان‌یافته» = `done` + `closed`). Counts are server totals per filter (sample: ۵ / ۲ / ۳ / ۰ from `requests-and-payments.json`). Sort options come from the list's sortable columns. Filter state lives in the URL query.

## Code mapping

★ New. Proposed `src/ui/filter-bar.tsx`: `FilterBar` — `quick: { value; label; count?: number | null }[]`, `quickValue`, `onQuickChange`, `filters: FilterGroup[]` (`{ key; label; options: { value; label; count? }[]; multi }`), `value`, `onApply`, `sort: { options; value; onChange }`, `resultCount`, `layout: 'bar' | 'side'`. The mobile/tablet panel reuses the Drawer component (P0).

## Do / Don't

- Do show counts on chips when they are known; hide them when they are not.
- Do keep «پاک کردن همه» hidden until something is active.
- Don't put more than 5 quick chips; the rest belong in the drawer.
- Don't apply drawer filters on every tap on mobile — one «نمایش N نتیجه».
