# OfferCard

A price offer between buyer and seller, with accept/decline for the receiver and a clear end state (accepted, declined, expired, superseded).

Use as the OFFER kind of MessageBubble and on the inquiry summary of a listing (K17). One offer per card; the latest offer is live, older ones show «جایگزین‌شده». Not for listing prices (PriceDisplay) or payment summaries (OrderSummary).

## Anatomy

Card (`bg-surface`, `border-default`, `radius-xl`, 16px) → head: label with `tag` icon («پیشنهاد قیمت از خریدار» / «پیشنهاد شما») + StatusBadge (sender and end states) → amount (24/36 800 + «تومان») → comparison «قیمت آگهی: ۴۵٬۰۰۰٬۰۰۰ تومان» or the outcome sentence → reply deadline («مهلت پاسخ: ۱۱ مهر ۱۴۰۵، ۱۰:۱۵») → ActionOwner → actions.

## CSS API

| Class | Use |
|---|---|
| `.hz-offer` | Card |
| `__head` · `__label` | Label + badge, wraps when the badge is long |
| `__amount` · `__value` · `__unit` | Amount; Persian digits with `٬` |
| `__compare` · `__meta` | Listing price / outcome sentence · deadline line |
| `__actions` | Primary + secondary share the row (min 96px each), ghost stays natural width |
| `--settled` | Amount in `text-secondary` (accepted, declined, expired) |
| `--superseded` | Amount struck through |

## Tokens

`bg-surface` · `border-default` · `text-primary` · `text-secondary` · `icon-default` · StatusBadge `status-{info,success,error,warning,neutral}-*` · ActionOwner `bg-subtle` / `status-warning-bg` · Button tokens.

## Variants & sizes

| Viewer · status | Badge (dictionary key) | ActionOwner | Actions |
|---|---|---|---|
| Receiver · proposed | — (ActionOwner «شما» says it) | «شما» | primary «پذیرش پیشنهاد», secondary «رد پیشنهاد» |
| Sender · proposed | `PROPOSED` «در انتظار پاسخ» | «فروشنده» + deadline | ghost «پس گرفتن پیشنهاد» |
| Accepted | `ACCEPTED` «پذیرفته‌شده» | «فروشنده» — تعیین قرار تحویل | — |
| Declined | `DECLINED` «پذیرفته نشد» (neutral: a normal end of a negotiation, not an error) | — | secondary «پیشنهاد تازه» (buyer) |
| Expired | `EXPIRED` «منقضی» | «شما» | — |
| Older offer | `SUPERSEDED` «جایگزین‌شده» | — | — |
| Withdrawn | `WITHDRAWN` «پس گرفته شد» | — | — |

Width: fills the message column up to 360px; on the inquiry summary it can take the side column.

## States

Default · hover on buttons (pointer only) · focus-visible on buttons · pressed · **loading** (accepting: primary `aria-busy` with spinner «در حال ثبت», the other button disabled) · error (Alert under the amount: «این پیشنهاد پس از باز کردن شما تغییر کرده است. صفحه را دوباره بار کنید.») · disabled (thread closed: actions removed, ActionOwner removed) · **long value** «۴۵۰٬۰۰۰٬۰۰۰ تومان» fits at 272px.

## Mobile ↔ desktop

Same card at every width. <768 the two buttons stay side by side (each ≥96px, 44px tall on touch via Button). Decline asks for confirmation in a BottomSheet (mobile) / Modal (desktop).

## RTL & LTR

Label and badge at start/end of the head; amount reads «۴۱٬۰۰۰٬۰۰۰ تومان» with the unit after the number. Primary action at the start.

## Accessibility

`<article aria-label="پیشنهاد قیمت ۴۱٬۰۰۰٬۰۰۰ تومان از سارا احمدی">`. Status is text in the badge, never colour alone. After accept/decline, move focus to the new status line and announce it politely.

## Data

`marketplace.json › inquiry.offer`: `party` (`BUYER`/`SELLER` → label), `amount.toman` / `displayFa`, `status` (`PROPOSED` and end states), listing `price.displayFa` for comparison, reply deadline from server settings, decision time. Missing amount never shows «۰ تومان».

## Code mapping

★ New `OfferCard`: `amount`, `listingPrice`, `party`, `viewer` (`'sender' | 'receiver'`), `status`, `respondBy`, `decidedAt`, `onAccept`, `onDecline`, `onWithdraw`, `onNewOffer`, `busy`.

## Do / Don't

- Do show the listing price next to the offer so the gap is obvious.
- Do keep exactly one primary action (accept) and only for the receiver.
- Don't write «پیشنهاد فعلی» or other raw code labels; use the dictionary label or none.
- Don't let a superseded offer keep buttons.
