# SearchField

A search input with a magnifying glass at the start, an optional clear button and filter button, and a grouped suggestions listbox.

Use it for global search (`/search`, header) and at the top of every searchable list (breeds, vets, centres, shop, market, `/admin/settings` 146 keys). For picking one value into a form use Combobox (P1); for exact lookups by code use «استعلام اصالت» with a TextField.

## Anatomy

`.hz-search` wrap → `magnifying-glass` icon (inline-start) → `input[type=search]` (`role="combobox"`) → clear button `x` (inline-end, only when there is text) → optional filter button beside it → `.hz-listbox` popover: groups (`.hz-listbox__group` «نژادها» / «مطالب» / «دامپزشکان»), options (icon + text with `<mark>` on the match + meta line), footer «همه نتیجه‌ها برای «ژرمن»», or an empty row.

## CSS API

| Class | Use |
|---|---|
| `.hz-search.hz-input-wrap.hz-input-wrap--icon` | 48px (`control-lg`) |
| `.hz-search--lg` | 56px, 16px text — `/search` page and hero |
| `.hz-input-wrap--action` | Clear button (from `TextField.css`) |
| `.hz-search-row` | Search + filter button in one row (css-addition `SearchField.css`) |
| `.hz-listbox` · `__group` · `__option` · `mark` | Bundle |
| `.hz-search-combo` · `.hz-listbox--popover` | Positioning (absolute, under the input, `z-dropdown`, max 360px, scrolls) — css-addition |
| `.hz-listbox__list` · `__icon` · `__text` · `__primary` · `__meta` · `__empty` · `__footer` | Option content — css-addition |

```html
<div class="hz-search-combo">
  <div class="hz-input-wrap hz-input-wrap--icon hz-input-wrap--action hz-search hz-search--lg">
    <span class="hz-input-wrap__icon">…magnifying-glass…</span>
    <input class="hz-input" type="search" role="combobox" aria-label="جستجو" aria-expanded="true"
           aria-controls="lb" aria-activedescendant="o-1" aria-autocomplete="list" value="ژرمن">
    <span class="hz-input-wrap__action"><button class="hz-icon-btn" type="button" aria-label="پاک کردن جستجو">…x…</button></span>
  </div>
  <ul class="hz-listbox hz-listbox--popover" role="listbox" id="lb">…groups…</ul>
</div>
```

## Tokens

Input as TextField · listbox `bg-surface`, `border-default`, `radius-lg`, `shadow-overlay-sm` · active option `bg-subtle` · match `<mark>` `text-brand` bold (no background) · group title and meta `text-secondary` · `icon-default` · footer divider `border-subtle`, link colour `text-brand`.

## Variants & sizes

Default 48 · large 56 · with clear button · with filter button («فیلترها (۲)»; icon-only `.hz-icon-btn--lg.hz-icon-btn--outline` with `aria-label` on <768) · with suggestions (grouped, max 3–4 per group + «همه نتیجه‌ها») · no suggestions (list pages: Enter filters the list in place).

## States

Empty with placeholder «جستجو در نژادها، مطالب و دامپزشکان» · hover · focus-visible · typing (suggestions after 2 characters, debounced ~250ms) · loading (a spinner row «در حال جستجو» after 300ms) · results · **no results**: «نتیجه‌ای برای «پاپیون» پیدا نشد.» + «املای واژه را بررسی کنید یا فیلترها را بردارید.» · error: row «جستجو انجام نشد. دوباره تلاش کنید.» · long titles ellipsise in one line (full text in the result page).

## Mobile ↔ desktop

<768: the header search opens a full-screen search layer (input at top, suggestions fill the screen, back arrow at start); filter button is icon-only and opens the filter Drawer. 768–1023: inline, popover full width of the field. ≥1024: popover matches the field width; on list pages the filter column replaces the filter button. Options are ≥44px.

## RTL & LTR

Search icon at inline-start, clear and filter at inline-end; magnifying glass and funnel are **not** mirrored. The footer arrow is `arrow-right` + `hz-icon--mirror` (points ← in RTL). Latin queries (codes) are typed in the same field; `dir="auto"` on the input keeps them readable.

## Accessibility

ARIA 1.2 combobox: `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, `aria-autocomplete="list"` · listbox groups are `role="group"` + `aria-labelledby` · Up/Down move, Enter opens the active option (or the results page when none is active), Escape closes then clears · result count announced in a polite live region («۴ پیشنهاد») · the clear and filter buttons have Persian labels; the filter label includes the active count.

## Data

Sources: `taxonomy.breeds` (`nameFa`, `speciesCode`, `sizeFa`), `content` (`titleFa`, `kind` → `contentKindsFa`), `directory.vets` (`displayNameFa`, `headlineFa`, `city`), `directory.communities`. **Matching normalises** Arabic «ي»→«ی» and «ك»→«ک», removes ZWNJ/tatweel and diacritics, and folds Persian/Arabic digits, on both the query and the index — so «صادقي» finds «دکتر مریم صادقی». Highlight uses the original text with the matched range wrapped in `<mark>`.

## Code mapping

★ New `SearchField`: `value`, `onChange`, `onSubmit`, `size: 'md' | 'lg'`, `placeholder`, `suggestions: { group, items: { id, icon, title, meta, href }[] }[]`, `loading`, `onClear`, `filterCount` + `onOpenFilters`. Shares the listbox and normalisation with Combobox (P1, today `BreedPicker`).

## Do / Don't

- Do group suggestions by entity and keep the groups in a fixed order.
- Do highlight the match, not the whole row.
- Don't search on every keystroke without debounce.
- Don't show an empty popover; show the no-result row with a next step.
