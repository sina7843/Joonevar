# Combobox

A searchable select — type to filter a known list, pick one value or several (removable chips); matching treats «ی/ي» and «ک/ك» as the same letter.

Use it when the list is long or grows (breeds, cities, trusted vets, product categories, centre services, breed groups) and people know what they are looking for. For ≤ 7 fixed options use SelectField or Radio; for free search across the site use SearchField. Replaces the breed-only `BreedPicker`.

## Anatomy

1. Field label + required/optional mark.
2. Control `.hz-combobox__control` (48px, looks like `.hz-input`): chips (multi) → text input → end buttons (clear «پاک کردن…», toggle caret).
3. Popup: SearchField's `.hz-listbox` (`--popover` in the app): options with primary text + meta (Latin name in `<bdi>`, group, city), matched part in `<mark>`; or a status row (loading), empty message, or group headings.
4. Hint (count of selected items in multi) / error.

## CSS API

| Class | Use |
|---|---|
| `.hz-combobox` | Positioning root (popup is absolute under it) |
| `.hz-combobox__control` / `--chips` | Bordered control; `--chips` tightens the start padding |
| `.hz-combobox__input` | Borderless text input inside |
| `.hz-combobox__end` | Clear + toggle `.hz-icon-btn`s (40px) |
| `.hz-combobox__chip` · `__chip-label` · `__chip-remove` | Removable selection (multi); label ellipsis, remove has a 44px hit area |
| `.hz-listbox` · `--popover` · `--multi` | Popup (bundle + SearchField) |
| `.hz-listbox__option--active` | Keyboard-active option (`aria-activedescendant`) |
| `.hz-listbox__box` | Checkbox square in multi options |
| `.hz-listbox__end` | Trailing slot (e.g. selected tick in single) |
| `.hz-listbox__status` | Loading row (spinner + text) |

```html
<div class="hz-combobox">
  <div class="hz-combobox__control">
    <input class="hz-combobox__input" id="breed" role="combobox" aria-autocomplete="list"
           aria-expanded="true" aria-controls="breed-list" aria-activedescendant="breed-o1" value="رتریور">
    <span class="hz-combobox__end"><button class="hz-icon-btn" type="button" aria-label="پاک کردن جستجو">…x…</button></span>
  </div>
  <ul class="hz-listbox hz-listbox--popover" id="breed-list" role="listbox" aria-label="نژادها">
    <li class="hz-listbox__option hz-listbox__option--active" id="breed-o1" role="option" aria-selected="false">
      <span class="hz-listbox__text"><span class="hz-listbox__primary">لابرادور <mark>رتریور</mark></span>
      <span class="hz-listbox__meta"><bdi dir="ltr">Labrador Retriever</bdi>، گروه ۸</span></span></li>
  </ul>
</div>
```

## Tokens

Control: `bg-surface`, `border-control`, focus-within `focus-ring` as a single 2px border (no outer ring), invalid `status-error-border`, disabled `bg-disabled`/`border-disabled`/`text-disabled` · chips `bg-subtle`, `border-default`, `icon-strong` · popup `bg-surface`, `border-default`, `shadow-overlay-sm`, `radius-lg` · active option `bg-subtle` + inset `focus-ring` · `mark` `text-brand` · multi box `action-primary` / `text-on-action`.

## Variants & sizes

**Single** (breed, city, trusted vet) — selected value shows as the input text, with clear + caret. **Multi** (centre services, breed groups, product categories) — chips before the input, listbox with check squares, popup stays open after each pick. One size (48px; chips 32px).

## States

Closed with value · open with matches (first match active) · **normalised match**: «شيتزو» → «شیتزو», «كرج» → «کرج» · loading (server search for vets: «در حال جستجوی دامپزشکان…», `aria-busy`) · empty («دامپزشکی با «رحیمی» پیدا نشد.» + what the list contains and what to try) · error («نژاد را از فهرست انتخاب کنید.») · disabled with reason («اول گونه را انتخاب کنید؛ فهرست نژادها به گونه بستگی دارد.») · hover (option bg-subtle, pointer only) · focus (ring on the whole control) · **long Persian text**: chips ellipsize with the full name in `title` and in the remove button's label; long single values scroll in the input.

## Mobile ↔ desktop

<768: the popup opens as a full-height BottomSheet with the search input at its top (keyboard-safe), options 44px+; multi keeps a «تأیید» footer. 768–1023 and ≥1024: inline popover under the control, max-height 360px, scrolls. Chips wrap onto new lines; the control grows. Coarse pointers: chip remove buttons keep a 44px hit area (`::after`).

## RTL & LTR

Chips and text start at inline-start; clear/caret at inline-end. Caret rotates 180° when open (non-directional). Latin meta (`German Shepherd`) is isolated in `<bdi dir="ltr">`. Highlighting happens on the normalised string and maps back to the original characters.

## Accessibility

WAI-ARIA combobox (1.2): input `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-autocomplete="list"`, `aria-activedescendant` → option ids; listbox `role="listbox"` (`aria-multiselectable="true"` for multi), options `role="option"` + `aria-selected`. Keys: ↓/↑ move, Enter picks, Esc closes (second Esc clears), Backspace in an empty multi input removes the last chip, Home/End inside the text. The toggle button is `tabindex="-1"`. Result counts are announced through a polite live region («۲ نژاد پیدا شد»). Chip remove buttons: «حذف واکسیناسیون».

## Data

Option sources: `taxonomy.breeds` (`nameFa`, `nameEn`, `altNames`, `fciGroup`, filtered by `speciesCode`), `citiesSample` / provinces, `directory.vets` (`displayNameFa`, `city`, `specialties`, trusted only where required), `centreServices`, `breedGroups`, admin-managed product categories. Value stored as id (breed id, city code) for single, array of ids/strings for multi. **Search normalisation:** ي→ی, ك→ک, ة→ه, Arabic/Persian digits → Latin, ZWNJ and spaces collapsed, diacritics removed; also match `nameEn` and `altNames` («شپرد آلمانی», «Alsatian»).

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/breed-picker.tsx`: `BreedPicker({ breeds: { id, nameFa, nameEn }[], defaultValue?, name = 'breedId', required?, testId? })`. Keep until Combobox replaces it.


Existing: `BreedPicker` (breeds only — keep its props as in code). ★ Proposed `Combobox` in `src/ui/combobox.tsx`: `label`, `options` or `loadOptions(query)`, `value` / `onChange`, `multiple?: boolean`, `getOptionLabel`, `getOptionMeta?`, `placeholder`, `emptyText`, `disabled`, `disabledReason`, `required`, `error`, `normalize = normalizeFa`. `BreedPicker` becomes `<Combobox options={breedsBySpecies}>`.

## Do / Don't

- Do normalise both the query and the option text the same way; never ask people to switch keyboards.
- Do keep the popup open in multi mode and show the running count in the hint.
- Do explain an empty result and what the list contains.
- Don't allow free text to be submitted as a value unless the field explicitly accepts «سایر» — breeds and services are managed lists.
- Don't use chips for single select; the value lives in the input.
