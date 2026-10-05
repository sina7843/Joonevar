# VariantPicker

A radio group of option tiles for a product's variants (weight, size, capacity), each tile showing its own price, with unavailable variants kept visible and disabled.

Use it on `/shop/[slug]` and in the quick-add sheet of a product card whenever an offer has two or more SKUs. With one SKU, show the value as plain text («حجم: ۲۵۰ میلی‌لیتر») — no picker. Not for filters (that is `FilterBar` chips) and not for animal-listing options.

## Anatomy

1. `fieldset` with legend: option name («وزن بسته»، «اندازه»، «مناسب برای وزن سگ») + the current value in secondary text.
2. Option tiles (`label.hz-variant` with a real `input type="radio"` covering the tile):
   - label — `labelFa`, Bold 15/24;
   - price — «۳٬۸۴۷٬۰۰۰ تومان», 13/20 (becomes primary text when selected);
   - note — «ناموجود» on disabled tiles;
   - check mark at the inline end — shown only when selected.
3. Error line (`.hz-field__error`) under the tiles.
4. Selected-variant summary (`.hz-variant-summary`): large price + `StockBadge`, in a polite live region.

## CSS API

New in `css-additions/VariantPicker.css`: `.hz-variant-picker` (`__legend`, `__value`, `__options`, `--compact`), `.hz-variant` (`__label`, `__price`, `__note`, `__check`), `.hz-variant-summary`. Reuses `.hz-price`, `.hz-stock`, `.hz-field__error`, `.hz-skeleton`.

```html
<fieldset class="hz-variant-picker">
  <legend class="hz-variant-picker__legend">وزن بسته <span class="hz-variant-picker__value">۱۰ کیلوگرم</span></legend>
  <div class="hz-variant-picker__options">
    <label class="hz-variant"><input type="radio" name="sku" value="SKU-P72YM6" checked>
      <span class="hz-variant__label">۱۰ کیلوگرم</span><span class="hz-variant__price">۳٬۸۴۷٬۰۰۰ تومان</span>
      <span class="hz-variant__check"><svg class="hz-icon hz-icon--xs" …check…></svg></span></label>
    <label class="hz-variant"><input type="radio" name="sku" value="SKU-EJYCMV" disabled aria-describedby="n15">
      <span class="hz-variant__label">۱۵ کیلوگرم</span><span class="hz-variant__price">۴٬۸۴۴٬۰۰۰ تومان</span>
      <span class="hz-variant__note" id="n15">ناموجود</span></label>
  </div>
</fieldset>
```

## Tokens

`bg-surface`, `bg-subtle`, `bg-brand-subtle`, `border-control`, `border-default`, `border-brand`, `action-primary`, `text-on-action`, `text-primary`, `text-secondary`, `status-neutral-text`, `status-error-border`, `focus-ring`, `radius-md`, `control-*`.

## Variants & sizes

- **Default** — tiles ≥ 120px (`auto-fit`), 64px high: long labels such as «تا ۵۰ کیلوگرم».
- **Compact** (`--compact`) — tiles ≥ 96px, 56px high: short size codes S / M / L / XL.
- Tile price always shown, even when all variants cost the same; a variant with `price = null` shows «تعیین‌نشده» and is disabled (no purchase path).

## States

- **Default** · **hover** (pointer): border darkens to `text-secondary`.
- **Selected**: brand border (2px visual), `bg-brand-subtle`, check mark, price in primary text — never colour alone.
- **Focus-visible**: ring around the tile (`:has(input:focus-visible)`); arrow keys move within the group (native radios).
- **Disabled / unavailable**: dashed border, `bg-subtle`, «ناموجود» note; stays in place so the price ladder is still readable.
- **Error**: «یک اندازه را انتخاب کنید؛ قیمت به اندازه بستگی دارد.» after «افزودن به سبد» with nothing chosen; enabled tiles get `status-error-border`. Default selection is the first *available* variant, so this only happens when the product page opens without a preselection (e.g. all-unavailable default).
- **Loading**: skeleton legend + three tile skeletons.
- **Long Persian text**: labels wrap inside the tile; the price wraps «تومان» to the next line in compact tiles.

## Mobile ↔ desktop

Same component everywhere; `auto-fit` gives 2–3 tiles per row at 360px and up to 4–5 in the desktop buy box (≥1024 the buy box is the side column of the product page). On mobile the summary + «افزودن به سبد» sit in the sticky bottom bar; the picker stays in the page flow. Tiles are ≥ 56px high, so the 44px touch target is always met.

## RTL & LTR

Tiles flow from the inline start (right in RTL); check mark at the inline end. Size codes S/M/L/XL are Latin capitals in the Persian run and need no `bdi` (no neutral characters). Prices are Persian digits with `٬`.

## Accessibility

- Native `fieldset`/`legend` + radios: role, name and arrow-key behaviour come for free.
- Disabled tiles use `disabled` + `aria-describedby` to the «ناموجود» note.
- The summary is `aria-live="polite"` so the new price and availability are announced on change.
- Error: `aria-invalid="true"` + `aria-describedby` on the fieldset.

## Data

`shop.json → products[].offers[].skus[]`: `sku`, `labelFa`, `price.toman` / `displayFa`, `stockOnHand`, `stockReserved` (→ `StockBadge`). The option name (legend) is not in the sample; proposed `product_variant.optionNameFa`, admin-managed per category. Sample: غذای خشک سگ بالغ نژاد بزرگ (۳ / ۱۰ / ۱۵ کیلوگرم; 15 kg out of stock per `edge-cases.json → shop`), قلاده چرمی (S/M/L), تشک ارتوپدی (XL out), افسار (تا ۲۵ / تا ۵۰ کیلوگرم).

## Code mapping

★ New — proposed `VariantPicker` in `src/ui/variant-picker.tsx`: `name`, `legend`, `options: { sku, label, priceToman: bigint | null, onHand, reserved }[]`, `value`, `onChange(sku)`, `compact?`, `error?`. Uses `StockBadge` for the summary.

## Do / Don't

- Do preselect the first available variant and show its price in the summary.
- Do keep unavailable variants in place and disabled.
- Don't hide prices until a variant is chosen.
- Don't use a `<select>` for 2–6 variants; a long list (> 8) may fall back to `SelectField` with price in each option.
