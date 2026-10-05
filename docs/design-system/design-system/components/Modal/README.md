# Modal

A centred dialog over a scrim for a short, focused task or a confirmation — the default overlay on tablet and desktop.

Use it to confirm a destructive or irreversible action with a reason (reject a case, revoke a permit, delete a listing), or for a short form that must not lose page context. On phones (<768) the same content opens as a `BottomSheet`. Don't use it for long forms (use a page or the multi-step form), for filters/details (use `Drawer`), or for information that should stay visible (use `Alert`).

## Anatomy

1. Scrim (`.hz-scrim`) covering the page, `z-overlay`
2. Positioning layer (`.hz-modal-layer` ★) — centres the dialog, `z-modal`
3. Dialog `radius-xl`, `bg-surface`, `shadow-overlay-lg`, max 560px wide
4. Head: title (18/30 Bold) + close `IconButton` (`x`, «بستن») at the inline end
5. Body: lead sentence (consequence), fields, small print (version note) — scrolls if tall
6. Foot `ActionRow`: **primary at start**, secondary at end, divided by `border-subtle`

## CSS API

| Class | Role |
|---|---|
| `.hz-scrim` | backdrop |
| `.hz-modal-layer` ★ | *css-additions/Modal.css* — fixed full-screen grid that centres `.hz-modal` (no background) |
| `.hz-modal` | dialog box |
| `.hz-modal__head` · `__title` · `__body` · `__foot` | parts |
| `.hz-modal__lead` ★ | consequence sentence in `text-secondary` |

```html
<div class="hz-scrim"></div>
<div class="hz-modal-layer">
  <div class="hz-modal" role="dialog" aria-modal="true" aria-labelledby="t" aria-describedby="d">
    <div class="hz-modal__head"><h2 class="hz-modal__title" id="t">رد پرونده</h2><button class="hz-icon-btn" aria-label="بستن">…x…</button></div>
    <div class="hz-modal__body"><p class="hz-modal__lead" id="d">درخواست احراز هویت علی رضایی بسته می‌شود…</p> …field… </div>
    <div class="hz-modal__foot"><button class="hz-btn hz-btn--destructive">رد پرونده</button><button class="hz-btn hz-btn--secondary">انصراف</button></div>
  </div>
</div>
```

## Tokens

`bg-surface`, `shadow-overlay-lg`, `radius-xl`, `border-subtle`, `z-overlay`, `z-modal`, `text-secondary`, `action-destructive`, `focus-ring`. Scrim colour is defined in bundle.css (ink at 48%).

## Variants & sizes

- **Confirm destructive with reason** (preview): «رد پرونده», mandatory «دلیل رد» (500 characters, shown to the user), destructive primary. Reasons are mandatory for «نیازمند اصلاح» and «رد», per the decision-desk rule.
- **Confirm simple:** lead sentence + two buttons, no field.
- **Form modal:** up to ~4 fields; anything longer becomes a page.
- Width: 560px max (`min(560px, 100% - 32px)`); height: max viewport − 48px, body scrolls.

## States

- **Open / closed** (enter `duration-base` with `ease-enter`, scale+fade; exit `ease-exit`; none with reduced motion).
- **Field error:** submit with an empty reason → `aria-invalid` + «دلیل رد را بنویسید؛ بدون دلیل، پرونده رد نمی‌شود.»; focus moves to the field. The primary is never pre-disabled.
- **Submitting:** primary `aria-busy` + spinner «در حال ثبت»; cancel disabled; Escape ignored until done.
- **Stale decision:** the server rejects a changed case → error `Alert` in the body with «بارگذاری دوباره».
- Close button hover (pointer) and focus-visible ring as `IconButton`.
- **Long text:** lead and reason wrap; the body scrolls, head and foot stay.

## Mobile ↔ desktop

<768: do not use — render the same content in `BottomSheet`. 768–1023: Modal, width `100% − 32px` up to 560. ≥1024: Modal 560px centred. Buttons 44px.

## RTL & LTR

Head: title at start, close at end (left in RTL). Foot: primary at start (right), secondary at end. All padding logical. `x` is not mirrored.

## Accessibility

- `role="dialog"` (or `alertdialog` for the simple destructive confirm), `aria-modal="true"`, `aria-labelledby` → title, `aria-describedby` → lead.
- **Focus:** on open, focus the first field (or the least destructive button for a simple confirm); **Tab is trapped** in the dialog; **Escape** closes; on close, focus **returns** to the trigger. The page behind gets `inert`.
- Scrim click closes only when there is no unsaved input; otherwise ignore it.
- Required field: visible `*` plus `required`/`aria-required`.

## Data

Title/lead/labels from the decision form in code; the case name, version («نسخه ۳») and character limit (500) from the case/settings. The decision is posted with the case version so stale decisions fail.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/overlay.tsx`: `Modal(props: OverlayProps)` — `{ open, onClose, title, children, footer? }`. Keep; add `description?`; primary and secondary actions go in `footer` (start = primary).


`src/ui/overlay.tsx` — `Modal`. Proposed: `open`, `onClose`, `title`, `description?`, `children`, `primaryAction`, `secondaryAction?`, `tone?: 'default' | 'destructive'`, `initialFocusRef?`. Responsive switch to `BottomSheet` <768 lives in one `Overlay` wrapper. Sensitive-action confirm (VET-009) uses this component.

## Do / Don't

- Do state the consequence in the lead sentence; do name the action on the button («رد پرونده», not «تأیید»).
- Do keep one primary — destructive tone for destructive actions.
- Don't stack modals; don't open a modal from a modal.
- Don't put the cancel button first; start = primary.
