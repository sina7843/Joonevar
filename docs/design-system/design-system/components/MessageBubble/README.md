# MessageBubble

One message in a thread, in the six kinds of `inquiryMessageKind`: text · image · document · price offer · delivery appointment · system message.

Use inside the thread of P12 «گفتگو» (market inquiries and mating-finder requests). The counterpart's messages sit at the **start**, yours at the **end**; system messages are centred. Not for notifications, comments or operator notes (Timeline).

## Anatomy

Thread (`role="log"`) → day separator «۷ مهر ۱۴۰۵» → message column: bubble (text / caption / file) + meta (time, and for your messages the delivery state: `check` = sent, `checks` = read, `clock` = sending) → failed line «ارسال نشد. ارسال دوباره». Rich kinds (price offer → OfferCard, delivery appointment → `.hz-appt`) replace the bubble with a card; the meta line sits under it.

## CSS API

| Class | Use |
|---|---|
| `.hz-thread` · `__day` | Column with 8px gap; day separator with hairlines |
| `.hz-msg` · `--mine` · `--cont` | Message column (start-aligned) · yours (end-aligned) · follow-up from the same sender (no sharp corner) |
| `.hz-msg__bubble` | `radius-lg`, `radius-xs` on the sender's top corner; theirs `bg-surface`, yours `bg-brand-subtle`; max 85% (70% ≥768), 480px |
| `__text` · `__meta` · `__sender` | Body 15/26 · 11/18 meta · optional name above a group |
| `__bubble--media` · `__caption` | Image kind: 248px, RecordImage inside |
| `__file` · `__file-icon` · `__file-body` · `__file-name` · `__file-meta` | Document kind |
| `__card` + `.hz-offer` / `.hz-appt` (`__head` `__title` `__list` `__item`) | Price offer / delivery appointment |
| `.hz-msg--system` + `__system` | Centred pill on `bg-subtle` |
| `--sending` · `--failed` + `__failed` + `__retry` | Delivery states |

```html
<div class="hz-msg hz-msg--mine">
  <div class="hz-msg__bubble">
    <p class="hz-msg__text">بله، پنجشنبه عصر هماهنگ کنیم.</p>
    <div class="hz-msg__meta"><time datetime="2026-09-29T20:05:00+03:30">۲۰:۰۵</time><svg class="hz-icon hz-icon--xs">…checks…</svg><span class="hz-visually-hidden">خوانده شد</span></div>
  </div>
</div>
```

## Tokens

`bg-surface` · `bg-brand-subtle` (yours) · `border-default` · `border-subtle` · `bg-subtle` (system, file icon) · `text-primary` · `text-secondary` · `icon-default` · `status-info-*` (appointment badge «زمان‌بندی‌شده») · `status-error-border` / `status-error-text` (failed) · `text-brand` (retry) · radii `radius-lg`, `radius-xs`, `radius-xl` (cards), `radius-full` (system pill).

## Variants & sizes

Six kinds × two sides (theirs/mine) + system. Image: one image per message, 4:3, alt text required (`altFa`); missing/expired image shows the RecordImage empty state «تصویر ثبت نشده». Document: icon by type (`file-pdf`, `file-text`), name truncates, meta «PDF، ۲۴۰ کیلوبایت», download icon button. Appointment: date + time and place, badge `SCHEDULED` «زمان‌بندی‌شده». System: one sentence with the key word in bold, e.g. «**کد تحویل** برای خریدار صادر شد؛ هنگام تحویل آن را از خریدار بگیرید.»

## States

Default · sending (bubble at 72% opacity, «در حال ارسال» + `clock`) · sent (`check`) · read (`checks`) · failed (error border + `role="alert"` line with «ارسال دوباره») · image loading (Skeleton media) · focus-visible on links/buttons inside · thread empty («هنوز پیامی نیست. اولین پیام را بنویسید.») · closed thread (system pill «آگهی فروخته شد و این گفتگو بسته شد.» + MessageComposer closed) · **long Persian text** wraps with `overflow-wrap: anywhere`, never truncates.

## Mobile ↔ desktop

<768: bubbles up to 85% of the thread width, thread full-screen between the app bar and the composer. ≥768: 70%, capped at 480px. Rich cards cap at 360px. Touch targets (retry, download) grow to 44px on coarse pointers.

## RTL & LTR

Theirs = `align-items: flex-start`, mine = `flex-end`, so sides swap automatically in LTR. The sharp corner uses `border-start-start-radius` / `border-start-end-radius`. Times use Persian digits; identifiers inside text stay `<bdi dir="ltr">`. Check marks and clocks are never mirrored.

## Accessibility

Thread is `role="log"` (implicitly polite) with an `aria-label` naming the counterpart and listing; day separators `role="separator"`. Delivery state is spoken via visually hidden text, not the icon. Failed messages use `role="alert"`. Image `alt` comes from the sender's caption or `altFa`; document download buttons have `aria-label` «دریافت …». New incoming messages must not steal focus.

## Data

`inquiry.messages[]`: `fromFa`/sender id → side, `textFa`, `at` (`displayFa` time; day from date), kind, attachment (`slot`, `altFa`, file name, size, mime), offer (`amount.displayFa`, `status`, `party`), appointment (date, time, place), read receipt. System texts come from the server event, not hand-written labels.

## Code mapping

★ New `MessageBubble`: `kind: 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'OFFER' | 'APPOINTMENT' | 'SYSTEM'` (= `inquiryMessageKind`), `mine`, `continued`, `text`, `at`, `delivery: 'sending' | 'sent' | 'read' | 'failed'`, `onRetry`, `attachment`, `offer` (renders OfferCard), `appointment`. ★ `MessageThread` wraps them with day separators.

## Do / Don't

- Do put the counterpart at the start and the user at the end — never alternate by time.
- Do keep money and status in cards (OfferCard, appointment), not inside free text.
- Don't use colour alone for read state; the glyph and hidden text carry it.
- Don't truncate a long message or collapse it behind «بیشتر»; the thread is the record.
