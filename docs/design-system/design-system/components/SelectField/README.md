# SelectField

A native `<select>` inside a Field, styled like TextField, with a placeholder option «انتخاب کنید».

Use it for a short, known list where the user picks one value: province (`provincesSample`), species, breed group, a short breed list. Use Radio when there are ≤ 4 options that should be visible at once (جنس: نر / ماده). Use Combobox (P1, today `BreedPicker`) when the list is long or needs search (all breeds, cities, vets).

## Anatomy

Field label → `.hz-select-wrap` (holds the CSS caret at inline-end) → `select.hz-select` (48px, padding-end 44px) → hint / error.

## CSS API

| Class | Use |
|---|---|
| `.hz-select-wrap` | Positioning + caret (`::after`) |
| `.hz-select` | Control; shares states with `.hz-input` |
| `.hz-input--sm` on the select | 44px, OpsShell only |
| `select:required:invalid` | Placeholder option reads `text-secondary` (css-addition `SelectField.css`) |

```html
<span class="hz-select-wrap">
  <select class="hz-select" id="province" required aria-describedby="province-error" aria-invalid="true">
    <option value="" selected disabled>انتخاب کنید</option>
    <option>تهران</option><option>اصفهان</option><option>فارس</option>
  </select>
</span>
```

**Bundle fix in `SelectField.css`:** the caret is drawn with `border-inline-end` + `border-block-end` and `rotate(45deg)`; in RTL that draws a sideways chevron. The addition rotates it `-45deg` under `[dir="rtl"]` so it points down in both directions. Merge it into the bundle rule.

## Tokens

Same as TextField: `bg-surface`, `border-control`, `focus-ring` as a single 2px border (no outer ring), `status-error-border`, `bg-disabled`/`border-disabled`/`text-disabled`; caret `icon-default` (disabled: `text-disabled`); `text-secondary` for the placeholder option.

## Variants & sizes

Default with placeholder · selected · with `<optgroup>` (breeds grouped by species: «سگ») · small (OpsShell filters).

## States

Default · hover (pointer) · focus-visible · selected · disabled with reason («اول گونه را انتخاب کنید؛ فهرست نژادها بر اساس گونه پر می‌شود.») · error («استان را انتخاب کنید.») · loading options: disable and show hint «در حال بارگذاری فهرست» · **long option**: the closed control ellipsises («پینشر و شناوزر، مولوسوئیدها و سگ‌های کوهستان و دام سوئیسی»); the open native list shows it in full.

## Options list

Approved 11 Mehr 1405 (v1.0.2). On desktop browsers that allow it (Chromium 135+ via `appearance: base-select`, fine pointer), the list opens as a **separate rounded panel 6px below the field** in the menu style: `bg-surface`, `border-default`, `radius-lg`, `shadow-overlay-sm`, 6px inner padding, at least as wide as the field, max 320px tall then scrolls. Rows are 40px with `radius-sm`; hover `bg-subtle`; the selected option is `bg-brand-subtle` + `text-brand` Bold with a ✓ at the end; disabled options `text-disabled`. While open the field keeps its focus border and the arrow turns up. Phones and other browsers keep the **native** picker (the OS sheet is the better control on touch) — no JavaScript replacement.

## Mobile ↔ desktop

Native on purpose: on phones the OS picker opens (wheel / sheet), which is the best touch UI and needs no custom code. 48px at every width. Dependent selects (province → city) stack on <768, sit side by side from 768.

## RTL & LTR

Text starts at start, caret at inline-end; both follow `dir`. The caret is a CSS chevron, not an icon, and points down in both directions.

## Accessibility

Native semantics, keyboard and screen-reader support · the placeholder option is `disabled` + `value=""` so `required` validation works · label via Field · error via `aria-describedby` + `aria-invalid`.

## Data

Options come from taxonomy: `provincesSample` (`code`, `nameFa`), `citiesSample`, `breeds` (`id`, `nameFa`, `speciesCode`), `breedGroups`. The option `value` is the code/id, the text is `nameFa`. An admin-entered breed not in the seed («پرشین (اگزوتیک موکوتاه)») appears like any other.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/field.tsx`: `SelectField({ label, hint, error, required, options: { value, label }[], placeholder = 'انتخاب کنید', ...native select props })`. Confirmed.


`src/ui/field.tsx` — `SelectField`: keep `options` / children `<option>`, `value`, `onChange`, `required`, `disabled`. Proposed: `placeholder` (default «انتخاب کنید»), `groups` for optgroups, `size: 'md' | 'sm'`.

## Do / Don't

- Do start every required select on «انتخاب کنید», never on the first real value.
- Do disable a dependent select with a reason instead of hiding it.
- Don't build a custom dropdown for a short list; the native one is better on phones.
- Don't use a select for yes/no; use Radio or Checkbox.
