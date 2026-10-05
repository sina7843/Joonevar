# BulkActionBar

The bar that appears when several cases in a queue are selected: the count «۳ پرونده انتخاب شد», the bulk actions, an offer to select the whole queue, and «لغو انتخاب».

Use it on P9 queues that allow bulk work (assignment, hiding listings, closing duplicate reports). It does not exist until at least one row is selected. Don't offer bulk *decisions* that need documents (KYC approve/reject); those stay one case at a time in DecisionDesk.

## Anatomy

1. **Count** (Bold 15, `aria-live`): «۳ پرونده انتخاب شد». The noun is always «پرونده» in ops queues.
2. **Select across pages** (only when every row on the page is selected): link «انتخاب همه ۲۴ پرونده این صف».
3. **Actions** (secondary sm buttons with icon): «واگذاری به…» (opens a menu: به من · اپراتور دیگر…), queue-specific actions such as «پنهان‌کردن آگهی‌ها» (opens Modal + ReasonField). Max 3 visible; the rest go in «کنش‌های بیشتر».
4. **Clear**: separator + ghost «لغو انتخاب» with `x`.
5. **Note** (optional, `.hz-bulkbar__note`, caption 12/20 `text-secondary`, one sentence): says why the expected action is not here — «ثبت نتیجه و تصمیم روی نمونه گروهی انجام نمی‌شود؛ هر پرونده را جداگانه باز کنید.» Sits between the count and the actions; on mobile it takes its own row.
6. **Selection**: table rows get a checkbox column and `aria-selected`; the header checkbox is indeterminate when some rows are selected.

## CSS API

Bundle: `.hz-btn--secondary` `--ghost` `--sm`, `.hz-icon-btn--outline`, `.hz-link`, `.hz-table__check`, `.hz-table tr[aria-selected="true"]`, `.hz-check`, `.hz-cardlist`, `.hz-alert--warning`, `.hz-spinner`.
Additions (`tools/css-additions/BulkActionBar.css`): `.hz-bulkbar` `__count` `__all` `__actions` `__sep` `__row`, `--sticky` (desktop, under the ops top bar), `--bottom` (mobile dock), and selectable cards `.hz-cardlist__item--select` / `--selected` with `.hz-cardlist__body`.

```html
<div class="hz-bulkbar hz-bulkbar--sticky" role="region" aria-label="کنش گروهی">
  <span class="hz-bulkbar__count" aria-live="polite">۳ پرونده انتخاب شد</span>
  <div class="hz-bulkbar__actions">
    <button class="hz-btn hz-btn--secondary hz-btn--sm" aria-haspopup="menu">…user-plus… واگذاری به…</button>
    <button class="hz-btn hz-btn--secondary hz-btn--sm">…eye-slash… پنهان‌کردن آگهی‌ها</button>
    <span class="hz-bulkbar__sep" aria-hidden="true"></span>
    <button class="hz-btn hz-btn--ghost hz-btn--sm">…x… لغو انتخاب</button>
  </div>
</div>
```

## Tokens

`bg-chrome` (bar, per direction A sticky bars) `border-default` `shadow-sticky` (mobile dock) `bg-brand-subtle` + `border-brand` (selected rows/cards) `action-primary` (checked boxes) `status-warning-*` (partial result) `radius-lg` `duration-base` `ease-enter` `z-sticky` `header-app`.

## Variants & sizes

- **Desktop** (`--sticky`): one line above the table, sticks at `inset-block-start: header-app`.
- **Mobile** (`--bottom`): docked to the bottom edge; row 1 count + «لغو انتخاب», row 2 two actions + «…» menu, 44px buttons.
- **All on page selected**: count «هر ۵ پرونده این صفحه انتخاب شد» + the select-across link; after clicking it: «هر ۲۴ پرونده این صف انتخاب شد» + «فقط این صفحه».

## States

- **Hidden**: nothing selected; the queue tools (search, filters, sort) show instead.
- **Appearing**: fades/slides in (`duration-base`); none under reduced motion.
- **Hover / focus-visible**: as Button; the select-across link gets the focus ring.
- **Running**: the triggered action shows spinner + «در حال واگذاری ۳ پرونده»; other actions and clear are disabled; selection is locked.
- **Partial result**: warning Alert «۲ از ۳ پرونده به شما واگذار شد» + which case failed and why; failed rows stay selected.
- **Error**: error Alert, selection kept.
- **Long Persian text**: action labels never truncate; actions wrap under the count on narrow widths; the count never wraps.

## Mobile ↔ desktop

- **Select mode on mobile:** an outline `IconButton` with `check-square` and `aria-pressed` («انتخاب چندتایی») at the end of the tool row turns it on; it becomes `check-square` fill + «لغو» when active. Cards then show a 44px checkbox at the start and the bar docks at the bottom.
- **<1024**: queues are card lists; each card has a 44px checkbox target at the start; long-press is not required. The bar is the bottom dock (render with `.hz-hide-lg`) and sits above the tab/home indicator.
- **≥1024**: table checkbox column (44px), header checkbox, sticky bar above the table.

## RTL & LTR

Count at the start, actions toward the end (`margin-inline-start: auto`). `user-plus`, `eye-slash`, `x`, `dots-three` are not mirrored. The mobile dock uses `inset-block-end`, never physical bottom/left.

## Accessibility

- The bar is `role="region"` «کنش گروهی»; the count is `aria-live="polite"`.
- Row checkboxes are labelled «انتخاب توله ژرمن شپرد»; the header checkbox «انتخاب همه پرونده‌های این صفحه» uses `indeterminate`.
- Space toggles the focused row's checkbox; Shift+click selects a range (desktop).
- When the bar appears, focus stays on the checkbox the user toggled; Escape clears the selection.

## Data

Selection state is client-side: `selectedIds[]` or `{ allInQueue: true, filters }`. Bulk calls send `{ action, ids | query, expectedVersions }` and return per-id results `{ id, ok, errorCode? }` for the partial-result Alert. Every success writes one AuditRow per case.

## Code mapping

★ New `src/ops/bulk-action-bar.tsx`: `BulkActionBar({ count, total, pageCount, allInQueue, onSelectAllInQueue, onClear, actions: { id, labelFa, icon, requiresReason?, menu? }[], running?: { actionId, labelFa }, result? })`. CaseQueue gets `selectable` and `onSelectionChange`.

## Do / Don't

- Do show exactly how many cases an action will touch, in the button's confirm step too.
- Do route any bulk action that needs a reason through Modal + ReasonField (one reason for all).
- Do keep failed items selected and say why.
- Don't make a bulk action the primary (orange) button; the queue page has none.
- Don't allow bulk approve/reject of identity or document cases.
