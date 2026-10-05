# P12 — Conversation · گفتگو

## Purpose

The message threads of the marketplace and the mating finder: a buyer and a seller about one listing, or the owners of a male and a female about one pairing. A thread is more than chat. It carries structured messages that move the deal forward:
- a price offer (`OfferCard`)
- a delivery appointment
- the handover code (`DeliveryCodeCard`)
- the mating contract (`ContractCard`)
- system messages («آگهی فروخته شد و این گفتگو بسته شد.»)

The pattern shows who the counterpart is, what the conversation is about, where the deal stands, and whether you can still write.

**Don't use it** for notifications (`NotificationItem`, P05), for operator–user correspondence about a case (the reason and the `Timeline` in P06/P10), or for support tickets as a list. The operator report queue «گزارش پیام‌ها» is P09. Opening a reported thread there shows this pattern **read-only** (no composer) beside the decision.

## Anatomy (top to bottom)

1. **Shell:** `PublicShell` (seller and buyer) or `OpsShell` (read-only moderation).
2. **`PageHeader`:**
   - `h1` «درخواست‌های آگهی»
   - meta: the listing name, `StatusBadge`, price (`PriceDisplay`)
   - «مشاهده آگهی» secondary
3. **Context summary** (seller, K17): a `Card --compact` with the listing thumbnail, price and mode, and the live offer (if any).
4. **`ConversationList`:**
   - head «پیام‌ها» + «۴ گفتگو، ۳ پیام خوانده‌نشده»
   - each row: `Avatar` · name + time · context line «توله ژرمن شپرد، خریدار» · last message (kind icon for offers, images and files) · unread `hz-count--alert`, or a closed-family badge
5. **Thread header:**
   - counterpart avatar + name + role
   - the listing or animal pair
   - `StatusBadge` of the deal
   - `PopoverMenu` «بیشتر» (گزارش، مسدودکردن)
6. **Thread** (`role="log"`):
   - day separators «۷ مهر ۱۴۰۵»
   - `MessageBubble`s in six kinds: text · image · document · price offer → `OfferCard` · delivery appointment · system
   - pinned deal cards where they apply: `DeliveryCodeCard`, `ContractCard`
7. **`MessageComposer`:**
   - attach, a growing textarea (1–5 lines), send
   - buyer meta «پیشنهاد قیمت»
   - accepted types «فقط تصویر و PDF»
   - closed state with the reason

## Layout

| | Mobile (<768) | Tablet (768–1023) | Desktop (≥1024) |
|---|---|---|---|
| Structure | **list and thread are two pages.** The thread opens with a back arrow | list and thread still separate pages (wider) | **two columns** in `container-app`: `ConversationList` 360px at the start + thread |
| Context summary | collapsible strip under the thread header | card above the list | card above the list column, or at the top of the thread for mating requests |
| Thread | full screen between the top bar and the composer; the tab bar is hidden in a thread; bubbles up to 85% wide | bubbles 70%, max 480 | bubbles 70%, max 480; rich cards max 360 |
| Composer | sticky at the bottom, above the safe area; Enter = new line | sticky at the bottom of the thread | pinned at the bottom of the thread column; Enter sends, Shift+Enter = new line |
| Overlays | offer form and «بیشتر» in a `BottomSheet` | `Modal` | `Modal` / `PopoverMenu` |
| Spacing | rows 76px on touch, thread padding `space-16` | same | list rows `space-12`, thread padding `space-24` |

The thread scrolls on its own. The page header and composer stay. A new message keeps the reader's position unless they are already at the end.

## States

- **Loading:**
  - list: 2–3 Skeleton rows (avatar + two lines)
  - thread: alternating bubble skeletons, with images as `PageStates` Skeleton media
  - `aria-busy` on each region
- **Empty:** no conversations shows a compact EmptyState «هنوز گفتگویی ندارید» + «مشاهده بازار». An empty thread shows «هنوز پیامی نیست. اولین پیام را بنویسید.»
- **Error / network:** the list or thread shows NetworkErrorState inside its panel with «بارگذاری دوباره». A failed send keeps the bubble in the thread with an error border and «ارسال نشد. ارسال دوباره» (`role="alert"`); the composer is cleared.
- **Locked / permission:**
  - a closed conversation (listing sold or reserved, request ended, user blocked) shows the system pill + the composer notice «**این گفتگو بسته شده است.** …», all controls disabled, and the placeholder «ارسال پیام ممکن نیست»
  - someone else's thread shows the not-found state
  - an operator viewing a report sees the thread read-only
- **Deal states:**
  - `OfferCard`: live, accepted, declined, expired or superseded; older offers are muted
  - appointment: `StatusBadge` «زمان‌بندی‌شده»
  - handover: `DeliveryCodeCard`; the buyer holds the code and the seller enters it
  - contract: each party's confirmation by `OtpField`
- **Hard cases:**
  - a long message wraps (`overflow-wrap: anywhere`) and never truncates in the thread
  - the last-message preview ellipsises in the list
  - a missing or expired image shows the `RecordImage` placeholder «تصویر ثبت نشده»
  - a long file name truncates while the meta stays visible
  - an offer above the asking price is allowed and shown as is

## Content & data rules

- Money in offers is `PriceDisplay` in تومان. The offer card shows the listing price for comparison. Never ۰.
- Times: today «۰۹:۴۰», yesterday «دیروز», otherwise «۳ مهر» (the year is added when it is not the current year). Appointments show a full Jalali date and time.
- The counterpart's messages sit at the **start**, yours at the **end**, mirrored automatically by `dir`. System messages are centred.
- Your messages show their delivery state: `clock` sending, `check` sent, `checks` read.
- Every image needs Persian alt text (`altFa`). Attachments accept only the server's allowed types; the size limit comes from the server and is never hard-coded.
- Action order in deal cards: the primary at the start («پذیرش پیشنهاد»), «رد» after it.
- The deal's next step is clear from the `ActionOwner` on the context card («اقدام بعدی با: خریدار»).

## Accessibility & keyboard

- Landmarks: `nav`-like list region «گفتگوها» (`aria-label`), and the thread as `role="log"` with `aria-live="polite"`, so new incoming messages are announced once.
- Focus order: list rows → thread header → thread (links and buttons inside cards) → composer. Opening a conversation moves focus to the thread header.
- List rows are links with full names («گفتگو با سارا احمدی، ۲ پیام خوانده‌نشده»). The current row has `aria-current="true"`.
- The composer textarea is labelled «پیام». Send is an `IconButton` «ارسال پیام» and is disabled while the field is empty. The attach button names the accepted types.
- Offer accept or decline asks for confirmation in a `BottomSheet` or `Modal`, and the result is announced through `Toast`.

## Pages that use it (about 6)

`/account/listings/[id]/requests` (seller) · `/account/purchases/[id]` (buyer thread beside the purchase) · `/account/mating-finder/requests/[id]` · `/animals-market/[id]` → «پیام به فروشنده» (starts a thread) · `/market/messages` and `/market/support` (operator, read-only thread inside the report or support view)

**Key screen:** **K17** گفتگوی آگهی (`/account/listings/[id]/requests`).

## Do / Don't

- **Do** keep the listing or animal context visible in the list and the thread header.
- **Do** render offers, appointments, handover codes and contracts as cards, not plain text.
- **Do** close the composer with a reason when the deal ends.
- **Don't** put the list and the thread side by side below 1024.
- **Don't** hide failed messages. Keep them with «ارسال دوباره».
- **Don't** let operators write into a user's thread from the moderation view.
