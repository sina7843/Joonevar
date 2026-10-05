# AccountMenu

The account button and its panel: who is signed in (name, role, mobile), links to the person's account, the RoleSwitcher when they have more than one active role, and «خروج».

Use it in the OpsShell top bar (≥768), and on the PublicShell sidebar user box (≥1024). In SiteShell a signed-in visitor sees «پنل من» instead (no menu). Below 768 there is no popover: the same rows live in the OpsShell nav Drawer foot and on the PublicShell «پروفایل» tab.

## Anatomy

1. **Trigger** — top bar: `hz-topbar__account` (32px initial · name 13/18 Bold · role 11/16 · `caret-down`); sidebar: the user box as a button (initial · name · role · city · caret). Name and role are hidden below 1024 (initial only).
2. **Panel** (300, `shadow-overlay-sm`) — head (40px initial, name, «role · mobile» with the mobile in `bdi`) → account links (پروفایل، احراز هویت، اعلان‌ها) → separator → RoleSwitcher groups (if any) → separator → «خروج» with the `sign-out` icon **mirrored**.

## CSS API

Reuses PopoverMenu (`.hz-popover`, `.hz-menu--popover`, `--up`, `.hz-menu__head`, `__head-text/-name/-sub`, `.hz-menu__action`, `.hz-menu__sep`) and the shells' `.hz-topbar__account`, `.hz-sidebar__user`. css-additions `AccountMenu.css`:

| Class | Role |
|---|---|
| `.hz-account-menu` | panel width 300; 40px head avatar |
| `.hz-account-caret` | caret inside the top-bar trigger; turns 180° when open |
| `.hz-topbar__account[aria-expanded="true"]` | open trigger background |
| `.hz-topbar__account-name` | ellipsis at 200px |
| `.hz-sidebar__user--button` | the sidebar user box as a full-width trigger |
| `.hz-popover--block` | anchor that stretches the panel to the trigger width (sidebar) |
| `.hz-menu__action[aria-busy="true"]` | sign-out in progress |

```html
<div class="hz-popover">
  <button type="button" class="hz-topbar__account" aria-expanded="false" aria-controls="acct" aria-label="حساب امیر حسینی، سوپرادمین">
    <span class="hz-avatar-initials" aria-hidden="true">ا</span><span class="hz-topbar__account-text">…</span><span class="hz-account-caret">…caret-down…</span></button>
  <div class="hz-menu hz-menu--popover hz-account-menu" id="acct" hidden>
    <div class="hz-menu__head">…</div> … <ul class="hz-menu__list"><li><button type="button" class="hz-menu__action"><svg class="hz-icon hz-icon--sm hz-icon--mirror">…sign-out…</svg><span class="hz-menu__action-label">خروج</span></button></li></ul>
  </div>
</div>
```

## Tokens

`bg-surface` (panel), `bg-chrome` (trigger surroundings), `action-secondary-hover` (open trigger), `bg-subtle` (hover), `bg-brand-subtle` + `text-brand` (initial), `border-default`, `border-subtle`, `border-control` (user box hover/open), `shadow-overlay-sm`, `z-dropdown`, `text-secondary`, `icon-default`, `focus-ring`, `radius-lg`, `radius-sm`.

## Variants & sizes

- **Top bar** (OpsShell ≥768; PublicShell has no account button in the top bar) — panel opens below, aligned to the trigger's end edge.
- **Sidebar user box** (PublicShell ≥1024) — panel opens upward (`--up`) at the box width.
- **With / without RoleSwitcher** — only people with two or more active destinations get the role groups.
- Phone rows (<768) — same head and rows in the nav Drawer foot / profile page; 44px rows.

## States

Trigger: default · hover (pointer) · **focus-visible** (preview: لیلا موسوی) · open (`aria-expanded`, caret 180°). Items: default · hover · focus · current role (check). **Sign-out in progress**: row disabled with a spinner «در حال خروج…»; afterwards the person lands on `/` (SiteShell home). Long text: name ellipsizes at 200px in the trigger and in the head; the full name stays in the trigger's `aria-label` («حساب لیلا موسوی، اپراتور مرکز ژنتیک»).

## Mobile ↔ desktop

| | <768 | 768–1023 | ≥1024 |
|---|---|---|---|
| OpsShell | rows in nav Drawer foot | initial-only trigger + panel | name + role trigger + panel |
| PublicShell | «پروفایل» tab page | «پروفایل» tab page | sidebar user box + panel (up) |

## RTL & LTR

Trigger sits at the end of the top bar; the panel aligns to its end edge. `sign-out` is the LTR glyph with `hz-icon--mirror`; `caret-down`, `user`, `bell`, `check` are not mirrored. Mobile number in `bdi dir="ltr"`.

## Accessibility

Disclosure: `button[aria-expanded][aria-controls]` (the panel holds links and one button, so it is not `role="menu"`). Esc closes and returns focus to the trigger; Tab out or an outside click closes. Focus moves to the first item on open with the keyboard. «خروج» is a `button` (POST), never a link. The trigger's `aria-label` carries name and role because the text is hidden below 1024.

## Data

`people.json`: `displayName`, `role` → `roles.json` `labelFa`, `mobile`, `city` (sidebar box). Role groups from RoleSwitcher. Preview: امیر حسینی (سوپرادمین, `09990000006`) in the market environment, سارا احمدی (کاربر · تهران), لیلا موسوی (اپراتور مرکز ژنتیک).

## Code mapping

★ New — proposed `AccountMenu` in `src/ui/account-menu.tsx`, used by `OpsShell` (top bar) and `PublicShell` (sidebar user box). Props: `user: { displayName, roleLabel, mobile, city? }`, `links: { href, label, icon }[]`, `roles?` (passed to `RoleSwitcher`), `onSignOut(): Promise<void>`, `placement: 'bottom-end' | 'top'`.

## Do / Don't

- Do keep «خروج» last, after a separator, in the normal text colour (it is not destructive).
- Do show the role next to the name — operators switch environments often.
- Don't put settings or admin actions in this menu; they live in the sidebar.
- Don't open the menu on hover.
