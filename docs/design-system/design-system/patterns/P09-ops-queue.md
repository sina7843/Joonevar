# P09 — Ops queue · صف عملیاتی

## Purpose

The operator's worklist: every open case an environment must handle, oldest first, with its age, status, «اقدام بعدی با» and assignee. Operators open the next case from here, and the decision itself happens on P10. It is the most repeated OpsShell shape (association, review, genetics, content, market, admin lists), it is desktop first and dense, and it must still work on a phone, where an association operator may approve one case on the go. Each environment's **home** is this pattern too: a row of `QueueTile`s (and `StatTile`s for volume reports) above the combined queue «صف‌ها».

**Don't use it** for a user's own records (P05: no age, no assignee), for public lists (P02), or for key-value configuration (P11). An item without a lifecycle (a breed, a category) is a plain `DataTable` list inside P11.

## Anatomy (top to bottom)

1. **Shell:** `OpsShell`: a grouped sidebar with queue counts (`hz-count`, or `--alert` when anything is overdue) and a top bar with `Breadcrumbs` and `AccountMenu`.
2. **`PageHeader`, ops variant:**
   - `h1` styled as h3 («احراز هویت»)
   - a count pill
   - meta with the oldest age («قدیمی‌ترین: ۱۲ روز»)
   - secondary `sm` actions only, never a primary
3. **Home only:** a row of 4 `QueueTile`s (name, count, oldest age, alert flag), plus a `StatTile` row with `SectionHeader --sm` on `/market` and `/admin` («مرور بازار» + «تا ۱۰ مهر ۱۴۰۵»).
4. **`CaseQueue` head:** `SearchField` (name, code, national ID), `SortMenu` («قدیمی‌ترین اول»), and the live count «۱۸ پرونده باز · ۶ مورد نمایش».
5. **`FilterBar`:** type chips with counts (combined queue) and scope chips «اقدام با انجمن» · «تخصیص‌نیافته» · «با من».
6. **Collection:** a `DataTable --dense --selectable` with the columns سن پرونده · کد پرونده · متقاضی (name + muted subline) · نوع · وضعیت (`StatusBadge`) · اقدام بعدی با (`ActionOwner` inline) · مسئول · open.
   - report queues fill the same columns from `ReportCard` fields (سن · موضوع · دلیل · تعداد · وضعیت · مسئول)
   - market listings use the comfortable 44px table with a 56px thumbnail
7. **`BulkActionBar`:** «۳ پرونده انتخاب شد» with the allowed bulk actions (assign, hide listings, close duplicates) and «لغو انتخاب». Only where the module permits it.
8. **`Pagination`:** «۱ تا ۲۵ از ۱۸۴ پرونده».

## Layout

| | Mobile (<768) | Tablet (768–1023) | Desktop (≥1024) |
|---|---|---|---|
| Navigation | top bar 56 (title + environment + menu); nav in a `Drawer` from the end (max 320) | 72 icon rail with alert dots | grouped sidebar `sidebar-ops` 248, collapsible to the rail |
| Tiles | `QueueTile` / `StatTile` 2 × 2, gap `space-12` | 4 in a row | 4 in a row above the queue |
| Collection | **card list** (`CaseQueue` cards or `ReportCard`): type tag + age on top, then name / city / code, then badge + assignee, then the ActionOwner bar | table with fewer columns: drop «مسئول» and «نوع» (type moves to the subline) | full dense table (40px rows) in `container-app`, sticky header under the top bar |
| Filters | chips scroll on one line + funnel → full-screen `Drawer` | chip bar + 400px `Drawer` | chip bar above the table |
| Bulk | «انتخاب» mode adds 44px checkboxes; `BulkActionBar` docks at the bottom | same dock | sticky bar above the table |
| Opening a case | the card's «باز کردن پرونده» → full-page P10 | row → P10 | row name link → P10 (route `[id]`); queues without a detail route open the desk in a `Drawer` from the end |
| Spacing | sections `space-16`, card padding `space-16` | same | sections `space-16`, row padding `space-8`–`space-12`, panel padding `space-16`–`space-20` |

## States

- **Loading:** skeleton rows inside the same table wrap (or card skeletons on mobile) with `aria-busy`. Tiles show skeleton lines in their frame. Sidebar counts show no pill while loading (never «۰»).
- **Empty:** «پرونده‌ای در صف کنل نیست» + what brings the next case («درخواست‌های تازه پس از ارسال کاربر اینجا می‌آیند»). An empty tile stays in the row with «صف خالی است».
- **Filtered empty:** names the filters + «پاک کردن فیلترها».
- **Error / network:** NetworkErrorState in the wrap with «بارگذاری دوباره». A failed tile shows «—» + «بارگذاری نشد» and still links to the queue.
- **Locked / permission:** without the environment's role, `AccessDenied` (role) fills the work area: «نقش فعلی: کاربر، نقش لازم: اپراتور انجمن», with «تغییر نقش» only if the account holds the role. Marketplace navigation is capability-filtered, so items a role lacks are absent, not disabled.
- **Overdue:** age `--late` / `--overdue` uses thresholds from the «مهلت‌ها» settings group. **The age only warns when the clock is ours.** When the next action is with the applicant or counterparty, the age stays plain and its `title` says whose clock it is. A tile whose oldest case is past the deadline turns `--alert` with «از مهلت بررسی گذشته».
- **Hard cases:** a long centre name in the subline ellipsises at 280px with the full `title` and never wraps in the table. An unassigned case shows «تخصیص‌نیافته» in `text-secondary`. A resubmitted case shows «ارسال دوباره · نسخه ۳» in the subline. A missing thumbnail uses the `RecordImage` placeholder.

## Content & data rules

- Default sort is age, oldest first, with the age column first. Age = now − first submission, in whole days and Persian digits.
- Every row has `ActionOwner`. `--you` applies when the owner equals the viewing environment. The status label never names the owner.
- Codes and national IDs are Latin `Identifier`s. Money in finance queues is end-aligned تومان. Dates are Jalali.
- Counts on chips, tiles and the sidebar come from the server. `hz-count--alert` means at least one case is past its deadline.
- There is no primary button in a queue header. Row actions are links («باز کردن پرونده …»). There is one orange element per row at most, and names are ink links.
- **Case code = the record being decided.** Association queues: the request `HZ-`. Genetics: the sample `SM-` (the request `HZ-` sits under it as a muted second line). Animal-centred queues name the animal in the second column («حیوان»: name + `PET-` id, or the temporary `PUP-` code for a litter puppy without an id yet, + breed · owner in the subline).
- **A case blocked by another case** gets a dependency line in `hz-case__sub`: `link` icon + «منتظر: » + the other case as an `Identifier` link («منتظر: SM-FBKJYKGYDY، نمونه مادر»). The blocked case keeps its own age and ActionOwner; it is not hidden.
- **One count per place.** PageHeader meta carries the total and the oldest age («۶ پرونده در صف · قدیمی‌ترین: ۱۲ روز»). The CaseQueue live count appears **only while a search or filter is active** («۲ مورد از ۶ نمایش»).
- **Column budget (desktop, inside OpsShell at 1440 → about 1,100px of table):** at most **7 columns** besides the checkbox and the open caret. Priority, highest first: سن · کد پرونده · نام (متقاضی یا حیوان) · وضعیت · اقدام بعدی با · مسئول · نوع. When the budget is exceeded, «نوع» moves under the code as a muted line, then «مسئول» moves into the name subline. Never let `hz-table-wrap` hide a column silently at 1440.
- **Bulk actions per module:** association — assign; market — assign, hide listings; content — assign, close duplicate reports; genetics — assign and **«ثبت دریافت نمونه»** (approved 11 Mehr 1405: marks the selected physical samples received, `SEND_INSTRUCTED` → `SAMPLE_RECEIVED`; the button shows how many of the selection qualify, «ثبت دریافت نمونه (۱)», and the result is per sample). Results, decisions and anything that issues or revokes a document are never bulk.

## Accessibility & keyboard

- A real `<table>` with a hidden `caption`, `scope="col"`, `aria-sort` on the age header (a `button` inside it), and the selection column labelled per row.
- Focus order: sidebar → top bar → search → sort → chips (`role="group"` «نوع پرونده») → rows (name link, then open button) → pagination. Tiles are single links.
- The live count is `aria-live="polite"` and is announced after filtering. The `BulkActionBar` appears with `role="region"` «کنش گروهی» and focus stays on the checkbox.
- The open button names the case («باز کردن پرونده علی رضایی»). Rows are not whole-row links, so codes stay selectable.
- 36px dense controls on fine pointers, 44px on touch and in the Drawer.

## Pages that use it (about 35)

Homes: `/assoc` · `/genetics` · `/content` · `/market` · `/admin` · `/author` (the review environment has no home route; it opens on `/review/centres`)
Queues: `/review/centres` · `/assoc/kyc` · `/assoc/clubs` · `/assoc/kennels` · `/assoc/permits` · `/assoc/foreign-pedigree` · `/assoc/vet-doctors` · `/assoc/vet-licences` · `/assoc/vet-students` · `/assoc/vet-trusted` · `/assoc/vet-review` · `/assoc/members` · `/assoc/postal` · `/genetics/samples` · `/genetics/receipts` · `/genetics/results` · `/genetics/appeals` · `/review/vets` · `/review/vets/unowned` · `/review/centres/claims` · `/review/communities` · `/review/suggestions` · `/content/reports` · `/content/clubs` · `/market/listings` · `/market/disputes` · `/market/refunds` · `/market/returns` · `/market/sellers` · `/market/catalog` · `/market/handovers` · `/market/settlement` · `/market/finder/reports` · `/admin/audit` (with `AuditRow`)

**Key screens:** **K13** خانه پنل انجمن (`/assoc`, queue tiles + combined queue) · **K14** صف آگهی‌ها (`/market/listings`).

## Do / Don't

- **Do** sort by age by default and show «اقدام بعدی با» on every row.
- **Do** switch to cards below 768. Never scroll a table sideways.
- **Do** keep counts honest: no pill at zero or while loading, alert only when a deadline has passed.
- **Don't** colour an age red when the case waits on someone else.
- **Don't** put a primary button in the queue header, or decide cases inline in the table.
- **Don't** let a sidebar exceed 24 items. Group from 8, collapse groups from 15.
