# BottomSheet

A panel that rises from the bottom edge over a scrim — the default overlay on phones, replacing `Modal` below 768px.

Use it for short choices and confirmations on mobile: the decision on a mobile decision desk (P10), sort options, «کنش‌های بیشتر», a destructive confirm with reason. Don't use it for long forms (navigate to a page), for full filter sets (full-screen `Drawer`), or on tablet/desktop (use `Modal`).

## Anatomy

1. Scrim (`.hz-scrim`)
2. Sheet: `bg-surface`, top corners `radius-2xl`, `shadow-overlay-lg`, max 88% of the viewport height
3. Handle (40×4) — visual cue for drag-to-dismiss
4. Head: title + optional sub-line («علی رضایی، نسخه ۳ پرونده») + close `IconButton` at the inline end
5. Body — options list (`.hz-option` radios or menu rows), fields; scrolls
6. Foot — stacked full-width buttons, **primary first**, plus the safe-area inset

## CSS API

| Class | Role |
|---|---|
| `.hz-sheet` | the panel, pinned to the bottom |
| `.hz-sheet__handle` | grab handle |
| `.hz-sheet__head` · `__title` · `__sub` · `__body` · `__foot` ★ | parts — *css-additions/BottomSheet.css* |

```html
<div class="hz-scrim"></div>
<div class="hz-sheet" role="dialog" aria-modal="true" aria-labelledby="s">
  <div class="hz-sheet__handle" aria-hidden="true"></div>
  <div class="hz-sheet__head"><h2 class="hz-sheet__title" id="s">ثبت تصمیم<span class="hz-sheet__sub">علی رضایی، نسخه ۳ پرونده</span></h2><button class="hz-icon-btn" aria-label="بستن">…x…</button></div>
  <div class="hz-sheet__body"><fieldset>…three .hz-option radios…</fieldset> …reason field… </div>
  <div class="hz-sheet__foot"><button class="hz-btn hz-btn--primary hz-btn--block">ثبت تصمیم: نیازمند اصلاح</button><button class="hz-btn hz-btn--secondary hz-btn--block">انصراف</button></div>
</div>
```

## Tokens

`bg-surface`, `radius-2xl` (top corners only), `shadow-overlay-lg`, `border-default` (handle), `border-subtle` (foot divider), `z-overlay`, `z-modal`, `duration-slow` + `ease-enter`/`ease-exit`.

## Variants & sizes

- **Decision sheet** (preview): «تأیید» · «نیازمند اصلاح» · «رد», each with its consequence; reason with ready presets («تصویر خوانا نیست», «تاریخ تولد مطابقت ندارد», «مدرک ناقص است»), mandatory for correction and reject; 500-character counter.
- **Option list:** sort order or «کنش‌های بیشتر» as 44px rows; selecting closes the sheet — no foot.
- **Confirm:** lead sentence + two stacked buttons (mobile twin of the Modal confirm).
- Height follows content up to 88%; the body scrolls beyond that.

## States

- Open/closed: slides up/down (`duration-slow`), none with reduced motion.
- Selected option: `.hz-option` with `border-brand` + `bg-brand-subtle`; focus-visible ring around the option.
- Field error / submitting / stale decision: same as `Modal` (error under the field, primary `aria-busy`, error `Alert` in the body).
- **Long text:** option descriptions wrap; the pre-filled reason (two lines) and counter sit inside the scrolling body, foot stays pinned.

## Mobile ↔ desktop

<768: default overlay, full width, 44px targets. 768–1023 and ≥1024: render the same content in `Modal` (one `Overlay` component switches by width). The ops decision desk on desktop shows the decision in its fixed side column instead.

## RTL & LTR

Title at start, close at end (left in RTL). Radios sit at the inline start of each option. Foot is stacked, so order is top-to-bottom: primary, then secondary. Logical corners (`border-start-start-radius`, `border-start-end-radius`).

## Accessibility

- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` → title; options in a `<fieldset>` with a (visually hidden) legend «نتیجه بررسی».
- Focus moves to the selected option (or the first) on open; Tab trapped; Escape, close button, scrim tap and swipe-down close; focus returns to the trigger.
- Drag-to-dismiss is never the only way to close — the `x` button is always there.
- Preset reason chips are toggle buttons (`aria-pressed`) that insert text; the textarea stays editable.

## Data

Options and consequences from the decision form in code (21 decision forms share this shape); case name and version from the case; reason presets from the decision form's preset list; character limit from settings.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/overlay.tsx`: `BottomSheet(props: OverlayProps)` — `{ open, onClose, title, children, footer? }`, shared with Modal and Drawer. Keep; actions go in `footer`.


`src/ui/overlay.tsx` — `BottomSheet`. Proposed: `open`, `onClose`, `title`, `subtitle?`, `children`, `primaryAction?`, `secondaryAction?`, `dismissOnSelect?: boolean`. A shared `Overlay` picks `BottomSheet` <768 and `Modal` ≥768.

## Do / Don't

- Do keep the primary action first and full-width in the foot.
- Do keep the sheet short; if it needs scrolling beyond one screen, it should be a page.
- Don't put navigation in a bottom sheet (use the start-side `Drawer`).
- Don't rely on the handle alone — always show a close button.
