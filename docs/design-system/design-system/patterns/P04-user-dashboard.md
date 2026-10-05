# P04 — User dashboard · داشبورد کاربر

## Purpose

The signed-in home of the user app. In one screen it answers four questions: is anything wrong with my account, whose move is it on my cases, what do I have (animals, payments, membership), and what can I do next, including what is locked and why. It is mobile first and comfortable, made of white bordered cards with section headers. The same shape serves the trusted vet home (`/vet`: today's queue and samples) and the small management homes inside `/account/*` (seller, centre, club).

**Don't use it** for operator environment homes (`/assoc`, `/genetics`, `/market`, `/admin`). Those are the queue home of P09 with `QueueTile` / `StatTile`. Don't use it for a full list of anything either; the dashboard shows at most three items per block and links to the P05 list.

## Anatomy (top to bottom, `/dashboard`, code order)

1. **Shell:** `PublicShell` (top bar with `NotificationBell`, the bottom tab bar «خانه · درخواست‌ها · اعلان‌ها · پروفایل», or the 264 sidebar).
2. **Greeting:** `h1` «سلام، {displayName}» + one meta line (role label, city). There is no PageHeader breadcrumb on the home.
3. **Alerts stack** (`Alert`, each only when true, in this order):
   - unread notifications «۳ اعلان خوانده‌نشده»
   - «حساب شما هنوز کامل نیست» (warning, with «تکمیل حساب»)
   - «پذیرش کار جدید متوقف است» (vets and sellers)
4. **«محیط‌های عملیاتی شما»:** `RoleSwitcher` dashboard card. Shown only when the person holds an operator role, and it links into OpsShell.
5. **«پرداخت‌ها»:** `SectionHeader` + the latest three `PaymentRow` (card form).
6. **«عضویت»:** a `Card` with the membership `StatusBadge`, expiry date and fee (`PriceDisplay`), or `LockedServiceCard`.
7. **«حیوان‌های من»:** `SectionHeader` «مشاهده همه ←» + `AnimalCard` tiles or rows (up to three) + «ثبت حیوان».
8. **«درخواست‌های فعال»:** `SectionHeader` + up to three `RequestCard`, each with `ActionOwner` and «پیگیری».
9. **«سرویس‌ها»:** open `ServiceCard`s first, then `LockedServiceCard`s (what · why · what unlocks it).

Vet home (`/vet`) swaps sections 5–8 for «صف من» (`RequestCard` with `Countdown` to the visit deadline), «پذیرش» (entry to `/vet/check-in`) and «نمونه‌ها». Seller, centre and club homes use `StatTile`-free summary cards plus «سفارش‌های تازه» / «درخواست‌ها».

## Layout

| | Mobile (<768) | Tablet (768–1023) | Desktop (≥1024) |
|---|---|---|---|
| Navigation | bottom tab bar (`tabbar` 68), top bar 56 | tab bar, top bar 56 | sidebar `sidebar-app` 264 + top bar `header-app` 64 |
| Work area | one column, margin 16 | two-column card grid, margin 32 | `container-app` 1200, 12 columns, start-aligned beside the sidebar |
| Order | sections one after another in code order | alerts full width; payments and membership side by side; animals, then requests | alerts full width; **animals 6/12 + requests 6/12 side by side**; payments + membership in a row; services below in 3 columns |
| Services grid | 1 column | 2 columns | 3 columns, locked cards after open ones |
| Primary action | «ثبت حیوان» as a sticky `ActionRow` above the tab bar only when the user has no animal; otherwise in the section | in content | in the top bar (the view's one primary) |
| Spacing | sections `space-24`, card padding `space-16`, title → content `space-16` | same, padding `space-24` | same; card gap `space-16` |

Sticky elements: the top bar, plus the tab bar (mobile and tablet) or the sidebar (desktop). Content reserves the tab-bar height (`scroll-padding-block-end`). Overlays: `BottomSheet` <768, `Modal` ≥768.

## States

Three account states are designed: **new** (everything empty, account incomplete), **active** (3 animals, 2 requests), and **with an operator role**.

- **Loading:** each card shows its own `PageStates` Skeleton. Animals: thumb + two lines + badge pill. Requests: title + code + owner bar. Services: tile blocks. The greeting renders immediately.
- **Empty:** compact EmptyState inside the card. «هنوز حیوانی ثبت نکرده‌اید» with the primary «ثبت حیوان». «درخواست فعالی ندارید» with no action. Payments are hidden when there are none. Never «۰ مورد».
- **Error / network:** a failed card shows NetworkErrorState `--compact` with «تلاش دوباره». The other cards stay.
- **Locked:** `LockedServiceCard` in three parts, for example «ثبت کنل» · «فقط حساب پرورش‌دهنده می‌تواند کنل ثبت کند.» · «فعال‌سازی حساب پرورش‌دهنده». When a fee is unset: «تعرفه این خدمت تعیین‌نشده است و پرداختش باز نیست.» with no button. A user without the vet role who opens `/vet` gets `AccessDenied` (role).
- **Hard cases:** an animal with no name shows «بدون نام» + a «پیش‌نویس» badge and «ادامه ثبت (مرحله ۲ از ۶)». A missing photo uses the `RecordImage` placeholder. A very long name («شاهزاده کوچولوی باغ ارم شیراز») wraps to two lines. An overdue request shows `ActionOwner` with «مهلت: ۵ مهر ۱۴۰۵، ۵ روز گذشته» in the overdue age style. A correction reason is shown in full. An unset fee on a ServiceCard reads «تعیین‌نشده».

## Content & data rules

- Every unfinished case shows «اقدام بعدی با: …». «شما» (`--you`) is the only emphasised owner, so users can scan for their own moves. Statuses come from the dictionary key only.
- Money is in تومان, Persian digits. Payment ids are `HZP-` + 16 characters in `Identifier`, on one line at 360px.
- Dates are Jalali. Deadlines show the absolute date beside `Countdown`.
- Sort requests with «شما» first, then by nearest deadline. Animals: drafts first, then by most recent update.
- Action order: primary at the start, secondary at the end. There is one primary per view, counting the top bar.

## Accessibility & keyboard

- Focus order: skip link → sidebar (desktop) → top bar (search, bell, primary) → `main` → each section in code order → tab bar (last in DOM).
- Landmarks: `nav` «ناوبری اپ», `main#main`, one `section` per card labelled by its heading.
- Alerts that come from the server on load are static (no `role="alert"`). Only a change after a user action is announced.
- Locked cards are not links. Only their unlock link is focusable, and it names the service («فعال‌سازی حساب پرورش‌دهنده»).
- Tab bar items are 68px tall and use `aria-current="page"`. The unread count is in text («۳ اعلان خوانده‌نشده»), not only a dot.

## Pages that use it (about 6)

`/dashboard` · `/vet` · `/account/seller` · `/account/centres/[id]` · `/account/clubs/[id]` · `/account/mating-finder`

**Key screen:** **K2** داشبورد کاربر (`/dashboard`) in three states: new user, active user, user with an operator role.

## Do / Don't

- **Do** keep the section order from `app/dashboard/page.tsx` and hide blocks that do not apply.
- **Do** say whose move it is on every request card.
- **Do** sort locked services after open ones, each with its unlock path.
- **Don't** use `bg-feature`, `bg-band` or a hero. The dashboard is white cards.
- **Don't** show more than three items per block. Link to the full list instead.
- **Don't** show OpsShell queues here. Link to the environment through «محیط‌های عملیاتی شما».
