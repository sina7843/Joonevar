# LocationField

An address entry — province, city and full address — that is complete on its own, plus an optional map pin drawn with PlaceMap.

Use it wherever a place is registered: kennel, centre, clinic, seller pickup address. The manual fields are always required and always enough; the map only adds coordinates for directions. Read-only display of places is PlaceMap + KeyValueList, not this field.

## Anatomy

1. Fieldset legend («نشانی کنل»).
2. Row: «استان» (SelectField) · «شهر» (SelectField or Combobox for long lists) — two columns from 768.
3. «نشانی» (TextAreaField, 3 rows) with a hint on where it is shown.
4. Optional map block: «افزودن موقعیت روی نقشه (اختیاری)» ghost button → PlaceMap frame (`.hz-map.hz-map--wide`) with the place pin (`.hz-map__pin--place`) → bar under the map: coordinates (Latin, LTR) + «جابه‌جایی نشانگر» + delete.

## CSS API

| Class | Use |
|---|---|
| `.hz-location` | Fieldset column, 16px gap (css-addition `LocationField.css`) |
| `.hz-location__row` | Province + city; two columns ≥768 |
| `.hz-location__map` | Map block (label, map, bar, hint) |
| `.hz-location__bar` · `__coords` · `__actions` | Coordinates and actions under the map |
| PlaceMap | `.hz-map`, `--wide`, `.hz-map__canvas` (drawn placeholder — never map tiles), `.hz-map__pin--place`, `.hz-map__attrib`, `.hz-map__state` |

```html
<div class="hz-location__map">
  <span class="hz-field__label" id="map-l">موقعیت روی نقشه <span class="hz-field__opt">(اختیاری)</span></span>
  <div class="hz-map hz-map--wide" role="region" aria-labelledby="map-l">…canvas… …pin…</div>
  <div class="hz-location__bar">
    <span class="hz-location__coords">…crosshair…<bdi class="hz-id" dir="ltr">35.8411, 50.9391</bdi></span>
    <span class="hz-location__actions"><button class="hz-btn hz-btn--ghost hz-btn--sm" type="button">جابه‌جایی نشانگر</button>…trash…</span>
  </div>
</div>
```

## Tokens

Field tokens (TextField, SelectField, TextAreaField) · map: PlaceMap tokens (`bg-subtle`, `bg-media-empty`, `bg-surface` streets, `border-default` casings, `action-primary` place pin) · bar `bg-surface`, `border-default`, `radius-md`, coordinates `text-secondary`.

## Variants & sizes

Without map (manual only — the default) · with map (pin set) · map empty («موقعیتی روی نقشه انتخاب نشده» + «انتخاب روی نقشه») · map failed. Map frame 16:9, min-height 200px (PlaceMap).

## States

Default · province/city/address errors (address: «نشانی کامل را بنویسید: محله، خیابان و پلاک.») · map loading (PlaceMap spinner state) · map failed («نقشه بارگذاری نشد. نشانی دستی برای ثبت کافی است.» + «تلاش دوباره») — the form can still be submitted · moving the pin (focus on «جابه‌جایی نشانگر»; then tap/click on the map or use arrow keys) · disabled after approval («شهر کنل پس از تأیید انجمن فقط با درخواست اصلاح تغییر می‌کند.») · **long Persian address** wraps in the textarea (use 4 rows if needed).

## Mobile ↔ desktop

<768: one column; the map opens full screen (Drawer `--full-mobile`) with «تأیید موقعیت» in a sticky bar, then returns to the form showing the small map + bar. 768–1023: province/city side by side, map inline below the address. ≥1024: same, inside the form column (≤ `container-reading`).

## RTL & LTR

Fields and labels RTL; coordinates are Latin numbers in `<bdi class="hz-id" dir="ltr">` (lat, lng). The PlaceMap pin uses symmetric margins so it sits correctly in both directions. Crosshair, map-pin and trash icons are non-directional.

## Accessibility

`fieldset`/`legend` for the address group; every control has a visible label. The map is supplementary: it has `role="region"` with a name, and nothing in it is required. Pin placement by keyboard: «جابه‌جایی نشانگر» toggles move mode; arrow keys move the pin, Enter confirms, Esc cancels; the new coordinates are announced politely. «حذف موقعیت از نقشه» is a labelled icon button.

## Data

`province`, `city` (from `taxonomy.provincesSample` / `citiesSample`), `addressFa` (free text), optional `lat` / `lng` (decimal degrees, nullable). The pack has no address samples — the preview values are synthetic. Directory entries currently carry `city` only; whether address and coordinates exist per entity must be verified in the repo (`src/ui/map.tsx`).

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/field.tsx`: `LocationField({ label, hint, error, required, mapAvailable, value: string, onChange?, onPickOnMap? })` — `value` is one string today, so the structured value below is a proposal. `src/ui/map.tsx`: `PlaceMap({ nameFa, isPublic, latitude, longitude, template, apiKey, testId })`.


`src/ui/field.tsx` (fields — keep as in code) + `src/ui/map.tsx` (`PlaceMap` — keep as in code). Proposed `LocationField`: `value: { province, city, addressFa, lat?: number | null, lng?: number | null }`, `onChange`, `required?`, `allowMap = true`, `disabledFields?: ('province' | 'city' | 'addressFa')[]`, `errors?`. The map picker reuses `PlaceMap` with a single draggable `place` pin.

## Do / Don't

- Do make the manual address sufficient to submit; the map is never required.
- Do let people remove a pin they set by mistake.
- Don't ask people to type coordinates.
- Don't render real map tiles in the design system — PlaceMap's drawn canvas is the placeholder; the provider fills it in the product.
