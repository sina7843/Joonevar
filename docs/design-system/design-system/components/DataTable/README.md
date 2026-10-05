# DataTable

One collection of records shown as a full table at ≥1024px and as a card list (CardList) below 768px — the same rows, never a horizontally scrolled table on a phone.

Use it for every list of records with ≥3 comparable fields: requests, payments, queues, orders, listings in ops. Do not use it for one record's details (KeyValueList) or for editorial lists (Article cards). Today `<table>` exists in only one page (product comparison); every panel needs this.

## Anatomy

**Table (≥1024)**: `.hz-table-wrap` (white, `border-default`, `radius-xl`) → `<table class="hz-table">` → sticky header row on `bg-subtle` → body rows with `border-subtle` hairlines. Optional: selection column (`.hz-table__check`), sortable header buttons, numeric end-aligned cells, row action link at the end, a selection bar above («۱ مورد از ۵ درخواست انتخاب شد»).

**CardList (<768)**: `<ul class="hz-cardlist">` → `.hz-cardlist__item` (white, `border-default`, `radius-lg`) → title row (title + StatusBadge) → meta row (Identifier + date) → ActionOwner with the row's action.

## CSS API

| Class | Purpose |
|---|---|
| `.hz-table-wrap` | Bordered container; clips the corners |
| `.hz-table-wrap--scroll` ★ | Vertical scroll inside a fixed height so the header stays sticky; horizontal overflow hidden |
| `.hz-table` | Table base, 14/22 |
| `.hz-table--dense` | Rows 40px (OpsShell queues) instead of 44 |
| `th[aria-sort] > button` | Sortable header; indicator icon `caret-up-down` (none), `arrow-up` / `arrow-down` (sorted) |
| `.hz-num` | End-aligned numeric cell/header (money, counts) |
| `tr[aria-selected="true"]` | Selected row, `bg-brand-subtle` |
| `.hz-table__check` | 44px selection column |
| `.hz-owner--compact` ★ | Pill-sized ActionOwner for a cell (only the owner name; the column header says «اقدام بعدی با») |
| `.hz-cardlist` / `__item` / `__row` | Mobile card list |
| `.hz-cardlist__title` / `__meta` ★ | Title (15/24 Bold) and secondary line (12/20) |

★ in `tools/css-additions/DataTable.css` (also: sort-button focus ring, compact checkbox in a cell).

```html
<div class="hz-table-wrap"><table class="hz-table">
  <thead><tr><th scope="col" aria-sort="descending"><button type="button">به‌روزرسانی <svg …arrow-down…/></button></th><th scope="col" class="hz-num">مبلغ</th></tr></thead>
  <tbody><tr aria-selected="true"><td>۱۴۰۵/۰۷/۰۷</td><td class="hz-num">۴۰۰٬۰۰۰ تومان</td></tr></tbody>
</table></div>
```

## Tokens

`bg-surface` · `bg-subtle` (header, row hover) · `bg-brand-subtle` (selected) · `border-default` · `border-subtle` · `text-secondary` (header) · `icon-default` (sort icon) · `action-primary` (checkbox) · `focus-ring` · `radius-xl` / `radius-lg` · `status-*` via StatusBadge · `status-warning-bg` via ActionOwner «شما».

## Variants & sizes

- **default** — PublicShell lists, 44px rows.
- **dense** — OpsShell queues and finance, 40px rows, `hz-badge--sm`.
- **selectable** — checkbox column + header checkbox (indeterminate when some are selected) + selection bar with bulk actions.
- **CardList** — the mobile form of any of the above.
- **Sort indicator (one rule for all tables, CaseQueue included):** unsorted `caret-up-down`, sorted `arrow-up` / `arrow-down` in the header button. `sort-ascending` / `sort-descending` belong only to the `SortMenu` button.

## States

- **default** · **hover (pointer only)** — row `bg-subtle` · **focus-visible** — on the row's link, checkbox and sort button (`focus-ring`) · **selected** — `aria-selected="true"` + `bg-brand-subtle`.
- **sorted** — header text `text-primary` and arrow; only one sorted column at a time.
- **loading** — keep the header, 2–5 skeleton rows; `aria-busy="true"` on the wrap.
- **empty** — `hz-state` inside the wrap with the reason and the next step («هنوز درخواستی ثبت نکرده‌اید» + «ثبت حیوان»). Filtered-to-zero says so and offers «پاک کردن همه».
- **error** — `hz-state--error` with «بارگذاری دوباره».
- **disabled** — rows are never disabled; a row whose action is unavailable shows no action link.
- **long Persian text** — cells wrap (no ellipsis on titles); status labels never wrap (`white-space: nowrap`); in CardList a long badge drops to its own row, a correction reason is shown in full.

## Mobile ↔ desktop

- <768: **CardList only.** Never a table, never `overflow-x: auto` on a table. Primary action of each item lives in its ActionOwner row; bulk selection is an ops-only mode («انتخاب») that adds a checkbox at the item start.
- 768–1023: table with fewer columns — drop «حیوان» and «مبلغ», merge code under the title.
- ≥1024: full table. Header sticky inside `--scroll` or under the app top bar.
- Coarse pointers: checkbox labels, sort buttons and row links ≥44px.

## RTL & LTR

`text-align: start` everywhere; `.hz-num` aligns to the end (left in RTL) so digits line up. Dates use Persian digits and are start-aligned. Codes are `<bdi class="hz-id" dir="ltr">`. Sort arrows are non-directional (up/down) and are not mirrored.

## Accessibility

- Real `<table>` with `<caption>` (visually hidden is fine), `scope="col"`, and `aria-sort` on the sorted `th` (`none` on sortable but unsorted). The sort control is a `<button>` inside the `th`.
- Selection: each checkbox has `aria-label="انتخاب HZ-…"`; header checkbox «انتخاب همه» with `indeterminate`; announce the selection count in a polite live region.
- CardList is a `<ul>` with `aria-label`; each item reads title → status → owner.
- Row actions are links with specific text («پرداخت», «اصلاح», «پیگیری»), not «بیشتر».

## Data

Requests (`requests-and-payments.json` ← `src/db/schema` requests): `code`, `titleFa`, `animalName` (null → «—»), `status` → StatusBadge label/tone from the status dictionary, `actionOwnerFa` → ActionOwner («شما» uses the `--you` tone), `amount.displayFa` (absent → «—», never ۰), `updatedAt.displayFa` / `longFa`. Payments (dense demo): `reference`, `serviceFa`, `status`, `amount.displayFa`.

## Code mapping

★ New. Proposed `src/ui/data-table.tsx`: `DataTable<T>` — `columns: { key; header; cell(row); numeric?; sortable?; hideBelow?: 'lg' }[]`, `rows: T[]`, `rowKey`, `sort?: { key; dir: 'asc' | 'desc' }`, `onSortChange`, `selectable?`, `selected?: Set<string>`, `onSelectedChange`, `density: 'default' | 'dense'`, `loading`, `empty: ReactNode`, `renderCard(row)` for the CardList. The component renders both and switches by breakpoint (CSS), so the same `rows` feed both.

## Do / Don't

- Do define `renderCard` for every table — there is no mobile table.
- Do end-align money and counts; keep text start-aligned.
- Don't colour rows by status; the badge carries the tone.
- Don't put more than one action link per row; bulk actions go in the selection bar.
