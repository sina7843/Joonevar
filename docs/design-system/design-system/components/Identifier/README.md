# Identifier

A Latin identifier (record id, code, microchip, mobile) isolated inside Persian text with `<bdi dir="ltr">`, optionally labelled and with a copy button.

Use it for every system id: `PET-`, `RS-`, `PD-`, `MP-`, `PC-`, `PUP-`, `SM-`, `HZ-`, `HZP-`, `HZR-`, microchip numbers and mobiles. Use the copy button where users must type or read the id elsewhere (payment reference, referral code at the vet, sample tracking). `membershipNo` («A-14051») is free text typed by the association, not a generated id: isolate it with `bdi` but give it no copy button and no id styling.

## Anatomy

1. Optional label `__label` («شماره برگه ثبتی:»), 13px `text-secondary`
2. Value in `<bdi dir="ltr">`, 13/20 weight 600, letter-spacing 0.02em, never wraps
3. Optional copy `IconButton` (`copy` icon, `aria-label="کپی شناسه"`), 32px — 44px on coarse pointers

## CSS API

| Class | Role |
|---|---|
| `.hz-identifier` | inline-flex wrapper |
| `.hz-identifier__label` | leading label |
| `.hz-identifier bdi` | the value (LTR, isolated, nowrap) |
| `.hz-identifier .hz-icon-btn` | copy button (32 / 44 coarse) |
| `.hz-id` | the same type style for an id inside running text without the wrapper |

```html
<span class="hz-identifier">
  <span class="hz-identifier__label">شماره برگه ثبتی:</span><bdi dir="ltr">RS-JTFZYEWD</bdi>
  <button type="button" class="hz-icon-btn" aria-label="کپی شناسه"><svg class="hz-icon hz-icon--sm" …copy…></svg></button>
</span>
<p>برگه ثبتی <bdi class="hz-id" dir="ltr">RS-JTFZYEWD</bdi> برای «رکس» صادر شد.</p>
```

## Tokens

`text-primary` (value), `text-secondary` (label), `icon-default` (copy), `status-success-text` (copied check), `focus-ring`. Font: IRANSansX (Latin glyphs) — never the FaNum build.

## Variants & sizes

- **Inline in a sentence** (`.hz-id`) · **without copy** · **with copy ★** · **with label**.
- In a `KeyValueList` the key is the label, so drop `__label`.
- One size (13px); in record headers the id stays 13px next to the larger title.

## States

- **Default** · **hover** (pointer only): copy button gets `action-secondary-hover` · **focus-visible**: 2px `focus-ring` ring on the button.
- **Copied:** icon swaps to `check` in `status-success-text` for 2 s and a polite live region says «کپی شد» (until the Toast ★ ships).
- **Copy failed** (no clipboard permission): select the text and announce «شناسه را انتخاب و کپی کنید».
- **Empty:** no id yet → «—» or a helper sentence («— پس از صدور برگه ثبتی»), styled `hz-kv__value--empty`; never an empty copy button.
- **Longest id:** `HZP-q3Xv9_Lk2Rt7mWbA` (20 characters) with label and copy fits one line in a 360px content width.

## Mobile ↔ desktop

Identical at all widths. <768 and coarse pointers: copy target grows to 44px. In card lists the id sits on its own row under the title.

## RTL & LTR

`<bdi dir="ltr">` isolates the run, so «RS-JTFZYEWD» never flips its hyphen or swaps with neighbouring Persian words. Copy button comes after the value at the inline end (left in RTL). No mirroring of the `copy` icon. In LTR the markup is unchanged.

## Accessibility

- Copy button: `aria-label="کپی شناسه"`; screen readers read the id from the `bdi` first.
- Announce success in a `role="status"` region; don't move focus.
- Don't letter-space with spaces or hyphens added for "readability" — the value must be copyable as stored.

## Data

`petId`, `sheetNo`, `pedigreeCode`, the mating-permit number (`MP-`), `sampleTrackingCode`, `code` (`HZ-`), `reference` (`HZP-`), `microchipNumber` (15 digits), `mobile` (`0999…`). Alphabet `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, except base64url payment/refund ids (mixed case, `_`). Missing → «—».

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/status.tsx`: `Identifier({ value, label? })`. Confirmed; add `copyable?` and `emptyText?`.


`src/ui/status.tsx` — `Identifier`. Keep the current value prop; proposed: `value: string`, `label?: string`, `copyable?: boolean`, `emptyText?: string`. Copy uses `navigator.clipboard.writeText(value)`.

## Do / Don't

- Do isolate every Latin id with `bdi`, even inside a badge-free sentence.
- Do show the full id; never truncate with an ellipsis.
- Don't convert id digits to Persian digits; don't use the FaNum font.
- Don't add a copy button to ids users never need to retype (internal row ids).
