# PaymentResult

The page a buyer lands on after the bank gateway — pending · success · failed — showing what the **server** says about the payment, its `HZP-` id and the next step; it is never a payment receipt.

Use it on every return route (the ten `…/return` pages, `/membership`, `/puppy-cards/checkout`, shop checkout) for all 17 paid services. The query string from the bank proves nothing: the page asks the server for the payment by id and renders that status. Not for the payment history (`/payments` list) and not for a printable receipt (Print documents group).

## Anatomy

1. State head (`.hz-state`): tone icon circle (spinner · `check` · `x`), payment `StatusBadge`, title (H 18/30), one-sentence body.
2. Facts (`.hz-kv`): «شناسه پرداخت» `HZP-` id (`Identifier`, copy on success) · «خدمت» · «مبلغ» · time («شروع پرداخت» / «زمان تأیید» / «زمان تلاش»).
3. `ActionOwner` — pending «همزیست», failed «شما». None on success (done family).
4. Notice (`__notice`): pending «دوباره پرداخت نکنید»; success «این صفحه رسید پرداخت نیست…».
5. «قدم بعد» list (success only): what this payment unlocked.
6. Actions: one primary at most; secondary for history / back.

## CSS API

New in `css-additions/PaymentResult.css`: `.hz-pay-result` (`__notice`, `__next`, `__next-title`, `__next-list`, `__actions`, `__actions--row`) and the modifier `.hz-state--success` (success icon tone for the bundle's `.hz-state`). Composes `.hz-card`, `.hz-state`, `.hz-badge`, `.hz-kv`, `.hz-identifier`, `.hz-owner`, `.hz-btn`.

```html
<section class="hz-card hz-pay-result" aria-labelledby="pr">
  <div class="hz-state hz-state--success" role="status">
    <div class="hz-state__icon"><svg class="hz-icon hz-icon--lg" …check…></svg></div>
    <span class="hz-badge hz-badge--success"><span class="hz-badge__dot"></span>پرداخت‌شده</span>
    <h1 class="hz-state__title" id="pr">پرداخت تأیید شد</h1>
    <p class="hz-state__body">سرور همزیست پرداخت شما را برای «عضویت انجمن (مادام‌العمر)» تأیید کرد.</p>
  </div>
  <dl class="hz-kv">…شناسه پرداخت · خدمت · مبلغ · زمان تأیید…</dl>
  <p class="hz-pay-result__notice">…این صفحه رسید پرداخت نیست…</p>
  <div class="hz-pay-result__actions">…</div>
</section>
```

## Tokens

`bg-surface`, `border-default`, `bg-subtle`, `status-info-*`, `status-success-*`, `status-error-*`, `status-warning-*` (owner «شما»), `text-primary`, `text-secondary`, `icon-default`, `action-primary`, `radius-xl`, `radius-md`.

## Variants & sizes

| Server status | Badge (dictionary) | Title | Owner | Primary |
|---|---|---|---|---|
| `PENDING` | در جریان (info) | در حال تأیید پرداخت | همزیست | — (secondary «بررسی دوباره وضعیت») |
| `PAID` | پرداخت‌شده (success) | پرداخت تأیید شد | — | the unlocked next step («ثبت حیوان»، «مشاهده سفارش») |
| `FAILED` | ناموفق (error) | پرداخت انجام نشد | شما | «پرداخت دوباره ۳۰۰٬۰۰۰ تومان» |

Shop checkout success: body «سفارش 854Q6KUX ثبت شد.», «قدم بعد» «هر فروشنده زیرسفارش خود را می‌پذیرد و جداگانه ارسال می‌کند.», primary «مشاهده سفارش». `CANCELLED` (buyer left the gateway) uses the failed layout with the neutral badge «لغوشده» and the same retry button. One width: max 560, centred.

## States

- **Pending** is the page's loading state: polite live region, polls the server, flips to success/failed in place without a reload; after a server-defined timeout it stays pending and says where to follow up — never «failed» by guess.
- **Focus-visible**: on load, focus moves to the title (`tabindex="-1"`) so screen readers start at the result; rings on copy and buttons.
- **Error** (status could not be fetched): `NetworkErrorState` with «دوباره تلاش کنید», and the reminder not to pay again.
- **Disabled**: retry is disabled while a new gateway session is created (spinner in the button).
- **Long Persian text**: bodies wrap centred (max 420px, from `.hz-state__body`); service names wrap in the facts list.

## Mobile ↔ desktop

<768: full-width card inside the page padding, actions stacked full width (primary first). ≥768: same card centred at 560px; `__actions--row` may lay two buttons side by side. The `HZP-` id (20 characters) stays on one line at 360px; the copy button grows to 44px on coarse pointers.

## RTL & LTR

The `HZP-` id is Latin in `bdi dir="ltr"`, never split. Icons are non-directional. Money and dates Persian («۷ مهر ۱۴۰۵، ۹:۱۰»).

## Accessibility

- Head is `role="status"` (pending, success) or `role="alert"` (failed); pending is `aria-live="polite"` so the flip is announced once.
- Status in text (badge + title), not only by icon colour.
- Copy button: «کپی شناسه پرداخت», with «کپی شد» announced (see `Identifier`).

## Data

`requests-and-payments.json → payments[]`: `reference` (`HZP-` + 16 base64url), `serviceFa`, `amount`, `status`, `paidAt` / `createdAt`. Preview: HZP-GTGB8MQFU5DTR62Z (PENDING, صدور شجره‌نامه)، HZP-EMN2VJ25FJFFN7SA (PAID, عضویت انجمن)، HZP-TEQUAKE8YGA7CDQP (FAILED, مجوز جفت‌گیری). Status always from the server (`src/billing/payments.ts`), never from gateway query parameters.

## Code mapping

★ New — proposed `PaymentResult` in `src/billing/payment-result.tsx`: `reference`, `status: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED'`, `serviceLabel`, `amountToman: bigint`, `at`, `nextSteps?: string[]`, `primaryAction?`, `secondaryAction?`, `retry?: () => void`, `pollIntervalMs?`. Replaces the per-route return pages' own markup.

## Do / Don't

- Do render only the server's status; show pending until it answers.
- Do tell pending users not to pay again, and failed users what happened to their money.
- Don't call this page a receipt or offer «دانلود رسید» here — the record lives in «پرداخت‌ها».
- Don't use celebration copy or exclamation marks on success.
