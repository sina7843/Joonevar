# CaseQueue

The operations case queue: one dense, age-sorted list of open cases for the association, review, genetics, market and content environments (P9, about 35 pages).

Use it for any page where an operator picks the next case to decide (`/assoc/kyc`, `/assoc`, `/review/vets`, `/genetics/samples`, `/market/listings`, `/content/reports`). Don't use it for a user's own records (`/requests`, `/animals`). Those use the P5 card list with no age or assignee. Opening a row leads to **DecisionDesk**.

## Anatomy

1. **Head**: title («صف‌ها») + live count («۱۸ پرونده باز · ۶ مورد نمایش»), search, sort select.
2. **Filter bar**: type chips with counts (`.hz-chip__count`) plus scope chips «اقدام با انجمن» and «تخصیص‌نیافته».
3. **Table** (≥1024), oldest first. Columns: سن پرونده (sortable) · کد پرونده · متقاضی (name + one muted subline) · نوع · وضعیت · اقدام بعدی با · مسئول · open caret.
4. **Card list** (<768): the same fields stacked. The type tag and age go on top, then name, city and code, then the badge and assignee, then the ActionOwner bar.
5. **Pagination**: «۱ تا ۶ از ۱۸ پرونده» + page numbers. Mobile uses «نمایش پرونده‌های بیشتر».

## CSS API

Bundle: `.hz-table-wrap` `.hz-table.hz-table--dense` `.hz-cardlist` `.hz-cardlist__item/__row` `.hz-age` `--late` `--overdue` `.hz-badge--{tone}` `.hz-owner` `--you` `.hz-filterbar` `.hz-chip[aria-pressed]` `.hz-pagination` `.hz-state` `.hz-skeleton`.
Additions (`tools/css-additions/CaseQueue.css`): `.hz-queue` `__head` `__title` `__tools` `__search` `__sort`, `.hz-case` `__name` `__sub`, `.hz-owner--inline` (pill-sized ActionOwner for a table cell), `td.hz-queue__assignee--none`.

```html
<tr>
  <td><span class="hz-age hz-age--overdue"><svg class="hz-icon hz-icon--xs">…clock</svg>۱۲ روز</span></td>
  <td><bdi class="hz-id" dir="ltr">HZ-R6KD2WQ8NA</bdi></td>
  <td><div class="hz-case"><a class="hz-case__name" href="/assoc/kyc/…">علی رضایی</a>
      <span class="hz-case__sub">اصفهان · ارسال دوباره ۷ مهر · نسخه ۳</span></div></td>
  <td>احراز هویت</td>
  <td><span class="hz-badge hz-badge--info"><span class="hz-badge__dot"></span>در انتظار بررسی انجمن</span></td>
  <td><span class="hz-owner hz-owner--you hz-owner--inline"><span class="hz-owner__who">انجمن</span></span></td>
  <td>حمید نوروزی</td>
  <td><a class="hz-icon-btn hz-icon-btn--sm" aria-label="باز کردن پرونده علی رضایی">…caret-right mirrored</a></td>
</tr>
```

## Tokens

`bg-surface` `bg-subtle` (header row, hover) `border-default` `border-subtle` `text-primary` `text-secondary` `status-warning-text` (late age, «انجمن» owner) `status-error-text` (overdue age) `status-{tone}-*` (badges) `bg-brand-subtle` `border-brand` (pressed chip, current page) `focus-ring` `radius-xl` (wrap) `radius-lg` (card item) `radius-full` (chips, owner pill).

## Variants & sizes

- **Age tone**: plain (under the late threshold) · `--late` · `--overdue`. Thresholds come from the «مهلت‌ها» settings group, not the component. The preview uses ≥۵ days for late and ≥۱۰ days for overdue as an illustration.
- **Age only warns when the clock is ours.** If ActionOwner is the applicant or the counterparty, the age stays plain and its `title` says whose clock it is («ساعت این پرونده با متقاضی است»).
- **Queue scope**: a single queue (`/assoc/kyc`, so the «نوع» column is hidden) or a combined environment queue («صف‌ها», with type chips).
- Dense rows (40px). The comfortable `.hz-table` (44px) is for queues with thumbnails, such as market listings.

## States

- **Default**: the oldest case comes first and the sort header shows `aria-sort="descending"`.
- **Hover** (pointer only): row tint `bg-subtle`. The name underlines.
- **Focus-visible**: a ring on the name link. The whole row is not a link, so the code stays selectable.
- **Loading**: skeleton rows inside the same wrap, with `aria-busy="true"`.
- **Empty**: «پرونده‌ای در صف کنل نیست» + what brings the next case.
- **Filtered empty**: names the filters + «پاک کردن فیلترها».
- **Error**: `NetworkErrorState` in the wrap.
- **Long Persian text**: the subline ellipsises at 280px with a full `title`. The edge-case centre name «مرکز جامع درمانی، جراحی و تصویربرداری … دکتر صالحی» is the test. The name never wraps in the table.
- **Unassigned**: «تخصیص‌نیافته» in `text-secondary`.

## Mobile ↔ desktop

- **<768**: card list. Filters go behind the funnel button in a full-screen Drawer, and the visible chips scroll horizontally (`.hz-filterbar--scroll`). No horizontal table scroll, ever. Chips and pages are 44px on coarse pointers.
- **768–1023**: table with fewer columns. Drop «مسئول» and «نوع» (type moves into the subline).
- **≥1024**: full table inside OpsShell (`--container-app`).
- **Mobile tool row:** `.hz-toolrow` — «فیلترها» (secondary, opens the filter Drawer) · SortMenu · select-mode `IconButton --outline` (`check-square`), 44px each; it sits under the scrolling chip row.
- **Desktop column budget** and the animal-centred variant: see *P09 › Content & data rules*.

## RTL & LTR

Columns run start→end in reading order. Case codes and national IDs are `<bdi class="hz-id" dir="ltr">`. The open caret and pagination use `caret-right`/`caret-left` + `.hz-icon--mirror`. `clock`, `magnifying-glass`, `funnel-simple`, the sort arrows (`arrow-down` / `arrow-up` in the header, see DataTable) and the SortMenu icon are not mirrored.

## Accessibility

Use a real `<table>` with a hidden `<caption>`, `scope="col"`, and `aria-sort` on the sortable header (a `<button>` inside it). The chips are toggle buttons (`aria-pressed`) in a `role="group"` labelled «نوع پرونده». The count is `aria-live="polite"`, so a filter change is announced. Each open button names the case («باز کردن پرونده علی رضایی»). Tab order: search → sort → chips → rows → pagination.

## Data

| Field | Source |
|---|---|
| age | `now − submittedAt` (first submission), whole days, Persian digits |
| code | request `code` (`HZ-` + 10, `_meta.idRegistry`) |
| applicant, city | `people.displayName`, `city`; subline = animal pair, kennel, centre, or «ارسال دوباره · نسخه N» |
| type | queue kind (احراز هویت، عضویت، کنل، مجوز جفت‌گیری، …) |
| status | StatusBadge key from the status dictionary (e.g. `PENDING_REVIEW` → «در انتظار بررسی انجمن») |
| action owner | `actionOwnerFa`. `--you` when it equals the viewing environment |
| assignee | operator `displayName`, or «تخصیص‌نیافته» |

Counts on chips come from the server (preview: احراز هویت ۴ · عضویت ۶ · دامپزشکان ۵ · کنل ۱ · مجوز جفت‌گیری ۲ = ۱۸, matching the approved KYC mockup nav). In the preview, `HZ-R6KD2WQ8NA`, `HZ-T3MW8XBQ5E`, `HZ-9FJP4CNW2H` and `HZ-4NQ7VHC3KS` are synthetic codes in the registry alphabet. `HZ-767PEG578Z` and `HZ-MYUKV79KBC` are real sample codes.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** No shared queue component exists; each ops page renders its list inline. ★ New.


New ★ `src/ops/case-queue.tsx`: `CaseQueue({ title, cases, total, filters, activeFilters, sort, onSort, page, pageSize, viewerOwner, loading, error, emptyState })`. Each `case` is `{ id, href, code, applicant, sub, typeFa, status, actionOwner, assignee, submittedAt, version }`. The age is computed with thresholds from settings. Pagination logic stays in `src/domain/pagination.ts`. It replaces the separate list UIs in about 17 pages.

## Do / Don't

- Do sort by age by default and keep the age column first.
- Do show ActionOwner on every row. Don't encode it in the status label.
- Don't colour an age red when the case waits on someone else.
- Don't force a horizontal scroll on mobile. Switch to cards.
- Don't put more than one orange element per row. Names are ink links, not orange.
