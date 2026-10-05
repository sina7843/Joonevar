# ConversationList

The list of message threads (P12 «گفتگو»): one row per counterpart with avatar, listing context, last message, time and unread count.

Use it in `/market/messages`, `/account/listings/[id]/requests` (seller, K17) and `/account/mating-finder/requests/[id]`. On mobile the list and the thread are two pages; from 1024 they sit side by side (list 360px + thread). Not for notifications (NotificationItem) or for operator message reports (DataTable).

## Anatomy

Panel (`bg-surface`, `border-default`, `radius-xl`) → head on `bg-chrome`: title «پیام‌ها» + count «۴ گفتگو، ۳ پیام خوانده‌نشده» → rows: Avatar (40, initials) · name + time · context line «توله ژرمن شپرد، خریدار» · last message (with a kind icon for non-text: `tag` for a price offer, `image`, `file-pdf`, `lock-simple` when closed) + unread count (`hz-count--alert`) or a closed-family StatusBadge.

## CSS API

| Class | Use |
|---|---|
| `.hz-convos` · `__head` · `__title` · `__list` | Panel, chrome head, `<ul>` |
| `.hz-convo` | Row link, min-height 72 (76 on coarse pointers) |
| `.hz-convo[aria-current="true"]` | Open thread: `bg-brand-subtle` + 3px `border-brand` bar at the start |
| `.hz-convo--unread` | Name 800, last message `text-primary` 600, time `text-brand` |
| `.hz-convo--closed` | Name and last message in `text-secondary` |
| `__body` `__top` `__name` `__time` `__context` `__bottom` `__last` | Row parts; name, context and last message truncate to one line |

```html
<a class="hz-convo hz-convo--unread" href="/market/messages/…">
  <span class="hz-avatar" aria-hidden="true">ع</span>
  <span class="hz-convo__body">
    <span class="hz-convo__top"><span class="hz-convo__name">علی رضایی</span><time class="hz-convo__time" datetime="…">۰۹:۴۰</time></span>
    <span class="hz-convo__context">توله ژرمن شپرد، خریدار</span>
    <span class="hz-convo__bottom"><span class="hz-convo__last"><span>واکسن‌های توله کامل است؟</span></span><span class="hz-count hz-count--alert" aria-label="۲ پیام خوانده‌نشده">۲</span></span>
  </span>
</a>
```

## Tokens

`bg-surface` · `bg-chrome` (head) · `border-default` · `border-subtle` (row rules) · `bg-subtle` (hover) · `bg-brand-subtle` + `border-brand` (current) · `text-primary` · `text-secondary` · `text-brand` (unread time) · `action-primary` / `text-on-action` (unread count) · `icon-default`.

## Variants & sizes

One density. Rows: read · unread · current · closed (`CLOSED` «بسته‌شده»; when the listing sold or was reserved, `SOLD` «فروخته‌شده» / `RESERVED` «رزروشده» instead). Context line names the listing (market) or the animal pair (mating finder) and the counterpart's role (خریدار / فروشنده / صاحب نر / صاحب ماده).

## States

Default · hover (pointer only, `bg-subtle`) · focus-visible (2px `focus-ring`, offset −2px so it stays inside the panel) · current · unread · closed · **loading** (2–3 skeleton rows, `aria-busy`) · **empty** (`hz-state--compact`: «هنوز گفتگویی ندارید» + one secondary action «مشاهده بازار») · error (PageStates error inside the panel, «بارگذاری دوباره») · **long Persian text** (last message from edge cases truncates with an ellipsis; the full text is in the thread).

## Mobile ↔ desktop

<768: full-width page, rows 76px on touch, thread opens as its own page with a back arrow. 768–1023: same list, wider. ≥1024: fixed 360px column inside the PublicShell content area, thread beside it; the current row stays highlighted. Time format: today `۰۹:۴۰`, yesterday «دیروز», otherwise «۳ مهر» (year added when not the current year).

## RTL & LTR

Avatar at the start, time at the end of the first line; the current-row bar sits at the start edge (`inset-inline-start`). Identifiers in a last message stay in `<bdi dir="ltr">`. Nothing is mirrored except directional icons.

## Accessibility

`<nav aria-label="گفتگوها">` with a list of links; the open thread has `aria-current="true"`. Unread count carries an `aria-label` («۲ پیام خوانده‌نشده»); the avatar is decorative (`aria-hidden`), the name is the link text. When new messages arrive, update a polite live region in the page head («۱ پیام تازه از علی رضایی»), not every row.

## Data

Per thread: counterpart `displayName` (or kennel/store name), listing `animalName` (from `marketplace.json` listings) or mating pair, last message text/kind (`inquiryMessageKind`), last `at` (Jalali, Tehran time), unread count, inquiry status and listing status (closed when the listing is `SOLD`/`RESERVED`/`EXPIRED` or the inquiry ended). Missing name → «بدون نام»; no avatar image → initials (Avatar).

## Code mapping

★ New `ConversationList`: `threads: { id, counterpartName, counterpartRole, contextLabel, lastMessage: { kind, text, at }, unreadCount, closed, closedStatus }[]`, `currentId`, `loading`, `error`, `onRetry`, `emptyAction`.

## Do / Don't

- Do show the listing context on every row; one buyer can write about several listings.
- Do keep the unread count numeric with Persian digits and a label.
- Don't colour the whole row orange for unread — weight and the count carry it.
- Don't hide closed threads; they are the user's record of the conversation.
