# P02 — Public list with filters · فهرست عمومی و فیلتر

## Purpose

A list of one kind of public entity that visitors can search, filter and sort: breeds, veterinarians, centres, places, associations, clubs, shop products, animal listings and mating profiles, plus the global search results. The visitor arrives with a question («دامپزشک معتمد در اصفهان»، «توله گلدن رتریور زیر ۵۰ میلیون») and should narrow it down in a few taps without losing their place. Results, counts and filter options all come from the server, and empty or filtered-to-zero results are normal states, not errors.

**Don't use it** for the signed-in user's own records (P05, which has status chips and no public facets), for operator queues (P09, which is dense, age-sorted and has assignees), or for the magazine home (P01). Product comparison (`/shop/compare`) uses `CompareTable`, not this grid.

## Anatomy (top to bottom)

1. **Shell:** `SiteShell` (or `PublicShell` for `/vets`, the signed-in «دامپزشکان نزدیک من»).
2. **`PageHeader`, landing variant:** `Breadcrumbs` (≥768) or «بازگشت» (<768), `h1` («دامپزشکان»), a meta line with the result count («۱۲۸ دامپزشک»), and no actions.
3. **`SearchField`:** scoped to the list, with suggestions. On `/search` it is the page's main control and results are grouped by entity.
4. **`FilterBar`:** quick chips with counts (e.g. «معتمد», «فقط فعال», species), «فیلترها» with an active-count badge, `SortMenu` («مرتب‌سازی: نزدیک‌ترین»), and «پاک کردن همه» while anything is active.
5. **Filter column (≥1024):** the same `.hz-filter-group` fieldsets (`Checkbox` with counts, `Combobox` for city / breed, `Radio` for price mode) in a `Card` at the start. Below 1024 they move into a `Drawer`.
6. **Results grid:** one card type per entity — `BreedCard` · `VetCard` · `CenterCard` · `ClubCard` · `ProductCard` · `ListingCard` · `MatingProfileCard` · `ArticleCard` (search).
7. **Optional map:** `PlaceMap` with numbered pins that match the list (`/centers`, `/places/*`). The list is always present. The map is optional by design.
8. **`Pagination`:** «۱ تا ۲۴ از ۱۲۸ نتیجه».

## Layout

| | Mobile (<768) | Tablet (768–1023) | Desktop (≥1024) |
|---|---|---|---|
| Container | full width, margin 16 | full width, margin 32 | `container-site` 1280 (PublicShell `/vets`: `container-app`) |
| Filters | chips scroll on one line (`--scroll --bleed`). «فیلترها» opens a full-screen `Drawer`. Changes apply on «نمایش N نتیجه» | chip bar. «فیلترها» opens a 400px `Drawer` from the end | 280px filter column at the start. Each change applies at once. Chips stay above the grid |
| Sort | `SortMenu` beside «فیلترها» (44px); options in a `BottomSheet` | `SortMenu` popover | `SortMenu` at the end of the bar |
| Grid | 1 column (products and breeds: 2 small tiles) | 2 columns | 3 columns beside the filter column (products 4) |
| Map | toggle «فهرست / نقشه» (`Tabs` segmented); the list is the default | same | map beside the list (5/12), sticky under the header |
| Paging | «نمایش بیشتر» or قبلی / بعدی, count above | numbered, 5 slots | numbered, 7 slots |
| Spacing | gap `space-20`, section → content `space-24` | same | same |

Sticky: the header, the filter column, and the map (`inset-block-start` = `header-site` + `space-24`) on desktop, plus the Drawer foot («نمایش N نتیجه») on mobile. The result grid never sticks.

## States

- **Loading:** `PageStates` Skeleton in the card shape for that entity (media + two lines + badge pill), at the real column count. `FilterBar` counts become a 16px spinner and chips stay usable. `aria-busy` is set on the results region.
- **Empty (no data yet):** EmptyState naming the entity («هنوز مرکزی در این شهر ثبت نشده است») and one secondary action (e.g. «همه شهرها»).
- **Filtered empty:** «نتیجه‌ای با این فیلترها پیدا نشد», listing the active filters, with «پاک کردن همه». Never «۰ نتیجه» alone.
- **Error / network:** NetworkErrorState in the results region with «تلاش دوباره», while header, search and filters stay. Failed counts are hidden, never shown as ۰.
- **Locked / permission:** public, so none. Actions that need sign-in («ذخیره», «پیام به فروشنده») send the visitor to `/login` with `returnTo` and never fail silently.
- **Hard cases:** a missing image uses the `RecordImage` placeholder (vets use the `Avatar` symbol). Long names clamp at 2 lines on cards, and the 3-line centre name is the test. A listing with no price shows `PriceDisplay` «تعیین‌نشده», never ۰. A reserved or sold listing keeps its tile with a neutral `StatusBadge` («رزروشده» / «فروخته‌شده»). Out-of-stock products show `StockBadge`. «حدود» marks an approximate age.

## Content & data rules

- Money uses `PriceDisplay`: Persian digits, «٬» separators, always «تومان». Products show «از …» for the lowest variant. Listings show «قابل مذاکره»: every listing accepts price offers (fixed price was removed, 11 Mehr 1405).
- Counts on chips, the header and pagination come from the server in Persian digits.
- Filter state lives in the URL (shareable and back-button safe). Changing a filter resets to page ۱.
- Medical Council codes appear only when the vet chose to show them, as an `Identifier` (Latin).
- City and breed matching treats «ی/ي» and «ک/ك» as the same letter (`Combobox`).
- The sort default is per list (directory: alphabetical; market: newest; mating finder: compatibility with its reasons shown).

## Accessibility & keyboard

- Focus order: search → chips (`role="group"` «فیلترهای سریع») → «فیلترها» → sort → filter column (≥1024) → results → pagination.
- The result count is an `aria-live="polite"` region, so a filter change is announced («۱۸ نتیجه»).
- The filter `Drawer` traps focus, Esc closes it, and focus returns to «فیلترها». The Drawer foot button says the live count.
- Results form a list (`ul`) and each card is one link. Map pins and list rows share numbers and names, so the map is never the only way in.
- Chips are toggle buttons with `aria-pressed`. Targets are 44px on coarse pointers.

## Pages that use it (about 14)

`/breeds` · `/veterinarians` · `/centers` · `/places` · `/places/[province]` · `/places/[province]/[city]` · `/associations` · `/clubs` · `/shop` · `/animals-market` · `/mating-finder` · `/search` · `/vets` · `/vets/location/[id]` (the last two in PublicShell)

**Key screen:** **K5** فهرست دامپزشکان (`/veterinarians`).

## Do / Don't

- **Do** keep the list usable without the map and without JavaScript-only filters. The URL holds the state.
- **Do** show a filtered-empty state that names the filters and offers to clear them.
- **Do** keep sold or reserved listings visible with a neutral badge until the server removes them.
- **Don't** scroll the page sideways at any width. Chips scroll inside their own row only.
- **Don't** apply mobile Drawer changes on every tap. Apply on «نمایش N نتیجه».
- **Don't** show «۰ تومان» or «۰ نتیجه» for something unknown.
