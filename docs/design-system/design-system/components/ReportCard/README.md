# ReportCard

One abuse report, grouped by its target (content, listing, message or mating profile): what was reported, why, how many times and by whom, its status and who acts next.

Use it in the report queues (`/content/reports`, market «گزارش آگهی‌ها» and «گزارش پیام‌ها», «گزارش‌های جفت‌یابی») as the mobile card and on the queue home, and as the head of the report desk (`/content/reports/[contentId]`, P10). On desktop queues the same fields fill CaseQueue table columns. Don't use it for user-facing «گزارش تخلف» confirmation; that is an Alert.

## Anatomy

1. **Head**: kind with icon («گزارش آگهی» storefront · «گزارش پیام» chat-circle · «گزارش محتوا» file-text · «گزارش جفت‌یابی» paw-print) + StatusBadge.
2. **Target**: title as a link to the reported item + one meta line (seller and city, author, owner).
3. **Reason**: the main reason as a neutral CategoryTag + «+ ۱ دلیل دیگر» when reports disagree.
4. **Evidence** (optional): the reported message excerpt (`blockquote`) or the reporter's note «توضیح گزارش‌دهنده: …».
5. **Stats**: flag + «۵ گزارش» (warning colour from 3 reports), reporters «سارا احمدی و ۴ نفر دیگر», «آخرین: ۱۰ مهر، ۰۸:۳۰».
6. **Foot**: ActionOwner «اقدام بعدی با: ناظر آگهی» with age, and «بررسی گزارش» (secondary).
7. **Closed**: no foot; an outcome strip with the target's new status («پنهان») and one sentence.

## CSS API

Bundle: `.hz-card` `.hz-badge` `.hz-tag--neutral` `.hz-owner--you` `.hz-age` `--late` `.hz-btn--secondary` `.hz-skeleton`.
Additions (`tools/css-additions/ReportCard.css`): `.hz-report` `__head` `__kind` `__target` `__target-meta` `__reason` `__excerpt` `__note` `__stats` `__stat` `__count` (`--high`) `__outcome` `__foot`.

```html
<article class="hz-card hz-report" aria-labelledby="rp1">
  <div class="hz-report__head"><span class="hz-report__kind">…storefront… گزارش آگهی</span><span class="hz-badge hz-badge--info">…در انتظار بررسی</span></div>
  <div><h3 class="hz-report__target" id="rp1"><a href="…">توله ژرمن شپرد</a></h3><span class="hz-report__target-meta">کنل آریا، کرج</span></div>
  <div class="hz-report__reason"><span class="hz-tag hz-tag--neutral">فروش توله بدون مجوز جفت‌گیری</span></div>
  <div class="hz-report__stats">…</div>
  <div class="hz-report__foot"><div class="hz-owner hz-owner--you">…</div><a class="hz-btn hz-btn--secondary" href="…">بررسی گزارش</a></div>
</article>
```

## Tokens

`bg-surface` `border-default` `border-subtle` (foot rule) `bg-subtle` (excerpt, outcome) `border-control` (excerpt bar) `icon-default` `text-secondary` `status-warning-text` (high count, late age) `status-warning-bg` (ActionOwner you) `status-info-*` `status-success-*` `status-neutral-*` (badges) `radius-xl` `radius-md` `radius-sm`.

## Variants & sizes

- **Kind**: content · listing · message · mating — icon and meta change; everything else is shared.
- **With excerpt** (message reports): the reported text, max 4 lines; card numbers and phones in it are masked by the server.
- **Open / in review / closed**: status per dictionary — `OPEN` «در انتظار بررسی», `UNDER_REVIEW` «در حال بررسی» (info), `RESOLVED` «تعیین تکلیف شد» (success). Closed cards drop the ActionOwner (done/closed have no next move).
- One size; in a 2-column grid from 768.

## States

- **Default** and **hover** (pointer: title link turns brand + underline).
- **Focus-visible**: ring on the title link and the button.
- **High volume**: from 3 reports the count turns `status-warning-text`; the queue sorts these first.
- **Loading**: skeleton card (kind, badge, title, meta, tag).
- **Empty** (queue level): «گزارشی برای بررسی نیست» — PageStates compact.
- **Error**: queue-level Alert; a card never renders half-filled.
- **Long Persian text**: titles wrap to three lines, notes wrap; nothing is truncated on the desk head.

## Mobile ↔ desktop

- **<768**: one column; the button is full width under the ActionOwner.
- **768–1023**: two columns.
- **≥1024**: queues use CaseQueue rows (سن · موضوع · دلیل · تعداد · وضعیت · مسئول); the card stays on queue homes and as the desk head.

## RTL & LTR

Kind and title at the start, badge at the end. `storefront`, `chat-circle`, `file-text`, `paw-print`, `flag`, `users`, `user`, `lock-simple`, `clock` are not mirrored. The excerpt's accent bar uses `border-inline-start`, so it sits on the right in RTL.

## Accessibility

- `article` labelled by the target title; the kind is text, not only an icon.
- Count, reporters and age are text («۵ گزارش»), not colour only.
- Reporter identity is visible to staff only; the card says «(محرمانه)» on mating reports, and the reported party never sees it.
- The excerpt is a `blockquote`; masked digits are read as «پنهان».

## Data

Grouped by `targetType` + `targetId`: `reports[]` (`reporterId`, `reasonCode`, `noteFa?`, `createdAt`), `count`, `firstAt`, `lastAt`, `status`, `assignee`, `actionOwner`, `outcome?` (`targetStatus`, `noteFa`, `actor`, `at`). Reason labels from a per-kind taxonomy. The reasons in the preview («فروش توله بدون مجوز جفت‌گیری»، «درخواست پرداخت خارج از همزیست»، «اطلاعات سلامت نادرست»، «اطلاعات نادرست») are illustrative until the product owner fixes the list.

## Code mapping

★ New `src/ops/report-card.tsx`: `ReportCard({ kind: 'CONTENT'|'LISTING'|'MESSAGE'|'MATING', target: { titleFa, href, metaFa }, reasons: { labelFa, count }[], excerptFa?, reporterNoteFa?, count, reporters: { displayName }[], lastAt, status, actionOwner?, age?, outcome?, href })`.

## Do / Don't

- Do group many reports on one target into one card with a count.
- Do show the reported text for message reports, with payment details masked.
- Do keep the reporter's name away from the reported party.
- Don't colour the card red for a new report; status tone says who acts.
- Don't put the decision (hide, restrict) on the card; it happens in the desk with ReasonField.
