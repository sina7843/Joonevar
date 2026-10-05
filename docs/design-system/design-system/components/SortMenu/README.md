# SortMenu

A button that names the current order of a list («مرتب‌سازی: نزدیک‌ترین مهلت») and opens a menu of sort options, one of them checked.

Use it above any sortable list or card grid: requests, animals, queues, shop, directory, market. Don't use it to filter (that is FilterBar), and don't use it for one-off actions (that is PopoverMenu «بیشتر»). A DataTable column header can also sort (`th[aria-sort]`). When both are on a page they must show the same order.

## Anatomy

1. **Trigger**: secondary button with `sort-ascending` (start), a muted label «مرتب‌سازی:», the current value in Bold (`__value`, cut with «…» when space is short) and a `caret-down` that turns while the menu is open.
2. **Menu** (≥768): PopoverMenu panel with a group label «مرتب‌سازی بر اساس» and `menuitemradio` options. The checked option is Bold with a `check` at the end. An option that can't be used now is disabled and says why (`.hz-menu__hint`).
3. **Sheet** (<768): the same options as Radio rows in a BottomSheet titled «مرتب‌سازی». A tap applies the option and closes the sheet, with no confirm button.

## CSS API

Composes **PopoverMenu** (`.hz-popover`, `.hz-menu-trigger`, `.hz-menu-trigger__caret`, `.hz-menu.hz-menu--popover`, `.hz-menu__action[role=menuitemradio]`, `.hz-menu__action-label`, `.hz-menu__check`, `.hz-menu__hint`), bundle `.hz-menu__group-label`, `.hz-btn--secondary --sm`, and BottomSheet + Radio on mobile.
Additions (`tools/css-additions/SortMenu.css`): `.hz-sort` (wrapper modifier), `.hz-sort__trigger` (shrinkable), `.hz-sort__label`, `.hz-sort__value`.

```html
<div class="hz-popover hz-sort">
  <button class="hz-btn hz-btn--secondary hz-btn--sm hz-sort__trigger hz-menu-trigger" type="button"
          aria-haspopup="menu" aria-expanded="false" aria-controls="sort-req">
    …sort-ascending <span class="hz-sort__label">مرتب‌سازی:</span><span class="hz-sort__value">نزدیک‌ترین مهلت</span> …caret-down.hz-menu-trigger__caret
  </button>
  <div class="hz-menu hz-menu--popover" role="menu" id="sort-req" aria-label="مرتب‌سازی درخواست‌ها" hidden>
    <p class="hz-menu__group-label" aria-hidden="true">مرتب‌سازی بر اساس</p>
    <button class="hz-menu__action" type="button" role="menuitemradio" aria-checked="true" tabindex="0">
      <span class="hz-menu__action-label">نزدیک‌ترین مهلت</span>…check.hz-menu__check</button>
  </div>
</div>
```

## Tokens

`action-secondary` · `action-secondary-hover` (hover, open trigger) · `border-control` · `text-primary` · `text-secondary` (label, hint) · `text-disabled` · `text-brand` (check) · `icon-default` (caret) · `bg-surface` + `border-default` + `shadow-overlay-sm` + `radius-lg` (menu) · `bg-subtle` (hover/active option) · `focus-ring` · `radius-md` (trigger) · `radius-sm` (option).

## Variants & sizes

- **sm trigger** (36, 44 on coarse pointers): toolbars in PublicShell and OpsShell, next to FilterBar.
- **md trigger** (44): mobile toolbar, half width next to «فیلترها». The label «مرتب‌سازی:» is dropped and only the icon and value show.
- **Icon only** (`.hz-icon-btn--outline --sm`): dense OpsShell bars next to search. Its `aria-label` carries the value («مرتب‌سازی: قدیمی‌ترین پرونده»).
- Menu aligns to the trigger's end edge (`.hz-menu--align-start` when the trigger sits at the start).

## States

- **default**: the value always shows. There is no «مرتب‌سازی» trigger without a value.
- **hover** (pointer only): trigger `action-secondary-hover`; option `bg-subtle`.
- **focus-visible**: ring on the trigger. In the menu the roving option gets `bg-subtle` + an inner ring.
- **open**: `aria-expanded="true"`, caret rotated 180°, trigger keeps the hover ground.
- **disabled**: the whole trigger when the list is empty. A single option when it can't apply, with its hint: «نزدیک‌ترین فروشنده»: «شهر شما ثبت نشده».
- **loading**: after a choice the list reloads; `sort-ascending` is replaced by a 16px spinner and the trigger gets `aria-busy="true"`. A polite live region says «در حال مرتب‌سازی فهرست», then the result count.
- **error**: the list's own error state. The trigger keeps the previous value, because the order did not change.
- **long Persian text**: «نزدیک‌ترین مهلت پاسخ فروشنده» is cut with «…» in a 220px slot. The full value stays in the menu and in the accessible name.

## Mobile ↔ desktop

- **<768**: md trigger opens a BottomSheet of Radio rows (44px+). Choosing applies the option and closes the sheet.
- **768–1023**: sm trigger + popover menu (coarse pointers: 44px options).
- **≥1024**: sm trigger at the end of the FilterBar / CaseQueue toolbar.

## RTL & LTR

Icon at the start, caret at the end. The menu opens under the trigger and aligns to its end edge. `sort-ascending`, `caret-down` and `check` are never mirrored. The option order is the reading order.

## Accessibility

- Trigger: `aria-haspopup="menu"`, `aria-expanded`, `aria-controls`. Its name reads «مرتب‌سازی: نزدیک‌ترین مهلت».
- Menu: `role="menu"` with `aria-label`. Options are `role="menuitemradio"` + `aria-checked`, with roving `tabindex`.
- Keyboard: Enter, Space or ↓ opens the menu and focuses the checked option. ↑ and ↓ move, Home and End jump. Enter or Space chooses and closes. Esc closes. Focus returns to the trigger.
- Disabled option: `aria-disabled="true"`, still focusable, with the hint inside its name.
- Sheet: BottomSheet dialog rules (focus trap, Esc, focus return). Radios are in a `<fieldset>` with a hidden legend.

## Data

Options are the list's sortable keys, defined per list (requests: «نزدیک‌ترین مهلت», «جدیدترین به‌روزرسانی», «کد درخواست»; queues: «قدیمی‌ترین پرونده» by default; shop: «جدیدترین», «ارزان‌ترین», «گران‌ترین», «بیشترین امتیاز» from `ratingAvg`). The value lives in the URL query (`?sort=`) with FilterBar state, and pagination resets to page ۱ when it changes. A default is always set, so the trigger never says «انتخاب کنید».

## Code mapping

★ New. Proposed `src/ui/sort-menu.tsx`: `SortMenu({ options: { value; label; disabled?: boolean; hint?: string }[], value, onChange, label = 'مرتب‌سازی', size?: 'sm' | 'md', iconOnly?: boolean, busy?: boolean })`. It renders PopoverMenu ≥768 and BottomSheet <768. It replaces FilterBar's `sort` select (`.hz-filterbar__sort`). FilterBar's `sort` prop passes straight through.

## Do / Don't

- Do show the current order in the trigger, always.
- Do write options as outcomes («ارزان‌ترین»), not field names plus direction («قیمت ↑»).
- Don't mix sorting and filtering in one menu.
- Don't keep a native `<select>` and a SortMenu for the same list.
