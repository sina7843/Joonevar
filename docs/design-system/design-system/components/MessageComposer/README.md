# MessageComposer

The bar under a thread for writing a message: attach, a growing textarea and a send button with the mirrored paper plane; it locks with a reason when the conversation is closed.

Use at the bottom of every P12 thread (market inquiry, mating-finder request). Buyers also get «پیشنهاد قیمت» here, which opens the offer form (BottomSheet on mobile, Modal on desktop). Not for long forms, comments or operator notes (TextAreaField).

## Anatomy

Chrome bar (`bg-chrome`, `border-default` top edge) → optional attachment chips (name, size, remove) → row: attach IconButton (`paperclip`) · textarea (1 line, grows to 5, then scrolls) · send button (`action-primary`, `paper-plane-right` + `hz-icon--mirror`) → optional meta row: ghost «پیشنهاد قیمت» (buyer only) at the start, accepted types «فقط تصویر و PDF» at the end. Closed: a notice «**این گفتگو بسته شده است.** …» above a disabled row.

## CSS API

| Class | Use |
|---|---|
| `.hz-composer` | Chrome bar, column, 12/16 padding (14/20 ≥1024) |
| `__row` · `__field` · `__input` | Controls row (bottom-aligned) · label wrapper · textarea (`field-sizing: content`, max 140px) |
| `__send` | 40×40 primary square (44 on coarse pointers); `:disabled` = `bg-disabled`; `aria-busy` shows a spinner |
| `__attachments` · `.hz-attach-chip` (`__name` `__size`, `--error`) | Pending attachments |
| `__meta` | Offer action + hint |
| `__closed` | Lock notice when the thread is closed |

```html
<form class="hz-composer" aria-label="نوشتن پیام">
  <div class="hz-composer__row">
    <button class="hz-icon-btn" type="button" aria-label="پیوست تصویر یا سند">…paperclip…</button>
    <label class="hz-composer__field"><span class="hz-visually-hidden">پیام</span><textarea class="hz-composer__input" rows="1" placeholder="پیام خود را بنویسید"></textarea></label>
    <button class="hz-composer__send" type="submit" aria-label="ارسال پیام" disabled><svg class="hz-icon hz-icon--md hz-icon--mirror">…paper-plane-right…</svg></button>
  </div>
</form>
```

## Tokens

`bg-chrome` · `border-default` · `bg-surface` · `border-control` (input) · `focus-ring` as a single 2px border (no outer ring) (focus) · `action-primary` / `action-primary-hover` / `text-on-action` (send) · `bg-disabled` · `border-disabled` · `text-disabled` · `icon-default` · `bg-subtle` (closed notice) · `status-error-bg` / `status-error-border` (bad attachment) · `text-secondary`.

## Variants & sizes

Seller · buyer (adds «پیشنهاد قیمت») · mating finder (no offer; attachments for documents). One size.

## States

Empty (send disabled) · typing (send enabled) · focus-visible (field ring, static example in preview) · with attachments · attachment error «این نوع فایل پذیرفته نمی‌شود» (or a size message from the server limit — do not hard-code the number) · sending (field read-only, attach disabled, send `aria-busy` with spinner) · send failed (the message shows in the thread as failed; the composer is cleared) · **closed** (notice + all controls disabled; placeholder «ارسال پیام ممکن نیست») · **long Persian text** (grows to 5 lines, then scrolls inside).

## Mobile ↔ desktop

<768: sticky at the bottom of the thread page above the safe area; Enter inserts a new line, only the button sends. ≥768: Enter sends, Shift+Enter adds a line (pointer: fine only). Touch targets 44px on coarse pointers.

## RTL & LTR

Attach at the start, send at the end. The send glyph is the LTR `paper-plane-right` with `hz-icon--mirror`, so it points toward the end in RTL and flips back in LTR. Typed identifiers keep their own direction (`dir="auto"` on the textarea in code).

## Accessibility

Form has `aria-label` «نوشتن پیام»; the textarea has a hidden label «پیام». Icon buttons carry Persian `aria-label`s («پیوست تصویر یا سند», «ارسال پیام», «حذف پیوست …»). Busy send sets `aria-busy="true"` and its label becomes «در حال ارسال پیام». The closed notice is plain text before the controls so screen readers hear why they are disabled. Focus stays in the textarea after sending.

## Data

Inquiry status (closed when the inquiry ends or the listing is `SOLD`/`RESERVED`/`EXPIRED`) and the reason sentence; user role in the inquiry (buyer → offer action); allowed attachment types and limits from server settings; draft text kept per thread.

## Code mapping

★ New `MessageComposer`: `value`, `onChange`, `onSend(text, attachments)`, `sending`, `attachments`, `onAttach`, `onRemoveAttachment`, `canOffer` + `onOffer`, `closed` + `closedReason`, `accept` (mime list).

## Do / Don't

- Do disable with a reason; never just grey the bar out.
- Do mirror the paper plane with the class, not by picking another glyph.
- Don't put a second primary button in the bar; «پیشنهاد قیمت» is ghost.
- Don't count characters unless the server sets a limit.
