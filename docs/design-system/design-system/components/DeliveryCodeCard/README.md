# DeliveryCodeCard

The handover code of a market sale: the **buyer holds the code** and says it at delivery; the **seller enters it** to record the handover and transfer ownership.

Use on the buyer's purchase page and the seller's listing request page (K17) once the handover code is issued (`handover.status = CODE_ISSUED`, badge `CODE_ISSUED` «کد تحویل صادر شد», info), and as a compact card in the thread. Not for sign-in or contract codes (OtpField / ContractCard), and not for payment receipts.

## Anatomy

**Buyer view:** card → title with `key` icon «کد تحویل توله ژرمن شپرد» → lead «این کد را **فقط هنگام تحویل حضوری** و پس از دیدن توله به فروشنده بگویید.» → code box (dashed `border-control` on `bg-subtle`, 36/48 800, Latin, LTR, wide tracking) + copy IconButton → facts (`shield-check` ownership transfer, `calendar-blank` appointment, `clock` validity) → ActionOwner «شما».

**Seller view:** card → title «ثبت تحویل …» → lead naming the buyer → `.hz-otp` 6 boxes (LTR) → primary «ثبت تحویل» (disabled until 6 digits) → caution fact → ActionOwner «شما».

## CSS API

| Class | Use |
|---|---|
| `.hz-handover` · `__head` · `__title` · `__lead` | Card (16px, 20px ≥1024) |
| `__code` · `__digits` | Code box; digits always `direction: ltr` |
| `__code--void` | Expired: `bg-disabled`, struck digits in `text-disabled` |
| `__facts` · `__fact` | Icon + sentence list |
| `__entry` | Seller form column (OtpField `.hz-otp` + error + button) |

```html
<div class="hz-handover__code">
  <span class="hz-visually-hidden">کد تحویل:</span><bdi class="hz-handover__digits" dir="ltr">482917</bdi>
  <button class="hz-icon-btn hz-icon-btn--sm" type="button" aria-label="کپی کد تحویل">…copy…</button>
</div>
```

## Tokens

`bg-surface` · `border-default` · `bg-subtle` + `border-control` (code box) · `bg-disabled` + `text-disabled` (void) · `text-primary` · `text-secondary` · `icon-default` / `icon-strong` · `--font-latin` (digits) · OtpField and ActionOwner tokens · `status-success-*` / `status-warning-*` badges.

## Variants & sizes

Buyer · seller. Compact (in thread): title + code/entry only. Full (order page): all facts.

## States

| State | Buyer | Seller |
|---|---|---|
| Code issued | code + copy, ActionOwner «شما» | entry, ActionOwner «شما» |
| Typing / focus | — | focus ring on the current box |
| Wrong code | — | `aria-invalid` boxes + «این کد با کد خریدار یکی نیست. رقم‌ها را دوباره از خریدار بپرسید.» |
| Verifying | — | boxes disabled, button `aria-busy` |
| Completed | badge `COMPLETED` «تحویل انجام و مالکیت منتقل شد» + time | same |
| Expired | badge `EXPIRED` «منقضی», void code, ActionOwner «داور اختلاف» | same badge, entry removed |

Hover only on the copy button (pointer). Long Persian text: the lead and facts wrap; the code never wraps.

## Mobile ↔ desktop

Same layout at every width; at 360px the code (6 × ~30px) and OtpField (328px) both fit with 16px gutters. On mobile the seller view is the first block of the request page so it is reachable at the handover.

## RTL & LTR

Text RTL; the code and the OTP boxes are **always LTR** (first digit on the left), like the SMS and the paper. Copy icon is never mirrored.

## Accessibility

Code is read as digits: wrap in `<bdi>` and give screen readers spaced digits via `aria-label` in code («۴ ۸ ۲ ۹ ۱ ۷»). Copy confirms with a polite Toast «کد کپی شد». Seller entry follows OtpField (group label «کد تحویل ۶ رقمی», per-box labels, error `role="alert"`). Completion is announced politely.

## Data

`marketplace.json › handover`: `status` (`CODE_ISSUED` → issued, then completed/expired), the code (buyer only — never sent to the seller's client), expiry from server settings, appointment from the thread, buyer/seller names, listing `animalName`. Code length assumed 6 like `CODE_LENGTH`; confirm in the repo.

## Code mapping

★ New `DeliveryCodeCard`: `viewer: 'buyer' | 'seller'`, `status`, `code` (buyer), `expiresAt`, `appointment`, `counterpartName`, `animalName`, `onSubmit(code)`, `error`, `busy`, `completedAt`.

## Do / Don't

- Do tell the buyer to give the code only after seeing the animal.
- Do keep the code LTR and unbroken; never Persian digits for the code itself.
- Don't show the code to the seller or put it in a notification preview.
- Don't let the seller retry without a clear error.
