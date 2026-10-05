# UnsetValue

The word «تعیین‌نشده» shown wherever a setting or fee has no value yet (`null`) — never «۰», never «رایگان» — and the path that depends on it stays closed.

Use it for the **26 money settings that ship `null`** (advertising packages, licences, marketplace, finder fees) and any other unconfigured setting (deadline days, limits). Don't use it for missing record data — a field the user has not filled is «—» (`hz-kv__value--empty`); a price of zero that an admin really set is a number. The difference matters: «—» says "no data", «تعیین‌نشده» says "the system has not decided yet".

## Anatomy

1. Word — «تعیین‌نشده», SemiBold, `text-secondary`, never wraps.
2. Note (optional) — 12/20 Regular reason under it: «تا تعیین هزینه، خرید بسته باز نیست.»
3. Consequence elsewhere — the dependent button is disabled with a visible reason (never a tooltip).

## CSS API

| Class | Role |
|---|---|
| `.hz-unset` | The word, inline anywhere (sentence, KV value, table cell, price) |
| `.hz-unset--action` | `status-warning-text` — only where the viewer can set it (SUPERADMIN in `/admin/settings`); pair with «تعیین مقدار» |
| `.hz-unset__note` | Optional reason line under the word |
| existing `.hz-price--unset`, `.hz-service__price--unset`, `.hz-setting__value--unset` | Same rule inside Price, ServiceCard and SettingsPanel — keep using them there |

```html
هزینه انتشار آگهی جفت‌یابی <span class="hz-unset">تعیین‌نشده</span> است و پرداختش هنوز باز نیست.
<td class="hz-num"><span class="hz-unset">تعیین‌نشده</span></td>
```

## Tokens

`text-secondary` (6.24:1 on white) · `status-warning-text` (`--action`) · `text-primary` around it.

## Variants & sizes

| Context | Markup | Example |
|---|---|---|
| Inline in a sentence | `.hz-unset` | «هزینه انتشار آگهی جفت‌یابی تعیین‌نشده است …» |
| KeyValueList | `.hz-kv__value > .hz-unset (+ __note)` | «هزینه بسته تبلیغاتی پایه: تعیین‌نشده» next to «میکروچیپ: —» |
| DataTable | `.hz-num > .hz-unset`, end-aligned like amounts | fee table: «صدور شجره‌نامه ۴۰۰٬۰۰۰ تومان» … «بسته تبلیغاتی پایه تعیین‌نشده» |
| Price / ServiceCard | `.hz-price--unset` | «مجوز فعالیت مرکز دامپزشکی — تعیین‌نشده» + disabled «پرداخت» |
| Ops (can set it) | `.hz-unset--action` + secondary «تعیین مقدار» | `licence.centre_issue_toman` |
| StickyActionBar total | `.hz-sticky-bar__total--unset` | payment bar with disabled primary |

Size follows its container (inherits font size).

## States

Static text. The surrounding action is **disabled** with `aria-describedby` → a visible reason; focus-visible lands on «تعیین مقدار» in ops. Sorting: `null` sorts **last** in both directions. Filtering: ops panels offer «فقط تعیین‌نشده (۲۶)». Long Persian text: the label next to it wraps; «تعیین‌نشده» itself never breaks.

## Mobile ↔ desktop

Identical. In card lists (mobile tables) it sits in the amount slot of the card row.

## RTL & LTR

Persian word; end-aligned in numeric columns (`hz-num`, `text-align: end`). Setting keys next to it are Latin in `<bdi dir="ltr">`.

## Accessibility

- It is real text, read as-is; don't hide it behind an icon or an empty cell.
- Never encode it with colour only — the word carries the meaning; `--action` colour is extra.
- The disabled payment button references the reason so screen readers hear why.

## Data

Source: `src/settings/keys.ts` money settings (`*_toman`) — 7 configured in samples (e.g. `fee.pedigree_toman` → «۴۰۰٬۰۰۰ تومان»), 26 `null`. Rule: `value === null` → UnsetValue; `0` → «۰ تومان» only if an admin explicitly saved zero. Formatters must not coerce `null` to `0` (`Number(null) === 0` is the bug to guard). Key names in the preview's ops row are illustrative (same as SettingsPanel).

## Code mapping

★ New — proposed `UnsetValue` in `src/ui/format.tsx` (or beside the money formatter): `formatToman(value: bigint | null)` returns «۴۰۰٬۰۰۰ تومان» or `<UnsetValue />`; props `actionable?: boolean` (→ `--action`), `note?: string`. ServiceCard, ListingCard, Price, SettingsPanel and payment buttons consume the same formatter.

## Do / Don't

- Do show «تعیین‌نشده» and close the payment path.
- Do keep «—» for empty record fields; don't mix the two.
- Don't print «۰ تومان», «رایگان» or a blank cell for `null`.
- Don't explain the unset state only in a tooltip.
