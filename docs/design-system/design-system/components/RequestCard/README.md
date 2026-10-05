# RequestCard

One case the user is following — title, `HZ-` code, animal, deadline, status and whose move it is («اقدام بعدی با: …») — with a «پیگیری» link to the case.

Use in «درخواست‌های من», the dashboard «درخواست‌های فعال» panel and vet/breeder case lists in PublicShell. Not for OpsShell queues (use `CaseQueue` / `DataTable`) and not for payments (payment row, P1).

## Anatomy

1. Title — `titleFa`, Bold 16/26 («صدور شجره‌نامه»).
2. Meta line — `HZ-` code in `<bdi class="hz-id" dir="ltr">`, «حیوان: …» (or «—»), deadline with `calendar-blank` or «به‌روزرسانی: …».
3. `StatusBadge` at the end of the head.
4. Optional note — the operator's correction reason, full text, never truncated.
5. Overdue line — `.hz-age--overdue` with `warning` icon: «مهلت: ۵ مهر ۱۴۰۵، ۵ روز گذشته».
6. Foot — `ActionOwner` (fills the row) + «پیگیری» secondary ButtonLink with `arrow-right` mirrored.

## CSS API

Bundle: `.hz-request`, `.hz-request__head`, `.hz-request__title`, plus `.hz-owner` (`--you`), `.hz-badge`, `.hz-age--overdue`, `.hz-btn--secondary`.
Additions (`css-additions/RequestCard.css`): `.hz-request__meta` (wrapping meta line), `.hz-request__note`, `.hz-request__foot` (owner grows, button 100% wide below 768px, auto from 768px).

```html
<article class="hz-request">
  <div class="hz-request__head">
    <div>
      <div class="hz-request__title">صدور شجره‌نامه</div>
      <div class="hz-request__meta"><bdi class="hz-id" dir="ltr">HZ-49UQ9KAEBE</bdi><span>حیوان: تارا</span></div>
    </div>
    <span class="hz-badge hz-badge--warning"><span class="hz-badge__dot"></span>در انتظار پرداخت</span>
  </div>
  <div class="hz-request__foot">
    <div class="hz-owner hz-owner--you"><span>اقدام بعدی با: <b class="hz-owner__who">شما</b></span><span class="hz-owner__extra">مبلغ: ۴۰۰٬۰۰۰ تومان</span></div>
    <a class="hz-btn hz-btn--secondary" href="/requests/HZ-49UQ9KAEBE">پیگیری<svg class="hz-icon hz-icon--sm hz-icon--mirror" …arrow-right…></svg></a>
  </div>
</article>
```

## Tokens

`border-subtle` (row hairline), `text-primary`, `text-secondary`, `bg-subtle` (owner box), `status-warning-bg/-text` (owner = you), `status-error-text` (overdue), `status-{tone}-*` (badge), `action-secondary`, `border-control`, `focus-ring`.

## Variants & sizes

- **Owner = شما** — `.hz-owner--you` (warning tint). The only time the box is coloured: it is the user's move.
- **Owner = someone else** — دامپزشک معتمد · انجمن · مرکز ژنتیک · طرف مقابل · سیستم — neutral `bg-subtle`.
- **With amount** — `hz-owner__extra` «مبلغ: ۴۰۰٬۰۰۰ تومان» when the next move is a payment.
- **Overdue** — deadline passed; red `.hz-age--overdue` line, status stays as the dictionary says.

## States

- **Default**; **hover** (pointer): secondary button `action-secondary-hover`.
- **Focus-visible:** ring on «پیگیری» (the card itself is not one link — it holds a note and an action).
- **Disabled:** n/a. **Loading:** skeleton title + meta + owner bar.
- **Empty:** `EmptyState` «هنوز درخواستی ندارید» with a one-line explanation.
- **Error / overdue:** see Variants. **Long Persian text:** the correction note «تصویر پروانه کسب خوانا نیست؛ نسخه واضح‌تری بارگذاری کنید.» wraps in full.

## Mobile ↔ desktop

- <768: head stays a row (badge wraps under the title if needed); owner box full width; «پیگیری» full width below it, 44px.
- 768–1023 and ≥1024: owner box and button share one row; dashboard shows requests beside animals at ≥1024.

## RTL & LTR

Badge and button sit at the end. `arrow-right` and the chevrons are mirrored by `dir`; `calendar-blank` and `warning` never are. `HZ-` codes are `<bdi dir="ltr">`. Never put a «·» directly next to Persian digits — it reads as «۰»; use «،» or separate items.

## Accessibility

- `<article>` per case, title as its heading (`h3` in a list under an `h2`).
- «پیگیری» needs context for screen readers: `aria-label="پیگیری صدور شجره‌نامه، کد HZ-49UQ9KAEBE"` or `aria-describedby` to the title.
- Overdue is text («۵ روز گذشته»), not colour alone; the icon is `aria-hidden`.

## Data

`requests-and-payments.json → requests[]`: `code`, `titleFa`, `animalName` (null → «—»), `status`, `actionOwner`/`actionOwnerFa`, `deadline`, `updatedAt`, `amount` (when awaiting payment), `correctionFa`. Overdue = `deadline` before the reference date; the day count is computed at render.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/card.tsx`: `RequestCard({ title, requestCode, animalName, status: { tone, label }, owner: ActionOwnerKind, deadlineFa?, resumeHref })`. Keep; `status` will accept a dictionary key; add `amountToman?`.


`src/ui/card.tsx` → `RequestCard` (manifest F, P0) composing `ActionOwner` and `StatusBadge` from `src/ui/status.tsx`. Keep the existing props as in code; the card must receive the fields above. Proposed: `overdueDays?: number`, `note?: string`.

## Do / Don't

- Do show «اقدام بعدی با: …» on every case, even when it is «سیستم».
- Do keep the status label from the dictionary («در حال بررسی»), and put who reviews in ActionOwner — not «در حال بررسی مرکز ژنتیک».
- Don't make «پیگیری» primary in a list; the one primary on the page is elsewhere (e.g. «پرداخت ۴۰۰٬۰۰۰ تومان» on the case page).
- Don't hide an overdue deadline inside the badge.
