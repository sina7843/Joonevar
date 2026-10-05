# PopoverMenu

A button that opens a small floating list of actions or choices — the account menu, the sort menu and the «بیشتر» (dots-three) more-actions menu — with full arrow-key navigation.

Use it for 3–7 actions or one exclusive choice that don't deserve permanent buttons. Don't use it for site navigation groups (GroupedNav's disclosure panels), for picking a value inside a form (`SelectField` / Combobox), for filters (FilterBar) or for more than ~7 items (a page or a sheet).

## Anatomy

1. Trigger — `Button` secondary `sm` with caret (sort), `IconButton --outline` with `dots-three` (more), or `hz-topbar__account` (account). `aria-haspopup="menu"`, `aria-expanded`, `aria-controls`.
2. Popover — `.hz-menu` surface: white, `border-default`, `radius-lg`, `shadow-overlay-sm`, padding 6, `z-dropdown`, 6px from the trigger.
3. Optional head — avatar + name (2 lines max) + role and mobile (account menu only).
4. Items — 40px (44px coarse) rows: icon 20 + label (+ hint); radio items show a `check` at the end.
5. Separators — `hz-menu__sep`; destructive item last, after a separator.

## CSS API

| Class | Role |
|---|---|
| `.hz-popover` | Positioning wrapper around trigger + menu |
| `.hz-menu.hz-menu--popover` | The floating menu (bundle `.hz-menu` + new modifier); opens below, aligned to the trigger's **end** edge |
| `--align-start` · `--up` | Align to the trigger's start edge · open upward (near the bottom of the viewport) |
| `.hz-menu__head` · `__head-text` · `__head-name` · `__head-sub` | Account head |
| `.hz-menu__action` · `__action-label` · `__hint` · `__check` | Item (link or button) |
| `.hz-menu__action--destructive` · `[aria-disabled="true"]` · `[aria-checked="true"]` | Item states |
| `.hz-menu-trigger` · `__caret` | Trigger: caret turns 180° and fill stays hover while open |
| existing `.hz-menu__sep` · `.hz-menu__group-label` | Separator, group label |

```html
<div class="hz-popover">
  <button class="hz-icon-btn hz-icon-btn--sm hz-icon-btn--outline hz-menu-trigger" aria-haspopup="menu" aria-expanded="false" aria-controls="m1" aria-label="کنش‌های بیشتر برای توله ژرمن شپرد">…dots-three…</button>
  <div class="hz-menu hz-menu--popover" id="m1" role="menu" aria-label="کنش‌های آگهی" hidden>
    <a class="hz-menu__action" role="menuitem" href="…" tabindex="-1">…pencil-simple…<span class="hz-menu__action-label">ویرایش آگهی</span></a>
    <div class="hz-menu__sep" role="separator"></div>
    <button class="hz-menu__action hz-menu__action--destructive" role="menuitem" tabindex="-1">…trash…<span class="hz-menu__action-label">حذف آگهی</span></button>
  </div>
</div>
```

## Tokens

`bg-surface` · `border-default` · `border-subtle` (separators, head) · `radius-lg` / `radius-sm` (items) · `shadow-overlay-sm` · `z-dropdown` · `bg-subtle` (hover/active item) · `focus-ring` · `text-primary` · `text-secondary` · `text-disabled` · `text-brand` (check) · `status-error-text` (destructive) · `icon-default`.

## Variants & sizes

| Menu | Trigger | Items |
|---|---|---|
| Account | `hz-topbar__account` (OpsShell top bar) or the PublicShell sidebar user box (`--up`) | head (name, «اپراتور انجمن، 09990000004»), «پروفایل», «اعلان‌ها», sep, «خروج از حساب» (`sign-out` mirrored); RoleSwitcher rows only with ≥2 active roles — full spec in **AccountMenu** |
| Sort | secondary `sm` «مرتب‌سازی: جدیدترین» + `sort-ascending` + caret | `menuitemradio` group: جدیدترین · قدیمی‌ترین · ارزان‌ترین · گران‌ترین — checked one Bold with `check`; the trigger label shows the current choice — full spec in **SortMenu** |
| More («بیشتر») | `dots-three` IconButton, `aria-label` names the object | ویرایش آگهی · توقف موقت · کپی پیوند · «ارتقای آگهی» disabled with hint «هزینه ارتقا تعیین‌نشده است» · sep · «حذف آگهی» destructive |

Widths 200–320px (`max-width: calc(100vw - 32px)`).

## States

Closed · open (trigger `aria-expanded="true"`, caret up) · item hover (pointer) and **active** (roving focus: `bg-subtle` + inset focus ring, shown statically on «ارزان‌ترین») · checked · disabled (`aria-disabled`, still focusable, not activatable, reason in `__hint`) · destructive · loading: after choosing, the menu closes and the trigger/page shows progress (no spinner inside menus) · error: result reported by Toast/Alert · empty: never render a menu with no items — hide the trigger · long Persian text: account name clamps to 2 lines; item labels wrap.

## Mobile ↔ desktop

- **<768:** more-actions stays a popover (items 44px, flips upward with `--up` near the bottom edge); its destructive item confirms in a BottomSheet. Sort options open in a BottomSheet as radios (SortMenu). Account rows move to the nav Drawer foot / profile page (AccountMenu).
- **768–1023 / ≥1024:** popover under the trigger, aligned to the trigger's end (or start when the trigger is at the start of a toolbar).

## RTL & LTR

Alignment is logical (`inset-inline-end/start`). Icons at start, `check` at end. `sign-out` is mirrored; `dots-three`, `check`, `pencil-simple`, `trash` are not. Latin mobile in `<bdi dir="ltr">`.

## Accessibility

- Trigger: `aria-haspopup="menu"`, `aria-expanded`, `aria-controls`; icon-only triggers have a specific `aria-label` («کنش‌های بیشتر برای توله ژرمن شپرد»).
- Menu `role="menu"` + `aria-label`; items `menuitem` / `menuitemradio` (+ `aria-checked`) inside `role="group"`; separators `role="separator"`; head `role="none"`.
- Keyboard: Enter/Space/↓ open and focus the first item, ↑ the last; ↓/↑ move with wrap, Home/End, type-ahead by first Persian letter; Enter/Space activate; Escape closes and returns focus to the trigger; Tab closes and moves on. Roving `tabindex` (active item `0`, others `-1`).
- Click outside closes without moving focus. Destructive items open a confirmation (Modal/BottomSheet) — never act immediately.

## Data

Account head: `people.displayName`, active role `roles.labelFa`, `mobile`. Sort options per list (listings: `publishedAt`, `price.toman`). More-actions depend on role and status (e.g. «توقف موقت» only for `PUBLISHED`; «ارتقای آگهی» disabled while its fee is `null`).

## Code mapping

★ New — none in code. Proposed `src/ui/menu.tsx`: `<Menu trigger={…} label align?: 'start' | 'end' placement?: 'bottom' | 'top'>` with `<MenuItem icon href? onSelect disabled? disabledReason? destructive?>`, `<MenuRadioGroup value onChange>` + `<MenuRadioItem value>`, `<MenuSeparator/>`, `<MenuHeader/>`. Positioning with collision flip (e.g. Floating UI) in code.

## Do / Don't

- Do keep the destructive action last, after a separator, and confirm it.
- Do show the current sort in the trigger label.
- Don't hide the only way to do a primary task in a menu — the primary stays a button.
- Don't put form fields, links to whole sections, or more than ~7 items in a menu.
- Don't remove disabled items silently when the reason matters; show the hint.
