# P06 — Record file · پرونده رکورد

## Purpose

The page for one record the person owns or is part of: an animal, a request, a registration, a pedigree, a kennel, a mating permit, an order or purchase, a listing, a payment, a document. It answers four questions in order: what is this (identifier and status), whose move is it («اقدام بعدی با: …» with the deadline), what are its facts, and what happened so far. The one thing the user can do next sits in a fixed place. This is the most repeated shape in the user app: designed once, it serves about 30 pages.

**Don't use it** for operator decisions (P10 adds evidence, versioning and a decision panel), for public profiles (P03), or for creating a record (P07). A record that is still a draft opens the form at its saved step instead of this page.

## Anatomy (top to bottom)

1. **Shell:** `PublicShell` (OpsShell for read-only admin record views such as `/admin/vets/[accountId]`).
2. **`PageHeader`, record variant:**
   - `Breadcrumbs` «خانه / حیوان‌های من / رکس» (≥768) or «بازگشت»
   - `h1` with the name + `Identifier` (`PET-8JDUN4GH`, copy) + `StatusBadge`
   - meta: «سگ، ژرمن شپرد، نر» · «تولد ۱۴۰۲/۰۱/۲۲» · `Identifier` microchip · «به‌روزشده ۸ مهر ۱۴۰۵»
   - actions: primary at the start, secondaries after it, extra actions in a `PopoverMenu` «بیشتر»
3. **State strip:**
   - `ActionOwner` «اقدام بعدی با: شما — مهلت: ۲۸ مهر ۱۴۰۵»
   - an `Alert` when the case needs correction: the operator's reason in full + «اصلاح …»
   - `PageStates` WaitingState when nothing is the user's to do
4. **Main column:**
   - `Tabs` only when sections are long (animal: «مشخصات · اسناد · درخواست‌ها · تاریخچه»)
   - «مشخصات»: `KeyValueList` in a `Card`
   - «اسناد»: `DocumentCard`s (number, issue date, PDF, verify link)
   - «تاریخچه پرونده»: `Timeline`, oldest first, ending with upcoming steps
   - domain blocks: `PedigreeTree` (pedigree) · `SubOrderCard` per shop (orders) · `DeliveryCodeCard` (purchases, listings) · `ContractCard` (mating finder) · `PaymentRow` list
5. **Side column (desktop):**
   - status card: `StatusBadge`, `ActionOwner`, the primary action, `Countdown` for deadlines
   - the record's `RecordImage`
   - the fee line (`PriceDisplay` or «تعیین‌نشده»)
   - related links (open request, kennel)

## Layout

| | Mobile (<768) | Tablet (768–1023) | Desktop (≥1024) |
|---|---|---|---|
| Columns | one column: header → state strip → sections in order | one column, cards in full width; `KeyValueList` single | **two columns** in `container-app`: main 8/12 + status/action column 4/12 (compact `Card`s) |
| Primary action | sticky `ActionRow` above the tab bar (e.g. «پرداخت ۴۰۰٬۰۰۰ تومان») | in the PageHeader actions | in the side status card (and nowhere else) |
| Sticky | top bar, tab bar, ActionRow | top bar, tab bar | top bar; side column sticky at `header-app` + `space-16` |
| Tabs | scroll on one line (`--bleed`), 48px | fit | above the main column only; the side column never moves |
| `KeyValueList` | one column, key min 104 | one column | `--2col` in the main column |
| Overlays | confirmations and «بیشتر» in `BottomSheet` | `Modal` | `Modal`; long edits in a `Drawer` from the end |
| Spacing | sections `space-24`, padding `space-16` | `space-24`, `space-24` | `space-24`, `space-24`; column gap `space-24` |

## States

- **Loading:** `PageStates` Skeleton. A header with a title bar + id pill + one meta line, `keyValue` bars in the main card, three Timeline items, and the side card block. `aria-busy` is set on `main`.
- **Empty sections:** «اسناد» → «هنوز سندی صادر نشده؛ پس از تأیید انجمن برگه ثبتی اینجا می‌آید.» Timeline → «هنوز رویدادی ثبت نشده». Optional sections with no data collapse to one «—» line.
- **Error / network:** if the header fails, NetworkErrorState fills `main`. If a section fails, it shows `--compact` with «تلاش دوباره» and the header stays.
- **Locked / permission:** another account's record, or an id that does not exist, gets the same «صفحه‌ای با این نشانی پیدا نشد» state (never confirm the record exists). A tab the role cannot use is a locked tab with its reason. A service that is unavailable on this record uses `LockedServiceCard` («کارت توله فقط برای زایمان ثبت‌شده صادر می‌شود.»).
- **Needs correction:** NeedsCorrectionState or an `Alert` with the operator's full reason, «اقدام بعدی با: شما» and the fix action as primary.
- **Hard cases:**
  - no name → «بدون نام» + «پیش‌نویس»
  - no `petId` → «—»; no microchip → «— هنوز ثبت نشده»
  - approximate birth date → «حدود ۱۴۰۲/۰۱»
  - missing photo → the `RecordImage` placeholder
  - a long title wraps and never truncates
  - an overdue deadline → `ActionOwner` overdue style «۵ روز گذشته»
  - an unset fee → «تعیین‌نشده» with the pay action closed
  - a pedigree with unknown ancestors → `PedigreeTree` «نامشخص»
  - a deceased animal → closed badge «فوت» and no actions

## Content & data rules

- The **`ActionOwner` is mandatory** on every unfinished record. The status label never carries the owner («در حال بررسی» + «اقدام بعدی با: مرکز ژنتیک»).
- Identifiers are Latin, in `bdi dir="ltr"`, with copy. The `HZP-` + 16 id fits one line at 360px. Microchips are 15 Latin digits, LTR.
- Money is in تومان. A payment action names its amount. Dates are Jalali, and deadlines show the absolute date beside `Countdown`.
- Action order: one primary at the start, secondaries at the end, destructive actions («انصراف از درخواست») only in «بیشتر», each with a confirmation.
- **One pedigree per animal** (approved 11 Mehr 1405). Once a pedigree is issued, «صدور شجره‌نامه» is not offered again for that animal: the service row shows the issued document («صادر شد» + `PD-` number + «مشاهده سند») instead of a request button, and the server refuses a second request. The same holds while a pedigree request is still open: the service shows «پیگیری» for that request, never a new one. Only the association can reissue (revoke + new number).
- Timeline order is oldest at the top, so the eye reads down to "what's next". There is exactly one current item.

## Accessibility & keyboard

- Landmarks: `main` → the main column (`section`s labelled by headings) and an `aside` «وضعیت و اقدام» for the side column.
- Focus order: back / breadcrumbs → `h1` → header actions → state strip → tabs → main sections → side column (desktop DOM order follows reading order: main first, so the side card's primary is also mirrored in the mobile ActionRow).
- Tabs use `role="tablist"`, arrow keys move between tabs, and a locked tab is `aria-disabled` with its reason in text.
- Status changes after an action (e.g. a payment confirmed) are announced through `Toast` (`role="status"`). The Timeline is an `ol`.
- `Identifier` copy: «کپی شناسه» with «کپی شد» announced.

## Pages that use it (about 30)

`/animals/[id]` · `/requests/[id]` · `/registration/[id]` · `/pedigree/[animalId]` · `/pedigree/appeals/[id]` · `/pedigree/batch/[id]` · `/pedigree/receipts/[id]` · `/declaration/[id]` · `/payments/[id]` · `/notifications/[id]` · `/documents/[id]` · `/kennels/[id]` · `/mating/permits/[id]` · `/account/orders/[id]` · `/account/purchases/[id]` · `/account/listings/[id]` · `/account/communities/[id]` · `/account/mating-finder/personal/[id]` · `/account/mating-finder/profiles/[animalId]` · `/vet/requests/[id]` · read-only ops records `/admin/vets/[accountId]` · `/admin/centres/[id]` · `/admin/communities/[id]` · and similar detail routes

**Key screens:** **K9** پرونده حیوان (`/animals/[id]`) · **K11** پیگیری درخواست (`/requests/[id]`).

## Do / Don't

- **Do** put identifier, status and «اقدام بعدی با» above the fold at every width.
- **Do** keep one primary action in one place: the sticky bar on mobile, the side card on desktop.
- **Do** show an operator's correction reason in full and verbatim, next to the fix action.
- **Don't** reveal another account's record. Use the not-found state.
- **Don't** put the decision or approval UI of operators here (that is P10).
- **Don't** hide the Timeline behind a tab on desktop when the record has no tabs.
