# P05 — My records list · فهرست رکوردهای من

## Purpose

The full list of one kind of record that belongs to the signed-in person: their animals, requests, payments, orders, purchases, listings, kennels, permits and notifications, and the lists inside their small management areas (seller catalogue, club members, centre claims). The question it answers is "where is each of my things, and which ones need me?" It filters by status family, not by public facets, and every unfinished row carries «اقدام بعدی با».

**No key screen.** P05 is covered by components only. The reference implementations are `DataTable` (table ↔ CardList), `FilterBar`, `SortMenu`, `Pagination`, `RequestCard`, `AnimalCard`, `PaymentRow`, `SubOrderCard` and `PageStates`. The dashboard (K2) shows the same rows three at a time.

**Don't use it** for public browsing (P02), for operator queues with age and assignee (P09), or for a record's own sub-lists such as documents inside an animal file (those live in P06 sections).

## Anatomy (top to bottom)

1. **Shell:** `PublicShell`.
2. **`PageHeader`:**
   - <768: «بازگشت».
   - title: «حیوان‌های من» + count
   - meta: «۳ حیوان، ۱ پیش‌نویس»
   - primary action: «ثبت حیوان» / «درخواست تازه»
3. **`FilterBar`:**
   - status chips by family with server counts: «همه ۱۲» · «نیازمند اقدام شما ۲» · «در انتظار دیگران ۵» · «انجام‌شده ۴» · «بسته ۱»
   - «فیلترها» for secondary facets (animal, service type, date range with `JalaliDateField --range`)
   - `SortMenu` («نزدیک‌ترین مهلت», «تازه‌ترین»)
4. **Optional `SearchField`:** by name or code, for lists that can exceed about 20 rows (orders, payments, catalogue).
5. **Collection:**
   - `DataTable` with ≥3 comparable fields (requests, payments, orders, listings)
   - or a card grid for visual records: `AnimalCard` tiles, `ListingCard`, `ProductCard` in the seller catalogue
   - or a plain list for `NotificationItem` rows
6. **Row content:**
   - title + `StatusBadge`
   - `Identifier` + date
   - `ActionOwner`, with the row's one action («پیگیری», «پرداخت ۴۰۰٬۰۰۰ تومان», «ادامه ثبت»)
7. **`Pagination`.**

## Layout

| | Mobile (<768) | Tablet (768–1023) | Desktop (≥1024) |
|---|---|---|---|
| Container | full width, margin 16 | full width, margin 32 | `container-app` 1200 beside the 264 sidebar |
| Collection | **CardList only**, never a table or sideways scroll | table with fewer columns (drop «حیوان» and «مبلغ», code under the title); animal tiles in 2 columns | full `DataTable` (44px rows, sticky header under the top bar); animal tiles in 3 columns |
| Filters | chips scroll on one line + «فیلترها» → full-screen `Drawer` | chip bar + 400px `Drawer` from the end | chip bar above the table. No side column (lists are short) |
| Primary action | sticky `ActionRow` above the tab bar | in the PageHeader | in the top bar or PageHeader (one per view) |
| Row action | inside the card's `ActionOwner` row, 44px | last cell | last cell, text link or secondary `sm` |
| Overlays | sort and «بیشتر» in `BottomSheet` | `Modal` / `PopoverMenu` | `PopoverMenu`, `Drawer` for filters if many |
| Spacing | card gap `space-12`, padding `space-16` | row padding `space-12`–`space-16` | same; section gap `space-24` |

## States

- **Loading:** `PageStates` Skeleton in the variant that matches. `cardList` for mobile (thumb + two lines + badge pill). `table` with the header kept and 2–5 skeleton rows on desktop. `aria-busy` is set on the wrap.
- **Empty:** EmptyState naming the entity with the next step: «هنوز حیوانی ثبت نکرده‌اید» + «ثبت حیوان». «هنوز درخواستی ثبت نکرده‌اید» + «ثبت حیوان» (a request needs an animal). «پرداختی ندارید» with no action.
- **Filtered empty:** «با این فیلترها نتیجه‌ای نیست» + «پاک کردن فیلترها».
- **Error / network:** NetworkErrorState in the wrap with «تلاش دوباره». Chips hide failed counts.
- **Locked / permission:** a list the role cannot open (e.g. `/kennels` for a non-breeder) shows `LockedServiceCard` in place of the list, with the unlock path. Without a session: `AccessDenied` (sign-in).
- **Hard cases:** an unnamed draft animal shows «بدون نام» + «پیش‌نویس» + «مرحله ۱ از ۶». No `petId` yet shows «—». A missing photo uses the `RecordImage` placeholder. A long breed name wraps. A long status badge drops to its own line in the card. An overdue deadline shows on `ActionOwner` in the overdue style. A correction reason is shown in full in the card. An unset amount reads «تعیین‌نشده».

## Content & data rules

- Status comes only from a `StatusBadge` key. Chip groups map to families: action = «نیازمند اقدام شما», waiting = «در انتظار دیگران», done, closed, blocked.
- Default sort puts «اقدام بعدی با: شما» first, then the nearest deadline, then the latest update.
- Ids are Latin in `Identifier` (`PET-`, `HZ-`, `HZP-`, `MP-`), with copy on desktop rows and in the card meta. Money is in تومان, end-aligned in tables. Dates are Jalali.
- Row action order: one action per row. A payment row's action names the amount («پرداخت ۴۰۰٬۰۰۰ تومان»). Rows are never disabled; a row with no available action shows none.
- Product returns (`/account/orders/[id]/return`) are records, not gateway returns. Don't confuse them with P08.

## Accessibility & keyboard

- Use a real `<table>` with a hidden `caption` («درخواست‌های من»), `scope="col"`, and `aria-sort` on the sortable header. The CardList is a `ul`.
- Focus order: PageHeader primary → chips → «فیلترها» → sort → rows (title link, then row action) → pagination.
- The result count is `aria-live="polite"` after any filter or sort change.
- The whole row is not a link (so codes stay selectable). The title link and the action each name the record («پیگیری HZ-49UQ9KAEBE، صدور شجره‌نامه تارا»).
- The sticky ActionRow never covers the last card. Content reserves the bar and tab-bar height.

## Pages that use it (about 24)

`/animals` · `/requests` · `/payments` · `/notifications` · `/registration` · `/pedigree` · `/declaration` · `/kennels` · `/mating` · `/mating/permits` · `/vet/samples` · `/account/orders` · `/account/purchases` · `/account/listings` · `/account/seller/orders` · `/account/seller/catalog` · `/account/seller/returns` · `/account/seller/reviews` · `/account/reviews` · `/account/saved` · `/account/centres` · `/account/clubs` · `/account/clubs/[id]/members` · `/account/mating-finder/profiles` · `/account/mating-finder/requests` (+ favorites, saved searches, blocks, appeals)

**Key screen:** none. Covered by components (see the top of this file).

## Do / Don't

- **Do** filter by status family and put the user's own moves first.
- **Do** switch to cards below 768. The same rows, never a squeezed table.
- **Do** give every unfinished row an `ActionOwner`.
- **Don't** add operator columns (age, assignee) here.
- **Don't** write status text by hand or encode the owner in the label.
- **Don't** show «۰ مورد» as an empty state.
