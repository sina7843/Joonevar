# Radio

A native radio group for choosing exactly one of a few visible options, with optional descriptions and a card style.

Replaces the **24 raw inputs** in today's forms. Use it for 2–5 options the user should compare: جنس (نر / ماده), نحوه قیمت‌گذاری, وضعیت واکسیناسیون (بله / خیر / نامشخص). Use SelectField for longer lists, Checkbox for any-of-many. **Radio Card** (service, plan, shipping method, with icon or price) is P1; until then `.hz-option` gives the card look.

## Anatomy

`fieldset.hz-fieldset` → `legend.hz-field__label` (+ «*») → `.hz-choice-group` → `label.hz-radio` rows (20px circle, 2px `border-control`; checked = brand ring + 10px dot) → optional `.hz-radio__desc` → hint / group error.

## CSS API

| Class | Use |
|---|---|
| `.hz-radio` · `__text` · `__label` · `__desc` | Row, text column, bold label, description |
| `.hz-choice-group` · `--inline` | Stack (default) or wrapping row for short labels |
| `.hz-option` (+ `__text` · `__label` · `__desc`) | Card style: bordered, `radius-lg`; selected = `border-brand` + `bg-brand-subtle` |
| `.hz-choice-group--cards` | 1 column on mobile, 2 from 768 |

```html
<fieldset class="hz-fieldset">
  <legend class="hz-field__label">جنس<span class="hz-field__req" aria-hidden="true">*</span></legend>
  <div class="hz-choice-group hz-choice-group--inline">
    <label class="hz-radio"><input type="radio" name="sex" value="MALE" checked><span class="hz-radio__text"><span>نر</span></span></label>
    <label class="hz-radio"><input type="radio" name="sex" value="FEMALE"><span class="hz-radio__text"><span>ماده</span></span></label>
  </div>
</fieldset>
```

## Tokens

`border-control` · checked `action-primary` ring + dot · card selected `border-brand` + `bg-brand-subtle` · `focus-ring` · `status-error-border`/`status-error-text` · disabled `bg-disabled`, `border-disabled`, `text-disabled` · `radius-lg` (card).

## Variants & sizes

Inline (2–3 short labels) · stacked with descriptions · card (`.hz-option`) · one size (20px control, ≥44px row).

## States

Unselected · selected · hover (pointer) · focus-visible (ring on the circle; card gets the ring on the whole card) · disabled with reason («گونه پس از ثبت پرونده تغییر نمی‌کند.») · error when nothing is chosen on submit («وضعیت واکسیناسیون را مشخص کنید.») · **long Persian label** wraps («پینشر و شناوزر، مولوسوئیدها و سگ‌های کوهستان و دام سوئیسی»).

## Mobile ↔ desktop

Rows ≥ 44px; inline groups wrap; card groups are one column on <768 and two columns from 768. With more than three options or long labels use the stacked layout on mobile.

## RTL & LTR

Circle at inline-start, label after it; descriptions align with the label. Inline order follows reading order (نر before ماده).

## Accessibility

Native radios with one shared `name` in a `fieldset`/`legend` · Arrow keys move and select, Tab enters/leaves the group · description via `aria-describedby` · group error linked from the fieldset and `aria-invalid` on each radio · do not pre-select a value the user must decide (vaccination, neuter); pre-select only true defaults.

## Data

Enum fields: `sex` (`MALE`/`FEMALE` → `sexFa`), `vaccinationStatus` / `neuterStatus` (`YES`/`NO`/`UNKNOWN` → `disclosureFa` بله/خیر/نامشخص), `sellerKind` (`OWNER`/`KENNEL` → مالک/کنل). Value = code, label = the Persian map.

## Code mapping

★ New `RadioGroup` on `FieldGroup`: `legend`, `name`, `options[{ value, label, description, disabled }]`, `value`, `onChange`, `required`, `error`, `layout: 'inline' | 'stack' | 'card'`. `RadioCard` (P1) will add `icon` and `price` to the option shape.

## Do / Don't

- Do offer «نامشخص» where the user may truly not know.
- Do keep the options in a meaningful order (common first, «نامشخص» last).
- Don't use radios for a single yes/no consent; use Checkbox.
- Don't hide a disabled option without a reason; say what unlocks it.
