# AuditRow

One recorded change in `/admin/audit`: when, who, what, the value before → after, and the reason. A table row on desktop, a card below 1024.

Use it for every versioned change: settings (146 keys), decisions on cases, suspensions, revocations, merges, role changes, and system actions. Don't use it for the case history inside a desk (that is Timeline, newest first, one entry per version) or for user notifications.

## Anatomy

| Column | Content |
|---|---|
| زمان | date «۱۰ مهر ۱۴۰۵» + time «۰۹:۴۲» on a second line |
| انجام‌دهنده | name (Bold) + role («سوپرادمین»، «اپراتور انجمن»); system actions: «سامانه» + «کنش خودکار» in secondary |
| کنش | verb: تغییر تنظیم · تعیین مقدار · ویرایش متن · تصمیم پرونده · تعلیق · ابطال · ادغام · نتیجه پرداخت |
| موضوع | target name (link to the record) + key or identifier (`fee.pedigree_toman`, `HZ-R6KD2WQ8NA`) + «نسخه ۸» |
| قبل ← بعد | short values inline with a mirrored `arrow-right`; statuses as StatusBadge sm; long texts as two stacked blocks «قبل» / «بعد» clamped to 2 lines with «نمایش متن کامل» |
| دلیل | the reason as written; none → «— خودکار؛ …» in secondary |

## CSS API

Bundle: `.hz-table` `.hz-table-wrap` `.hz-cardlist` `__item` `__title` `__meta` `.hz-badge--sm` `.hz-id` `.hz-btn--ghost` `.hz-skeleton` `.hz-state--compact` `.hz-alert--error`.
Additions (`tools/css-additions/AuditRow.css`): `.hz-audit-row` (top-aligned cells), `.hz-audit-when` `__time`, `.hz-audit-who` `__name` `__role` `--system`, `.hz-audit-target` `__name` `__key` `__meta`, `.hz-audit-change` `__before` `__after` `__arrow` `__unset` `--text` `--open` `__block` (`--before`/`--after`) `__tag` `__clamp` `__toggle`, `.hz-audit-reason` (`--none`), `.hz-audit-card__head` `__label` `__reason`.

```html
<tr class="hz-audit-row">
  <td><div class="hz-audit-when"><span>۱۰ مهر ۱۴۰۵</span><span class="hz-audit-when__time">۰۹:۴۲</span></div></td>
  <td><div class="hz-audit-who"><span class="hz-audit-who__name">امیر حسینی</span><span class="hz-audit-who__role">سوپرادمین</span></div></td>
  <td>تغییر تنظیم</td>
  <td><div class="hz-audit-target"><a class="hz-audit-target__name" href="…">هزینه صدور شجره‌نامه</a><bdi class="hz-audit-target__key" dir="ltr">fee.pedigree_toman</bdi></div></td>
  <td><div class="hz-audit-change"><span class="hz-visually-hidden">از</span><span class="hz-audit-change__before">۳۵۰٬۰۰۰ تومان</span>…arrow-right mirror…<span class="hz-visually-hidden">به</span><span class="hz-audit-change__after">۴۰۰٬۰۰۰ تومان</span></div></td>
  <td><p class="hz-audit-reason">…</p></td>
</tr>
```

## Tokens

`bg-subtle` (header, before block) `bg-surface` + `border-default` (after block) `border-subtle` (row rules) `text-secondary` (before, time, role, key) `text-primary` `text-brand` (target hover) `icon-default` (arrow) `status-warning-text` («تعیین‌نشده») `status-*` (badges) `radius-md` `radius-xl`.

## Variants & sizes

- **Inline change**: money, numbers, toggles, single-line text, statuses (badges).
- **Text change** (`--text`): help texts and notices; before/after blocks; collapsed to 2 lines each.
- **Unset**: «تعیین‌نشده» in `status-warning-text`, never «۰ تومان» (before or after).
- **System actor** (`--system`): no person; the reason column says what triggered it.
- **Dense table** (`.hz-table--dense`) for exports of 50+ rows.

## States

- **Default**: newest first, 50 per page (Pagination), filters above (بازه تاریخ · انجام‌دهنده · کنش · کلید/موضوع).
- **Hover** (pointer): row tint; target name turns brand and underlines.
- **Focus-visible**: ring on the target link and «نمایش متن کامل».
- **Expanded** (`--open`): the full before/after texts; the caret rotates; `aria-expanded="true"`.
- **Loading**: skeleton rows inside the same table header.
- **Empty**: «تغییری با این فیلتر ثبت نشده است» + the active filters in words + «پاک کردن فیلترها».
- **Error**: Alert «تاریخچه بارگذاری نشد … تغییرها از بین نرفته‌اند» + «تلاش دوباره».
- **Long Persian text**: target names wrap (no ellipsis); reasons wrap inside 280px; text values clamp with the toggle.

## Mobile ↔ desktop

- **≥1024**: the 6-column table.
- **768–1023**: table without «کنش» (the verb moves into the subject meta).
- **<768**: `.hz-cardlist`: head = target + key (start) and date/time (end); then the change; then «کنش، نسخه، انجام‌دهنده (نقش)»; then the reason under a hairline. Toggles are 44px on touch.

## RTL & LTR

The column header reads «قبل ← بعد»; the arrow between values is `arrow-right` + `hz-icon--mirror`, so it points from before (start) to after (end) in both directions. Keys, codes and payment ids are `<bdi dir="ltr">`. Times use Persian digits «۰۹:۴۲».

## Accessibility

- Table has a `caption` («تاریخچه تغییرات، تازه‌ترین در بالا»), `th scope="col"`.
- The arrow is `aria-hidden`; hidden «از» / «به» make the change read as a sentence.
- The text toggle is a `button` with `aria-expanded` + `aria-controls`.
- Card list is a `ul` labelled «تاریخچه تغییرات».

## Data

Audit entry: `at`, `actor` (`accountId`, `displayName`, `role` or `SYSTEM`), `action`, `target` (`type`, `id`, `labelFa`, `key?`, `version?`), `before`, `after` (typed: money → «… تومان», null → «تعیین‌نشده», status key → StatusBadge label), `reasonFa?`, `internalNoteFa?` (shown in a details row for superadmins only). Settings history comes from `src/settings/keys.ts` writes; case decisions from `decisions[]`.

## Code mapping

★ New `src/ops/audit-row.tsx`: `AuditRow({ entry, layout: 'row' | 'card', onOpenTarget? })` and `AuditTable({ entries, filters, page })`. Values are rendered through the same formatters as SettingsPanel (money, unset, status) so history and current value never disagree.

## Do / Don't

- Do show the reason exactly as written; the reason is the point of the log.
- Do render statuses as badges with dictionary labels, both before and after.
- Do show «تعیین‌نشده» for null, before or after.
- Don't truncate names or keys with an ellipsis; wrap them.
- Don't colour «قبل» red and «بعد» green; tones mean "who acts", not good/bad.
