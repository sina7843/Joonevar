# P08 — Payment and return · پرداخت و بازگشت

## Purpose

The three moments of every paid service: **summary** (what you are paying for and how much), **gateway** (the bank's page, outside Hamzist), and **result** (what the server says happened). It is used by 17 paid services: membership, registration sheet, pedigree, mating permit, puppy cards, kennel, seller plan, advertising packages, vet profile, mating finder subscription, and shop checkout. The rule that shapes everything: **the return page is not a payment receipt.** The bank's query string proves nothing. The page asks the server for the payment by its `HZP-` id and renders that status, polling while it is pending.

**No key screen.** P08 is covered by components only: `OrderSummary`, `RadioCard`, `PriceDisplay`, `UnsetValue`, `StickyActionBar`, `ActionRow`, `PaymentResult`, `Identifier`, `ActionOwner`, `PageStates`. Its summary step also appears at the end of P07 (K10's last step) and its money rows in P06.

**Don't use it** for the payment history (`/payments`, P05), for one payment's record (`/payments/[id]`, P06), for printed receipts (`A4DocumentTemplate`), or for product returns (`/account/orders/[id]/return` and `/account/purchases/[id]/return` are مرجوعی forms, P07, despite the word "return").

## Anatomy

**A. Summary page** (`/membership`, `/puppy-cards/checkout`, `/account/packages`, shop checkout from `/shop/cart`):
1. `PageHeader` «پرداخت عضویت انجمن».
2. Choice, when there is one: `RadioCard` options with prices («عضویت سالانه — ۳۰۰٬۰۰۰ تومان»), or `CartRow`s grouped per shop for the shop.
3. **Summary card:** a `KeyValueList` (service, animal, `HZ-` request code) or `OrderSummary` (subtotal, shipping per shop, discount, «مبلغ قابل پرداخت»), then the total in `PriceDisplay`.
4. `ActionOwner` «اقدام بعدی با: شما».
5. Primary «پرداخت ۳۰۰٬۰۰۰ تومان» with the `lock-simple` icon + one line: «به درگاه بانک منتقل می‌شوید. پس از پرداخت به همزیست برمی‌گردید.»

**B. Return page** (`…/return`): one centred `PaymentResult` card.
1. State head: a spinner, check or x icon, `StatusBadge` from the server status, title and one sentence.
2. Facts: «شناسه پرداخت» `HZP-` (`Identifier`, copy) · «خدمت» · «مبلغ» · the time.
3. `ActionOwner`: «همزیست» while pending, «شما» on failure, none on success.
4. Notice: pending «دوباره پرداخت نکنید»; success «این صفحه رسید پرداخت نیست…».
5. «قدم بعد» on success: what was unlocked.
6. Actions: one primary at most.

## Layout

| | Mobile (<768) | Tablet (768–1023) | Desktop (≥1024) |
|---|---|---|---|
| Summary page | one column; summary card after the choices; `StickyActionBar` with «عضویت انجمن» + «۳۰۰٬۰۰۰ تومان» and a full-width pay button; tab bar hidden | one column in `container-reading` 720; the pay button in-content, full width | summary card centred (max 560) for single services; shop: cart list 8/12 + `OrderSummary` 4/12 sticky at `header-app` + `space-16` |
| Return page | full-width card inside 16 margins; actions stacked, primary first, 44–48px | card centred, max 560 | card centred, max 560; `__actions--row` may put two buttons side by side |
| Overlays | «جزئیات مبلغ» in `BottomSheet` | `Modal` | inline |
| Spacing | card padding `space-16`, gap `space-24` | padding `space-24` | padding `space-24` |

The gateway itself is outside the shell. Nothing on Hamzist's side may imitate the bank page.

## States

- **Loading (summary):** Skeleton of the summary card: `keyValue` bars + total bar. The pay button is not rendered until the amount is known.
- **Redirecting:** the pay button gets `aria-busy` + spinner + «در حال انتقال به درگاه». Secondaries are disabled. A double tap must not create two sessions.
- **Pending (return):** this is the page's loading state. `role="status"`, `aria-live="polite"`, polling. It flips to success or failed in place. After the server timeout it stays pending and says where to follow up («وضعیت این پرداخت را از «پرداخت‌ها» پیگیری کنید»). It never guesses «ناموفق».
- **Success:** badge «پرداخت‌شده», the `HZP-` id with copy, «قدم بعد», and the primary that the payment unlocked («ثبت حیوان»، «مشاهده سفارش»).
- **Failed / cancelled:** badge «ناموفق» (error) or «لغوشده» (neutral), «اقدام بعدی با: شما», primary «پرداخت دوباره ۳۰۰٬۰۰۰ تومان».
- **Error / network:** the status could not be fetched → NetworkErrorState with «تلاش دوباره» **and** the reminder not to pay again. Never show success or failure without the server.
- **Locked / permission:** **unset fee** → the total reads «تعیین‌نشده» (`UnsetValue`), the pay button is disabled, and the note says «تعرفه این خدمت تعیین‌نشده است و پرداختش باز نیست.» (26 fees ship `null`). A prerequisite that is missing (e.g. incomplete KYC) uses `LockedServiceCard` instead of the summary. A return page for another account's payment gets the not-found state.
- **Hard cases:** the `HZP-` + 16 id stays on one line at 360px. A long service name wraps in the facts list. Big amounts («۴۵۰٬۰۰۰٬۰۰۰ تومان») never truncate in the sticky bar (the context line truncates instead). Shop checkout with several shops shows shipping per shop.

## Content & data rules

- Money is integer **تومان**, Persian digits with «٬». The pay button always names the amount. Never Rial, never «۰», never «رایگان» for an unset value.
- Amounts come from settings (fees) or the server-priced order. The client never computes the payable total.
- Times are Jalali with the time of day («۷ مهر ۱۴۰۵، ۹:۱۰»).
- Status keys come from the dictionary: `PENDING` «در جریان» (info) · `PAID` «پرداخت‌شده» (success) · `FAILED` «ناموفق» (error) · `CANCELLED` «لغوشده» (neutral).
- Action order: primary at the start. There is at most one primary on the return page, and none while pending (only «بررسی دوباره وضعیت»).

## Accessibility & keyboard

- Summary: the total is in text next to the button and in the button label, so screen readers hear the amount once per control.
- Return: focus moves to the result title (`tabindex="-1"`) on load. The pending → final flip is announced once (`role="status"` polite; failed uses `role="alert"`). Status is always text + badge, never icon colour alone.
- Copy button «کپی شناسه پرداخت» announces «کپی شد».
- The sticky bar respects the safe area and does not cover the focused control. Buttons are 48px.

## Pages that use it (about 14)

Summary: `/membership` · `/puppy-cards/checkout` · `/account/packages` · `/shop/cart` (checkout step)
Return (10): `/membership/return` · `/registration/[id]/return` · `/pedigree/batch/[id]/return` · `/kennels/[id]/return` · `/mating/permits/[id]/return` · `/puppy-cards/return` · `/account/packages/return` · `/account/seller/return` · `/account/vet-profile/return` · `/account/mating-finder/return`

**Key screen:** none. Covered by components (see the top of this file).

## Do / Don't

- **Do** read the status from the server by payment id, and keep polling while it is pending.
- **Do** tell the user not to pay again while a payment is pending or unknown.
- **Do** name the amount on every pay button.
- **Don't** call the return page a receipt or show «پرداخت موفق» from the query string.
- **Don't** open a payment path for an unset fee.
- **Don't** mark a timed-out payment as failed by guess.
