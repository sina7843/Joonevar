# AccessDenied

A page state that says what is missing to open a page — signing in, or a role — without ever confirming that a requested record exists.

Use it as the whole content area of a shell when a route guard fails: not signed in (any protected route), signed in without the area's role (`/assoc`, `/market/*`, `/admin/*` …). For a single record the user may not see (`/animals/[id]`, `/requests/[id]` of another account) show the **same not-found state as a nonexistent id**. Don't use it for a locked *service* inside a page (`LockedServiceCard`) or for an incomplete account (Alert «حساب شما هنوز کامل نیست»).

## Anatomy

Built on `PageStates` (`.hz-state`):
1. Icon disc 64px `bg-subtle` — `sign-in` (mirrored) / `lock-simple` / `magnifying-glass`.
2. Title (`h1`, `tabindex="-1"`, receives focus on render).
3. Body — what · why · what unlocks it.
4. Missing line `.hz-state__missing` — «آنچه کم است: ورود به حساب» / «نقش فعلی: کاربر، نقش لازم: اپراتور انجمن».
5. Actions — primary first («ورود با شماره موبایل» / «تغییر نقش»), secondary «بازگشت به داشبورد» / «صفحه اصلی».

## CSS API

| Class | Role |
|---|---|
| `.hz-state` (+ `--compact` in narrow columns) | Container (PageStates) |
| `.hz-state__icon` · `__title` · `__body` · `__actions` | Parts (PageStates) |
| `.hz-state__missing` | New: quiet pill naming what is missing (`bg-subtle`, 13/20) |

```html
<div class="hz-state">
  <span class="hz-state__icon">…lock-simple…</span>
  <h1 class="hz-state__title" tabindex="-1">این بخش با نقش فعلی شما باز نیست</h1>
  <p class="hz-state__body">پنل انجمن فقط با نقش «اپراتور انجمن» باز می‌شود. …</p>
  <p class="hz-state__missing">نقش فعلی: <b>کاربر</b>، نقش لازم: <b>اپراتور انجمن</b></p>
  <div class="hz-state__actions">…</div>
</div>
```

## Tokens

`bg-subtle` · `icon-default` · `text-primary` · `text-secondary` · `radius-md` · Button tokens.

## Variants & sizes

| Reason | Shown when | Copy | Actions |
|---|---|---|---|
| `signin` | No session | «برای دیدن این صفحه وارد شوید» — returns here after sign-in (`returnTo`) | «ورود با شماره موبایل» · «صفحه اصلی» |
| `role` | Session, area needs a role the account lacks or hasn't activated | «این بخش با نقش فعلی شما باز نیست» + required role(s) by `labelFa` | «تغییر نقش» only if the account holds that role, else none · «بازگشت به داشبورد» |
| record (not this component's copy) | Record of another account, or no such id | «صفحه‌ای با این نشانی پیدا نشد» — identical for both cases | «درخواست‌های من» · «داشبورد» |

Sizes: default in a page; `--compact` inside a narrow column or the 360px phone.

## States

Default · focus: title on render, then the primary action (focus ring shown statically) · loading: the guard resolves before render — show the shell's LoadingState, never a flash of AccessDenied · error: network failure is `NetworkErrorState`, not this · long Persian text: several required roles in one sentence wrap inside `max-width: 420px`.

## Mobile ↔ desktop

Same component in every shell; centred in the content area. <768 actions stack full width (`hz-state__actions` wraps); 44px+ buttons. ≥1024 the shell's sidebar stays visible so the user can navigate away.

## RTL & LTR

`sign-in` is directional → LTR glyph + `hz-icon--mirror`. `lock-simple`, `magnifying-glass` never mirrored. Role names are Persian `labelFa`; never echo the URL id.

## Accessibility

- Title is the page's `h1` and receives focus (`tabindex="-1"`) so screen readers hear the reason first; document `<title>` = «دسترسی محدود — همزیست».
- The missing line is plain text, not colour-coded.
- The server returns **401** (sign-in), **403** (role) and **404** for records — the record response is byte-identical whether the record exists or belongs to someone else.

## Data

`session` (present or not), `account.roles[]` and the active role (`roles.json` `labelFa`: «کاربر»، «اپراتور انجمن»، «ناظر آگهی» …), the route's `requiredRoles[]`. Never read or show any field of the requested record.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/access-denied.tsx`: `AccessDenied({ error: AppError })` and `RecordNotFound({ error })`. The `AppError` already carries the reason; keep `error` and add the proposed fields as optional.


`src/ui/access-denied.tsx` — `AccessDenied`. Proposed: `reason: 'signin' | 'role'`, `requiredRoles?: RoleKey[]`, `currentRole?: RoleKey`, `canSwitchTo?: RoleKey[]` (shows «تغییر نقش» → RoleSwitcher), `returnTo?: string`. Record-level denials call the shared `NotFound` state instead, so the two cases can't drift apart. `SyntheticNotice` lives in the same file.

## Do / Don't

- Do say exactly what is missing — sign-in or which role.
- Do send record-level denials to the same not-found copy as a wrong id.
- Don't write «شما به این پرونده دسترسی ندارید» — it confirms the case exists.
- Don't offer «تغییر نقش» to an account that doesn't hold the role.
- Don't show the requested id, owner name or status anywhere on the page.
