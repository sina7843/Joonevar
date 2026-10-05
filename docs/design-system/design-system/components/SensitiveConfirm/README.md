# SensitiveConfirm

The confirm dialog for an irreversible operator action (revoke a pedigree or mating permit, merge records): it lists the consequences, takes a mandatory reason, and asks for a typed identifier or an explicit checkbox before the destructive button unlocks.

Use it only when the action cannot be undone. For reversible actions (hide, suspend, archive) use a plain Modal with ReasonField; for case decisions use DecisionDesk. Never use it as a generic "Are you sure?".

## Anatomy

1. **Head**: error-tone mark (warning icon in a 36px `status-error-bg` circle) + title naming the action and object «ابطال شجره‌نامه رکس» + close.
2. **Consequences**: lead «این کار برگشت‌ناپذیر است.» (or one sentence naming the record) + 2–3 bullets: what changes publicly, who is notified, what the user must do next.
3. **Reason**: ReasonField, compact (audience «به مالک نمایش داده می‌شود»).
4. **Gate**, one of:
   - **Type-to-confirm**: «برای تأیید، شناسه سند را بنویسید: `PD-P52ZXV92`» + LTR input; case-insensitive match.
   - **Checkbox**: bordered `.hz-check` with a full sentence of what the operator accepts; turns error-subtle when checked.
5. **Foot**: destructive primary at the start («ابطال شجره‌نامه», disabled until reason + gate), «انصراف» secondary at the end.

## CSS API

Bundle: `.hz-scrim` `.hz-modal-layer` `.hz-modal` `__head` `__title` `__body` `__lead` `__foot`, `.hz-sheet` (mobile), `.hz-field`, `.hz-input--ltr`, `.hz-check`, `.hz-btn--destructive`, `.hz-spinner`.
Additions (`tools/css-additions/SensitiveConfirm.css`): `.hz-confirm` (body stack) `__title` `__mark` `__list` `__code` `__match`, bordered checkbox inside `.hz-confirm`. Uses `.hz-reason__audience` from ReasonField.

```html
<div class="hz-modal" role="alertdialog" aria-modal="true" aria-labelledby="t" aria-describedby="d">
  <div class="hz-modal__head"><h2 class="hz-modal__title hz-confirm__title" id="t"><span class="hz-confirm__mark">…warning…</span>ابطال شجره‌نامه رکس</h2>…close…</div>
  <div class="hz-modal__body hz-confirm">
    <div id="d"><p class="hz-modal__lead">این کار برگشت‌ناپذیر است.</p><ul class="hz-confirm__list">…</ul></div>
    …ReasonField…
    <div class="hz-field"><label class="hz-field__label" for="c">برای تأیید، شناسه سند را بنویسید: <span class="hz-confirm__code"><bdi class="hz-id" dir="ltr">PD-P52ZXV92</bdi></span></label>
      <input class="hz-input hz-input--ltr" id="c" autocomplete="off" spellcheck="false"></div>
  </div>
  <div class="hz-modal__foot"><button class="hz-btn hz-btn--destructive" disabled>ابطال شجره‌نامه</button><button class="hz-btn hz-btn--secondary">انصراف</button></div>
</div>
```

## Tokens

`overlay-scrim` `bg-surface` `shadow-overlay-lg` `radius-xl` `status-error-bg` `status-error-text` `status-error-border` (mark, checked gate, mismatch) `status-success-text` (match) `action-destructive` `bg-disabled` `text-disabled` `bg-subtle` (code chip) `border-default` `focus-ring`.

## Variants & sizes

- **Type-to-confirm**: for actions that destroy or invalidate a record known by an identifier (`PD-`, `MP-`, `RS-`, merges). Default for anything a third party can verify publicly.
- **Checkbox**: for irreversible actions with a narrower effect, or when the object has no short identifier.
- Modal width 560 (desktop/tablet); BottomSheet on mobile.

## States

- **Default**: destructive button disabled; focus starts in the reason field (or the gate if the reason is prefilled by a draft).
- **Mismatch**: on blur or submit, `aria-invalid` + «شناسه با سند این صفحه یکی نیست.»
- **Match**: secondary line «شناسه درست است» with check; button enabled.
- **Hover** (pointer): destructive button gets the `status-error-bg` halo.
- **Focus-visible**: ring on input, checkbox and buttons.
- **Submitting**: «در حال ابطال» + spinner, `aria-busy`; close, Escape and «انصراف» are locked.
- **Error / stale**: server rejects (version changed) → `role="alert"` inside the body; the dialog stays open with the reason kept.
- **Long Persian text**: the checkbox sentence wraps freely; titles wrap; the code chip never breaks.

## Mobile ↔ desktop

- **<768**: BottomSheet (max 88% height), body scrolls, foot sticky with both buttons stacked full width (destructive first).
- **768–1023** and **≥1024**: centred Modal.
- Touch: checkbox row ≥ 44px; the input is `control-lg`.

## RTL & LTR

Destructive action at the start, «انصراف» at the end. Identifiers in `<bdi dir="ltr">`; the confirm input is `dir="ltr"`. `warning`, `x`, `check`, `eye` are not mirrored.

## Accessibility

- `role="alertdialog"`, `aria-modal`, labelled by the title, described by the consequences block.
- Focus trap; Escape = cancel (except while submitting); focus returns to the trigger.
- The disabled reason is explained: the button has `aria-describedby` pointing at the gate's hint.
- The typed match is announced via the success line, not colour.

## Data

Needs: action key, object label, identifier to type (or none → checkbox), consequence lines (per action, from config), `reasonRequired`, `expectedVersion`. Sends `{ action, targetId, reasonFa, internalNoteFa?, expectedVersion }`; the result is written to `/admin/audit`.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** There is **no** confirm component in `src/ui/overlay.tsx` (it has only `Modal`, `Drawer`, `BottomSheet`). SensitiveConfirm is ★ new, composed from `Modal`.


Existing confirm in `src/ui/overlay.tsx` (ticket VET-009) — keep its current props as in code. Proposed additions: `tone: 'destructive'`, `consequences: string[]`, `confirmText?: string` (type-to-confirm), `acknowledgeLabel?: string` (checkbox), `reason?: { required: boolean, audienceFa, drafts? }`, `busy`, `error`.

## Do / Don't

- Do name the object and say exactly what happens and who is told.
- Do keep the destructive button disabled until both the reason and the gate are satisfied.
- Do use type-to-confirm for public documents with an identifier.
- Don't use it for reversible actions; it trains operators to click through.
- Don't put the safe action in the primary position or make «انصراف» destructive-looking.
