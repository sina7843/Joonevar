# Checkbox

A native checkbox with a 20px box, label and optional description, for consent, independent on/off options and multi-select groups.

Replaces the **31 raw inputs** in today's forms. Use it for one consent («اطلاعات واردشده را درست می‌دانم…») or a group where any number can be chosen (centre services, facilities). Use Radio for one-of-many, Switch (P1) for a setting that applies immediately.

## Anatomy

`label.hz-check` (whole row is the hit area, min 44px) → `input[type=checkbox]` (20px, `radius 6`, 2px `border-control`) → `.hz-check__text` → label (`.hz-check__label` for bold) → optional `.hz-check__desc`. Groups: `fieldset.hz-fieldset` → `legend.hz-field__label` → `.hz-choice-group` → items → group error.

## CSS API

| Class | Use |
|---|---|
| `.hz-check` | Row (label element) |
| `.hz-check__text` · `__label` · `__desc` | Text column, bold label, secondary description |
| `.hz-choice-group` · `--inline` · `--nested` | Vertical list · wrapping row of short items · indented children of a parent |
| `input[aria-invalid="true"]` | Error border (css-addition `Checkbox.css`) |

```html
<label class="hz-check">
  <input type="checkbox" id="terms" aria-describedby="terms-d">
  <span class="hz-check__text">
    <span class="hz-check__label">قوانین ثبت آگهی در بازار همزیست را خوانده‌ام و می‌پذیرم.</span>
    <span class="hz-check__desc" id="terms-d">آگهی پس از بررسی بازار منتشر می‌شود و ۳۰ روز نمایش داده می‌شود.</span>
  </span>
</label>
```

**Bundle fix in `Checkbox.css`:** in RTL the tick (`border-inline-start` + `border-block-end`) rendered as a chevron. The addition sets `[dir="rtl"] … :checked::after { transform: rotate(-45deg) scaleX(-1) }`, so the tick looks the same as in LTR (a check mark is never mirrored). Merge into the bundle rule.

## Tokens

`border-control` · checked/indeterminate fill `action-primary` with `text-on-action` mark · `focus-ring` · `status-error-border` + `status-error-text` · disabled `bg-disabled`, `border-disabled`, `text-disabled` · `text-secondary` description.

## Variants & sizes

Single · with description · group (vertical, inline for ≤ 4 short labels) · parent with **indeterminate** state controlling children («همه امکانات») · one size (20px box, 44px row).

## States

Unchecked · checked · indeterminate (`el.indeterminate = true`, `aria-checked="mixed"`) · hover (pointer) · focus-visible (ring on the box) · disabled, checked or not, with the reason in the description · error on a single consent («برای ارسال درخواست، تأیید درستی اطلاعات لازم است.») · error on a group («دست‌کم یک خدمت را انتخاب کنید.») · **long Persian label + description** wraps under the text column; the box stays top-aligned with the first line.

## Mobile ↔ desktop

Row height ≥ 44px everywhere; whole row tappable. Inline groups wrap on narrow screens and become a vertical list on <768 when labels exceed two words. Consent checkboxes sit directly above the primary action (in the sticky ActionRow area on mobile).

## RTL & LTR

Box at inline-start, text after it; description aligns with the label, not the box. Groups and nesting use `padding-inline-start`.

## Accessibility

Native checkbox in a `<label>` · description via `aria-describedby` · groups in `fieldset`/`legend`; the group error is linked from the fieldset (`aria-describedby`) and each input gets `aria-invalid` · Space toggles · parent checkbox exposes `mixed` · never pre-check a consent.

## Data

Booleans and arrays from the forms: consent flags on requests, `centreServices` / `centreFacilities` (taxonomy) as arrays of strings, notification preferences. Read views show the chosen labels as a list, «—» when none.

## Code mapping

★ New `Checkbox` — props: `label`, `description`, `checked`, `defaultChecked`, `indeterminate`, `onChange`, `disabled`, `invalid`, `name`, `value`. New `CheckboxGroup` built on `FieldGroup` (see Field): `legend`, `options[{ value, label, description }]`, `value: string[]`, `onChange`, `required`, `error`, `layout: 'stack' | 'inline'`, optional `selectAllLabel`.

## Do / Don't

- Do write consent as a first-person statement the user is making.
- Do keep the box and label as one tap target.
- Don't use a checkbox to trigger an immediate change (that is a Switch).
- Don't use a single checkbox where the two answers both need words (بله/خیر/نامشخص → Radio).
