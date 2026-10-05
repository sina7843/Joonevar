# KeyValueList

A definition list of label → value rows for the details of one record: an animal file, a document, an order, a payment.

Use it inside a Card on every record page (pattern P6), in the decision desk and in receipts. Do not use it for collections of records (that is DataTable ↔ CardList) or for editable settings (that is the settings row `.hz-setting`).

## Anatomy

1. `<dl class="hz-kv">` — grid container.
2. Row `.hz-kv__row` — a two-column grid (key ≥104px / 36%, value the rest) with a `border-subtle` hairline under it.
3. Key `<dt class="hz-kv__key">` — 13/22, `text-secondary`.
4. Value `<dd class="hz-kv__value">` — 14/24 SemiBold, `text-primary`; may contain a StatusBadge, an Identifier, a link.
5. Empty value `.hz-kv__value--empty` — Regular, `text-secondary`.

## CSS API

| Class | Purpose |
|---|---|
| `.hz-kv` | One column at every width |
| `.hz-kv--2col` | Two columns of rows **from 1024px**; below 1024 it is the same single column |
| `.hz-kv__row` / `__key` / `__value` | Row, label, value |
| `.hz-kv__value--empty` | «—» or «ثبت نشده» style |

```html
<dl class="hz-kv hz-kv--2col">
  <div class="hz-kv__row"><dt class="hz-kv__key">شناسه حیوان</dt><dd class="hz-kv__value"><bdi class="hz-id" dir="ltr">PET-8JDUN4GH</bdi></dd></div>
  <div class="hz-kv__row"><dt class="hz-kv__key">شماره میکروچیپ</dt><dd class="hz-kv__value hz-kv__value--empty">ثبت نشده</dd></div>
</dl>
```

## Tokens

`text-secondary` (key, empty value) · `text-primary` (value) · `border-subtle` (row hairline) · spacing 10 (row padding), 12 (key–value gap), 32 (column gap in 2col).

## Variants & sizes

- **single column** — mobile, side columns, documents and receipts.
- **2col** — record pages at ≥1024 with ≥6 rows. The preview is rendered at 1280px to show it; at the default 900px frame the same markup would be one column. Rows flow row-by-row (start column, then end column), so put related pairs side by side (نام | شناسه حیوان), not one under the other.
- No size variants; in OpsShell the same 14/24 value is used (it is already dense).

## States

- **default** — as above.
- **hover / focus / active / disabled** — the list is static; links or copy buttons inside a value carry their own states.
- **loading** — keep keys, replace values with `hz-skeleton--text` (width ~40%).
- **error** — a failed record load replaces the whole card body with `hz-state--error`; never show half a list.
- **empty value** — «—» when the field does not apply yet (no `petId` on a draft), «ثبت نشده» when it applies but nobody has entered it (microchip not implanted). Never a blank cell, never ۰.
- **long Persian text** — values wrap (`overflow-wrap: anywhere`); the key stays top-aligned (baseline) to the first line. Long names («شاهزاده کوچولوی باغ ارم شیراز»), breeds with a parenthesis, correction reasons all wrap.

## Mobile ↔ desktop

- <768: one column; key column min 104px so «کد رهگیری نمونه» fits on one line at 360px.
- 768–1023: one column (cards are narrower than full width here).
- ≥1024: `--2col` gives two columns with a 32px gap; side-column cards stay single.
- No touch targets in the list itself; a copy button in an Identifier value grows to 44px on coarse pointers.

## RTL & LTR

Grid order handles direction: key at the start, value at the end. Latin identifiers, microchip and mobile numbers are `<bdi class="hz-id" dir="ltr">` so `PET-8JDUN4GH` never reorders. Dates are Jalali with Persian digits («۲۲ فروردین ۱۴۰۲»); approximate dates keep the «حدود» prefix («حدود ۱۴۰۲/۰۱»).

## Accessibility

- Real `<dl>/<dt>/<dd>`; the wrapping `<div>` per row is valid HTML and keeps pairs together for screen readers.
- Give the list a heading (SectionHeader or card title) so it is reachable by heading navigation.
- «—» is read as a dash; for clarity add `<span class="hz-visually-hidden">ثبت نشده</span>` next to a bare «—» if the field matters (e.g. شناسه حیوان on a draft).

## Data

Animal record (`animals.json` ← `src/db/schema` `animal`): `name`, `speciesFa`·`breedFa`, `sexFa`, `birthDate.longFa` (+ `birthDateApproximate` → «حدود»), `color`, `petId`, `microchipNumber`, `registeredAt.longFa`, status → StatusBadge. Registration sheet (`documents.json`): `sheetNo`, `animalName` + `petId`, `sampleTrackingCode`, `issuedAt.longFa`; payment reference `HZP-…` from `requests-and-payments.json`. `null` → empty-value style as above.

## Code mapping

★ New. Proposed `src/ui/key-value-list.tsx`: `KeyValueList` — `items: { key: string; label: string; value: ReactNode | null; emptyLabel?: 'dash' | 'notRecorded' }[]`, `columns: 1 | 2` (2 = `--2col`, only applies ≥1024), `loading?: boolean`. Today record pages hand-roll `<dl>`/grids; replace them.

## Do / Don't

- Do order rows by what the user checks first (identity, then dates, then documents).
- Do keep identifiers in `bdi` and dates Jalali.
- Don't leave a value blank or write ۰ for "not set".
- Don't put actions as values except a single link or copy button; actions belong in the card footer.
