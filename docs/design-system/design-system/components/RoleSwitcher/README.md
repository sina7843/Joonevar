# RoleSwitcher

Lets a person who holds more than one **active** role move between their personal modes (کاربر، دامپزشک معتمد) and, separately, into each operator environment they may enter.

Use it inside AccountMenu (every shell with an account button) and as the dashboard card «محیط‌های عملیاتی شما» in PublicShell. Never render it for a person with a single active role, and never list roles that are pending, suspended or expired — those belong on the account and requests pages.

## Anatomy

**In a menu** (AccountMenu / PopoverMenu):
1. Group «حساب شخصی» — PublicShell modes: کاربر (`/dashboard`), دامپزشک معتمد (`/vet`); icon, label, one-line hint, check on the current mode.
2. Separator, then group «محیط‌های عملیاتی» — one link per OpsShell environment: icon, «محیط عملیاتی …», role label as hint («سوپرادمین — همه ۲۴ بخش»); check on the current environment.

**On the dashboard** (PublicShell, «محیط‌های عملیاتی شما» card, only when an operator role is active):
3. Card + SectionHeader `--sm`, then one row per environment: 40px icon tile · environment name · role · queue count (`hz-count`, `--alert` when any case is past its deadline) · `arrow-right` (mirrored).

## CSS API

Reuses PopoverMenu (`.hz-menu`, `.hz-menu__group-label`, `.hz-menu__list`, `.hz-menu__action`, `__action-label`, `__hint`, `__check`, `.hz-menu__sep`). css-additions `RoleSwitcher.css`:

| Class | Role |
|---|---|
| `.hz-menu__action[aria-current="true"]` | current mode/environment: Bold label, check visible (links use `aria-current`, not `aria-checked`) |
| `.hz-role-list` | dashboard list |
| `.hz-role-link`, `__icon`, `__text`, `__name`, `__role`, `__end` | one environment row (≥ 64px) |

```html
<p class="hz-menu__group-label" id="rs-o">محیط‌های عملیاتی</p>
<ul class="hz-menu__list" aria-labelledby="rs-o">
  <li><a class="hz-menu__action" href="/market" aria-current="true">…storefront…<span class="hz-menu__action-label">محیط عملیاتی بازار<span class="hz-menu__hint">سوپرادمین — همه ۲۴ بخش</span></span><span class="hz-menu__check">…check…</span></a></li>
</ul>
```

## Tokens

`bg-surface`, `bg-subtle` (hover, icon tile), `border-subtle` (row rules), `text-primary`, `text-secondary` (hints, role), `text-brand` (check, hover title), `icon-default`, `icon-strong`, `action-primary` (alert count), `focus-ring`, `radius-md`, `radius-sm`.

## Variants & sizes

- **Menu section** — personal group only (مریم صادقی: کاربر + دامپزشک معتمد), operator group only, or both (امیر حسینی: کاربر + سوپرادمین in «مدیریت سامانه» and «بازار»). Menu width 300.
- **Dashboard card** — 1–n environment rows; counts optional.
- Environment icons (proposal): انجمن `buildings` · مرکز ژنتیک `dna` · مدیریت سامانه `gear-six` · نویسندگی `pencil-simple` · محتوا `file-text` · بررسی `magnifying-glass` · بازار `storefront`.

## States

Default · hover (pointer: `bg-subtle`) · **focus-visible** (preview: «محیط عملیاتی مدیریت سامانه») · current (`aria-current`, check) · count / overdue count · **single active role → not rendered** · **inactive role → not listed** · long text: «محیط عملیاتی مدیریت سامانه» fits 300; longer role hints ellipsize with the full text in `title`.

## Mobile ↔ desktop

Menu form: in AccountMenu ≥768; below 768 the same rows appear in the OpsShell nav Drawer foot and on the PublicShell «پروفایل» page (44px rows on coarse pointers). Dashboard card: full width on phones, in the dashboard grid ≥768.

## RTL & LTR

Icons at the start, check / count / arrow at the end. `arrow-right` is mirrored; `check` and environment icons are not.

## Accessibility

These are links (navigation), so the group is a labelled list inside a disclosure panel — not `role="menu"`. Current item: `aria-current="true"` plus a visible check. Counts carry `aria-label` («۴ پرونده در صف»). Switching environment is a page navigation; the new shell's skip link and title announce the change.

## Data

`roles.json` (`key`, `labelFa`, `shell`, `home`) filtered to the person's **active** roles (`src/authz/actor.ts`). USER/BREEDER → «کاربر» mode (`/dashboard`), TRUSTED_VET → «دامپزشک معتمد» (`/vet`); each OpsShell role → its environment (`/assoc`, `/genetics`, `/admin`, `/author`, `/content`, `/review`, `/market`). Several market roles collapse into one «محیط عملیاتی بازار» row with the combined role labels. Counts from each environment's queue totals (preview illustrative: «۴» from the association notification «۴ پرونده احراز هویت در صف»).

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/role-switcher.tsx`: `RoleSwitcher({ contexts: ActorContextName[], active, returnTo })`. Keep.


`src/ui/role-switcher.tsx` — `RoleSwitcher`: keep its existing props and active-role filtering. Render personal modes and operator environments as two labelled groups; return `null` when fewer than two destinations remain. Proposed: `variant: 'menu' | 'card'`, `counts?: Record<env, { open: number; overdue: number }>`.

## Do / Don't

- Do keep personal modes and operator environments in separate, labelled groups.
- Do name environments the same way the OpsShell sidebar does («محیط عملیاتی انجمن»).
- Don't show disabled rows for roles the person does not have or that are not active.
- Don't use a select/dropdown control — every destination is a link.
