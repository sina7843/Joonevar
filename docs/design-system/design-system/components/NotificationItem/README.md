# NotificationItem

One system notification — title, body, time and read state — as a full-width row that links to what it is about.

Use in the `/notifications` page (full body) and in the bell panel of PublicShell/OpsShell from 768 up (body clamped to two lines). Not for transient confirmations (`Toast`), not for page-level warnings (`Alert`), and not for chat messages (Messaging).

## Anatomy

1. Unread dot — 10px `logo-mark` circle at the start; read items keep the empty column so text stays aligned.
2. Title — 15/24; **Bold when unread**, Medium when read. Prefixed for screen readers with a hidden «خوانده‌نشده:».
3. Body — 14/24 `text-secondary`; full on the page, 2 lines in the panel.
4. Time — `<time>` 12/20 `text-secondary`, «۸ مهر ۱۴۰۵، ۱۰:۰۰».
5. Divider — `border-subtle` between items.

**Bell panel** (`.hz-notification-panel`, 380px): head «اعلان‌ها» + unread `Count` + ghost «خواندن همه» (`checks`); list (max 420px, scrolls); foot «همه اعلان‌ها ←».

## CSS API

New in `css-additions/NotificationItem.css`: `.hz-notifications` (`--compact`), `.hz-notification` (`--unread`), `__dot`, `__body`, `__title`, `__text`, `__time`; `.hz-notification-panel`, `__head`, `__title`, `__list`, `__foot`. Composes `.hz-card--flush` (page), `.hz-count--alert`, `.hz-btn--ghost.hz-btn--sm`, `.hz-link--standalone`, `.hz-state--compact` (empty).

```html
<ul class="hz-notifications">
  <li><a class="hz-notification hz-notification--unread" href="/animals/animal-1#documents">
    <span class="hz-notification__dot" aria-hidden="true"></span>
    <span class="hz-notification__body">
      <span class="hz-notification__title"><span class="hz-visually-hidden">خوانده‌نشده: </span>برگه ثبتی «رکس» صادر شد</span>
      <span class="hz-notification__text">برگه ثبتی را می‌توانید از پرونده حیوان دریافت کنید.</span>
      <time class="hz-notification__time" datetime="2026-09-30T10:00+03:30">۸ مهر ۱۴۰۵، ۱۰:۰۰</time>
    </span>
  </a></li>
</ul>
```

## Tokens

`bg-surface`, `border-default`, `border-subtle`, `bg-subtle` (hover), `logo-mark` (unread dot, 3.29:1 on white), `text-primary`, `text-secondary`, `text-brand`, `action-primary` + `text-on-action` (count), `shadow-overlay-sm` (panel only), `radius-xl`, `focus-ring`.

## Variants & sizes

- **Unread** / **read**.
- **List density:** page (full body, padding 14/16) · `--compact` panel (2-line body, padding 12/16).
- No per-type icon: notifications carry no type field in the data.

## States

- **Default** · **hover** (pointer): row `bg-subtle`.
- **Focus-visible:** ring drawn inside the row (`outline-offset: -2px`) so it is not clipped by the card.
- **Active:** opening an item marks it read (server), then navigates.
- **Loading:** three skeleton rows (title + two lines).
- **Empty:** `EmptyState` compact — `bell`, «اعلان تازه‌ای ندارید», «صدور سند، پرداخت و تغییر وضعیت درخواست‌ها اینجا می‌آید.»
- **Error:** inline `Alert` in the panel «اعلان‌ها بار نشد.» + «تلاش دوباره».
- **Long Persian text:** the edge-case body (three sentences) wraps fully on the page and clamps to two lines in the panel; the title wraps (`overflow-wrap: anywhere`).

## Mobile ↔ desktop

<768 the bell opens the `/notifications` page (no popover); rows are full width with ≥ 64px height. 768–1023 and ≥1024: the bell opens the panel under it (aligned to the inline end), PopoverMenu behaviour (Esc closes, focus returns to the bell). Page list sits in a flush card in the content column.

## RTL & LTR

Dot at the inline start (right in RTL). Times are Persian digits; the panel foot uses `arrow-right` + `hz-icon--mirror`. `checks` and `bell` are not mirrored.

## Accessibility

- The list is a `<ul>`; each item is a single link whose name is title + body + time.
- Unread is conveyed by the hidden prefix «خوانده‌نشده:» plus bold weight and dot — never the dot alone.
- Bell button: `aria-label="اعلان‌ها، ۳ خوانده‌نشده"`, `aria-expanded`, `aria-controls` the panel (`role="region"`, `aria-label="اعلان‌ها"`). New arrivals update the count through a polite live region, not by moving focus.
- «خواندن همه» is a button; after it, the count disappears and a `Toast` confirms.

## Data

`notifications.json[]`: `titleFa`, `bodyFa`, `createdAt.displayFa` (+ `iso` for `datetime`), `read`. Target URL is not in the sample data — the code's notification payload decides it. Edge: `edge-cases.json → notifications[0]` (long body, unread; shown with the time of the related KYC notification).

## Code mapping

★ New — proposed `NotificationItem` in `src/notifications/item.tsx`: `title`, `body`, `createdAt: Date`, `read: boolean`, `href`, `compact?: boolean`; `NotificationPanel` (`items`, `unreadCount`, `onMarkAllRead`, `loading?`, `error?`).

## Do / Don't

- Do keep the title a complete sentence that names the record («برگه ثبتی «رکس» صادر شد»).
- Do let the whole row be the link; no separate «مشاهده» button.
- Don't use orange backgrounds for unread rows — the dot and the weight are enough.
- Don't show relative times only («۲ ساعت پیش») — the code formats an absolute Jalali date and time.
