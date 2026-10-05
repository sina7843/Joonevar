# Field

The wrapper every form control sits in: label, required mark, «(اختیاری)», hint and error, wired to the control through ids.

Use it around every TextField, SelectField, JalaliDateField, MobileField and single control in a form. For a group of checkboxes or radios use the same parts on a `<fieldset>` (`.hz-fieldset` + `<legend class="hz-field__label">`). Do not use it for search boxes in headers (SearchField has its own label) or for filters that already carry a visible column label.

## Anatomy

1. Label `.hz-field__label` — a noun, no colon: «نام حیوان».
2. Required mark `.hz-field__req` «*» (visual only, `aria-hidden`) **or** optional tag `.hz-field__opt` «(اختیاری)». Mark whichever is rarer in the form; never both.
3. Control (any input family member).
4. Hint `.hz-field__hint` — format or consequence: «همان نامی که در برگه ثبتی چاپ می‌شود.»
5. Error `.hz-field__error` — `warning` icon (xs, `status-error-text`) + cause and fix. Replaces nothing: the hint stays above it.

## CSS API

| Class | Role |
|---|---|
| `.hz-field` | Column, 6px gap |
| `.hz-field__label` · `__req` · `__opt` | Label line |
| `.hz-field__hint` · `.hz-field__error` · `.hz-field__counter` | Under the control |
| `.hz-fieldset` + `legend.hz-field__label` | Group version (css-addition) |
| `.hz-choice-group` · `--inline` · `--cards` · `--nested` | Layout of checkbox/radio items inside a fieldset (css-addition) |

```html
<div class="hz-field">
  <label class="hz-field__label" for="name">نام حیوان<span class="hz-field__req" aria-hidden="true">*</span></label>
  <input class="hz-input" id="name" required aria-describedby="name-hint name-error" aria-invalid="true">
  <div class="hz-field__hint" id="name-hint">همان نامی که در برگه ثبتی چاپ می‌شود.</div>
  <div class="hz-field__error" id="name-error"><svg class="hz-icon hz-icon--xs" …warning…/><span>نام حیوان را وارد کنید یا گزینه «بدون نام» را انتخاب کنید.</span></div>
</div>
```

## Tokens

`text-primary` (label) · `text-secondary` (hint, optional tag) · `status-error-text` (required mark, error) · `status-error-border` (invalid control) · `focus-ring` · `space-4`/`space-8` rhythm (6px gap).

## Variants & sizes

Required · optional · with hint · with error · group (fieldset). One size; dense OpsShell forms use `.hz-input--sm` on the control, the Field itself does not shrink.

## States

- **Default / hover / focus-visible / disabled** belong to the control; the label never changes colour.
- **Error:** shown after the first submit or on blur of a touched field, never while typing the first characters. Control gets `aria-invalid="true"` and the error id in `aria-describedby`. On submit, focus moves to the first invalid control.
- **Disabled / locked:** keep the hint and say why and what unlocks it: «شناسه را سامانه هنگام ثبت می‌سازد و قابل ویرایش نیست.»
- **Long Persian text:** label and hint wrap; never truncate a label (example: «نام حیوان (همان‌طور که در شناسنامه یا برگه ثبتی آمده است)»).

## Mobile ↔ desktop

Always a single column on <768. At 768–1023 two Fields may share a row (city + province); at ≥1024 forms stay ≤ `container-reading`, max two columns. Label stays above the control at every width (no side labels: Persian labels vary too much in length).

## RTL & LTR

Label, hint and error align to start. LTR content inside the control (`.hz-input--ltr`) does not move the label. Error icon sits at the start of the error line; `warning` is never mirrored.

## Accessibility

`<label for>` (or `aria-labelledby` for composite controls such as OTP and the date pair) · `required` on the control, the star is decorative · `aria-describedby` lists hint then error · `aria-invalid` only when an error is shown · on submit, a form-level Alert summarises the count of errors and links to each field.

## Data

Label text and hints come from the form definition; errors come from the form's validation (server errors map onto the same `error` prop). A field with no value in a read-only view shows «—», never blank.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/field.tsx`: `Field({ label, hint?, error?, required?, children: ({ inputId, describedBy, invalid }) => ReactNode })` — render-prop API confirmed.


`src/ui/field.tsx` — **keep the render-prop API**: `Field` renders label/hint/error and calls `children({ inputId, describedBy, invalid })`; the child spreads `id={inputId}`, `aria-describedby={describedBy}`, `aria-invalid={invalid}`. Props to keep: `label`, `hint`, `error`, `required`; add `optional` (renders «(اختیاری)»). New: `FieldGroup` (`legend`, `hint`, `error`, `required`) rendering `.hz-fieldset` for Checkbox/Radio groups.

## Do / Don't

- Do write errors as cause + fix: «شماره میکروچیپ باید ۱۵ رقم باشد. این مقدار ۱۴ رقم دارد.»
- Do keep the hint visible when the error appears.
- Don't use the placeholder as the label, or put the only instruction in a placeholder.
- Don't colour the label red on error; only the control border and the error line change.
- Don't show «*» on every field of a form where everything is required — say «همه موارد اجباری است» once.
