# PlaceMap

The frame for a map of centres and places: numbered pins that match a list, a single-place pin on a detail page, zoom controls, attribution, and loading, error and no-location states. A text address or a list always sits beside it.

`src/ui/map.tsx` is optional by design (manifest C: «ورود دستی همیشه کامل است؛ نقشه اختیاری»). Use it on `/centers` and `/places` lists (beside the list), on a centre or place page (one pin), and in LocationField when an owner sets a position. Don't use a map as the only way to find or reach a place. Don't show a map frame for a place that has no coordinates.

> The design system never ships map tiles. The canvas in the preview is a drawn sand-tone placeholder labelled «نقشه نمایشی». In the product the provider's tiles fill `.hz-map`, and the pins, controls, card and states here sit on top of them.

## Anatomy

1. **Frame** `.hz-map`: 16:10 (`--wide` 16:9, `--fill` takes its parent's height), `border-default`, `radius-xl`, `bg-subtle` while tiles load.
2. **Canvas**: provider tiles, or `.hz-map__canvas` (placeholder SVG, `aria-hidden`).
3. **Pins** `.hz-map__pin`: a 32px circle with an ink border and the list number, plus a 9px stem to the exact point. Selected (`aria-pressed="true"`) and single place (`--place`) are `action-primary`.
4. **Controls** `__controls`: plus/minus IconButtons at the top end.
5. **Attribution** `__attrib`: bottom end, 11px. Required by every provider.
6. **Card** `__card` (mobile): the selected place's name, StatusBadge, type and services, and «مشاهده مرکز».
7. **State** `__state`: loading, error or no position, covering the frame.
8. **List** `.hz-place-list` > `.hz-place`: number, name, meta and StatusBadge, with `aria-current` matching the selected pin.

## CSS API

`tools/css-additions/PlaceMap.css`: `.hz-map`, `--wide`, `--fill`, `__canvas` (+ `__area __water __block __street __road-casing __road` for the placeholder), `__pin`, `__pin-head`, `__pin--place`, `__controls`, `__attrib`, `__card`, `__state`, `__state-title`, `__state-body`; `.hz-place-list`, `.hz-place`, `__num`, `__body`, `__name`, `__meta`; `.hz-map-split`. The view toggle uses Tabs' `.hz-segmented`.

```html
<div class="hz-map-split">
  <ol class="hz-place-list" aria-label="مراکز دامپزشکی تهران">
    <li><a class="hz-place" href="/centers/centre-1" aria-current="true"><span class="hz-place__num" aria-hidden="true">۱</span>
      <span class="hz-place__body"><span class="hz-place__name">بیمارستان دامپزشکی مهرگان</span><span class="hz-place__meta">بیمارستان دامپزشکی، تهران</span></span>…StatusBadge</a></li>
  </ol>
  <div class="hz-map" role="region" aria-label="نقشه مراکز دامپزشکی تهران">
    …provider tiles
    <button class="hz-map__pin" type="button" aria-pressed="true" aria-label="۱، بیمارستان دامپزشکی مهرگان"
            style="inset-inline-start: 58%; inset-block-start: 38%"><span class="hz-map__pin-head" aria-hidden="true">۱</span></button>
    <div class="hz-map__controls">…IconButtons «بزرگ‌نمایی» «کوچک‌نمایی»</div>
    <span class="hz-map__attrib">…provider attribution</span>
  </div>
</div>
```

The pin's position is the provider's projected point. The pin is a zero-size anchor with symmetric negative margins, so it centres on the point in RTL and LTR.

## Tokens

`bg-subtle` · `bg-media-empty` + `bg-surface` + `border-default` (placeholder) · `border-default` (frame) · `icon-strong` (pin border, stem, list number) · `bg-surface` (pin head, controls, card, attribution) · `action-primary` + `text-on-action` (selected / single pin, selected number) · `bg-brand-subtle` (pin hover, selected list row) · `border-control` (controls) · `shadow-overlay-sm` (card only, because it floats over the map) · `status-error-bg` (error icon) · `focus-ring` · `radius-xl` / `radius-lg` / `radius-md`.

## Variants & sizes

- **List + map** (`.hz-map-split`, ≥768): list 5/12 at the start, map 7/12. Numbers tie them together.
- **Map only with card** (<768, «نقشه» selected in the Segmented control): the map fills the space under the header, and tapping a pin opens `__card`.
- **Single place** (centre/place page, `--wide`): one `--place` pin with the place type's icon, followed by the text address (KeyValueList) and «باز کردن در برنامه نقشه» (external link, mirrored `arrow-square-out`).
- **Picker** (LocationField, P2): the same frame with a fixed centre pin and «همین موقعیت» confirm. Specified with LocationField.

## States

- **default**: tiles + pins, nothing selected (or the first list item on desktop).
- **hover** (pointer only): pin head `bg-brand-subtle`; list row `bg-subtle`.
- **focus-visible**: ring around the pin head; ring on the list row link.
- **selected**: pin `aria-pressed="true"` (orange, raised z-index) and the list row with `aria-current="true"`. Selecting either selects both.
- **loading**: `__state` with a spinner «در حال بارگذاری نقشه». The list is already usable.
- **error**: «نقشه بارگذاری نشد» + «فهرست مراکز کامل است و از آن استفاده کنید.» + ghost «تلاش دوباره». The list stays.
- **no position**: on public pages, omit the frame and show the text address only. In the owner's edit form: «موقعیت روی نقشه ثبت نشده» + «افزودن موقعیت».
- **disabled**: n/a.
- **long Persian text**: list names wrap (never truncated). The mobile card clamps the name to 2 lines. Pins carry numbers, not names.

## Mobile ↔ desktop

- **<768**: the list is the default view. The «فهرست / نقشه» Segmented control switches views, and filters and pagination apply to both. Controls are 44px and pins have a 32×42 target (pins closer than 44px cluster in the provider layer).
- **768–1023**: list + map side by side (5/7). Controls 36px (44 on coarse pointers).
- **≥1024**: same split. The map can be sticky (`inset-block-start: 80px`) beside a long list.

## RTL & LTR

The list is at the start and the map at the end. Controls sit at the top end, attribution at the bottom end. Pin positions come from geography and never mirror. Only the UI around them does. `plus`, `minus`, `map-pin` and `first-aid-kit` are not mirrored. `arrow-square-out` and `arrow-right` («مشاهده مرکز ←») are mirrored.

## Accessibility

- The map is `role="region"` with `aria-label`, and the canvas is `aria-hidden`. The list is the accessible equivalent and comes first in DOM and tab order.
- Pins are buttons with `aria-pressed` and a name («۲، کلینیک دامپزشکی آوا»). A single-place pin is `role="img"`.
- The card is announced politely when it opens. Esc closes it and returns focus to the pin.
- Zoom buttons have Persian `aria-label`s. Map panning by keyboard is the provider's job and must not trap focus.
- Errors use `role="alert"`.

## Data

Centres (`directory.centres[]`): `displayNameFa`, `typeFa`, `city`, `services`, `hours`, `licenceStatus` (VALID → «معتبر», EXPIRED → «منقضی»). The sample data has **no coordinates**. Coordinates come from LocationField when an owner sets them (optional), and the text address is always required. Pins show only places with coordinates. The list shows all of them, so the two can differ in count. The list says so: «۲ مورد موقعیت روی نقشه ندارند».

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/map.tsx`: `PlaceMap({ nameFa, isPublic, latitude: number | null, longitude: number | null, template, apiKey, testId })` — one place today; the list variant below is new.


`src/ui/map.tsx` (`PlaceMap`): keep its props. Proposed: `places: { id; name; meta?; status?; lat?: number; lng?: number; href }[]`, `selectedId`, `onSelect`, `variant: 'list' | 'single' | 'picker'`, `numbered = true`, `height?`. The provider adapter renders tiles, and the DS markup renders everything else. `PlaceList` is the same `places` as `.hz-place-list`.

## Do / Don't

- Do number pins and list rows the same way.
- Do keep the list usable when the map fails or is still loading.
- Don't colour pins by status. Status is the badge in the list.
- Don't ship a map with no attribution or with a screenshot of real tiles.
