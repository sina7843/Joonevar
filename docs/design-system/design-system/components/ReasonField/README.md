# ReasonField

The mandatory reason an operator writes for «نیازمند اصلاح», «رد» and «تعلیق»: who will read it, ready-made draft chips, a counter, and an optional internal note that the user never sees.

Use it inside DecisionDesk, SensitiveConfirm, the mobile decision BottomSheet and any settings edit that is versioned with a reason. Don't use it for approvals (reason optional there — use a plain TextField) or for user-facing free text such as messages.

## Anatomy

1. **Label row**: «دلیل اصلاح» / «دلیل رد» / «دلیل تعلیق …» + required mark, and at the inline end the **audience line**: eye icon «به کاربر نمایش داده می‌شود» (or «به مدیران کلاب…», «به هر دو مالک…»).
2. **Draft chips** (`.hz-filterbar` of `.hz-chip`): 2–4 sentences configured per queue and outcome.
3. **Textarea** (required, `maxlength` 500).
4. **Foot**: hint or error at the start, counter «۹۱ از ۵۰۰ نویسه» at the end.
5. **Internal note** (optional): «یادداشت داخلی — اختیاری» with lock «فقط کارکنان انجمن», `bg-subtle` textarea, 1000 characters. Collapsed behind «+ افزودن یادداشت داخلی» until used.

## CSS API

Bundle: `.hz-field` `__label` `__req` `__opt` `__hint` `__error` `__counter` `__label-row`; from TextAreaField: `.hz-field__foot`, `.hz-field__counter--near` / `--over`; `.hz-textarea`, `.hz-filterbar`, `.hz-chip[aria-pressed]`, `.hz-btn--ghost`.
Additions (`tools/css-additions/ReasonField.css`): `.hz-reason` (stack), `.hz-reason__audience` (+ `--public`), `.hz-textarea--internal`, `.hz-reason__add`, disabled chips inside `.hz-reason`.

```html
<div class="hz-reason">
  <div class="hz-field">
    <div class="hz-field__label-row">
      <label class="hz-field__label" for="r">دلیل اصلاح<span class="hz-field__req" aria-hidden="true">*</span></label>
      <span class="hz-reason__audience hz-reason__audience--public" id="r-aud">…eye… به کاربر نمایش داده می‌شود</span>
    </div>
    <div class="hz-filterbar" role="group" aria-label="دلیل‌های آماده">…chips…</div>
    <textarea class="hz-textarea" id="r" required maxlength="500" aria-describedby="r-aud r-count"></textarea>
    <div class="hz-field__foot"><span class="hz-field__hint">…</span><span class="hz-field__counter" id="r-count" aria-live="polite">۰ از ۵۰۰ نویسه</span></div>
  </div>
</div>
```

## Tokens

`border-control` `focus-ring` as a single 2px border (no outer ring) (focus) `status-error-border` + `status-error-text` (empty) `status-warning-text` (counter ≥ 90%) `status-info-text` (audience: public) `text-secondary` `bg-subtle` (internal note) `bg-brand-subtle` (pressed chip) `bg-disabled` `text-disabled` `radius-md` `radius-full`.

## Variants & sizes

- **Outcome**: correction · reject · suspend (and revoke inside SensitiveConfirm). Only the label, audience and drafts change.
- **Audience**: public (eye, info tone) or internal-only (lock, secondary) — the internal note is always the second field, never a toggle on the first.
- **Compact** (in a Modal or sheet): 2 rows, internal note collapsed.
- Counter tiers: normal < 90% · `--near` ≥ 90% («بیش از ۴۵۰ نویسه: کوتاه‌تر بنویسید…») · `--over` blocks submit (only reachable by paste; `maxlength` trims typing).

## States

- **Default**: empty with placeholder «دلیل را دقیق بنویسید؛ همین متن برای کاربر فرستاده می‌شود.»
- **Chip pressed**: the chip's sentence is appended to the text (inserted when empty); the chip shows `aria-pressed="true"`; the operator edits freely afterwards.
- **Hover** (pointer): textarea border `text-secondary`; chip unchanged.
- **Focus-visible**: the border turns `focus-ring` orange at 2px — one stroke, same corners, no outer ring.
- **Error**: on submit with an empty reason — `aria-invalid`, «برای رد، دلیل را بنویسید یا یکی از دلیل‌های آماده را انتخاب کنید.» Focus moves to the textarea.
- **Disabled**: while the decision is submitting; chips and textarea lock.
- **Long Persian text**: the textarea grows to 10 rows, then scrolls; the hint wraps under the counter, which never wraps.

## Mobile ↔ desktop

- **<768**: inside the decision BottomSheet; chips wrap to two lines, 44px tall on coarse pointers; the internal note stays collapsed.
- **768–1023**: inside the Modal opened from the decision bar.
- **≥1024**: inline in the DecisionDesk panel (380px column).

## RTL & LTR

Label at the start, audience at the end; error at the start, counter at the end. `eye`, `lock-simple`, `plus`, `warning-circle` are not mirrored. Avoid identifiers inside reasons; if needed they follow the bidi rules of the message channel (SMS has none), so prefer naming the item in Persian.

## Accessibility

- `required` + `aria-describedby` → audience line, counter, error.
- Counter is `aria-live="polite"` and announces only at thresholds in production (90%, 100%).
- Chips are `button`s in a `role="group"` named «دلیل‌های آماده».
- The internal note label says who can read it; the audience line is text, not colour alone.

## Data

Writes `reasonFa` (string ≤ 500, required for NEEDS_CORRECTION / REJECT / SUSPEND / REVOKE) and `internalNoteFa` (≤ 1000, optional, staff-only) with the decision. Drafts come from per-queue config (`draftReasons[outcome]`). `reasonFa` is sent to the user by SMS and shown in their case timeline; `internalNoteFa` appears only in the ops timeline and `/admin/audit`.

## Code mapping

★ New `src/ops/reason-field.tsx`: `ReasonField({ outcome, audienceFa, drafts?: string[], value, onChange, maxLength = 500, minLength = 10, internalNote?: { value, onChange, maxLength = 1000 }, error?, disabled? })`. Used by DecisionDesk (`reasonRequiredFor`) and SensitiveConfirm.

## Do / Don't

- Do tell the operator who will read the text, every time.
- Do keep the internal note visually different (`bg-subtle` + lock) so it is never sent by mistake.
- Do write drafts as full sentences the user can act on («تاریخ تولد واردشده با کارت ملی مطابقت ندارد.»).
- Don't accept whitespace-only reasons or a chip label alone as a full reason when the queue requires detail.
- Don't put staff-only facts (phone calls, suspicions) in the public reason.
