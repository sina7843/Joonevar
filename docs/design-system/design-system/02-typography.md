# تایپوگرافی — Typography

One family, **IRANSansX 3.000** (fontiran.com), 11 static weights in `fonts/`. Stack: `"IRANSansX", Tahoma, system-ui, sans-serif`. Do **not** use the FaNum build (it renders Latin identifiers as Persian digits) and leave the `DOTS` axis at its default.

| Weight | File | CSS weight | Used for |
|---|---|---|---|
| Regular | IRANSansX-Regular.woff2 | 400 | Body, captions |
| Medium | IRANSansX-Medium.woff2 | 500 | Nav items, pull quotes |
| DemiBold | IRANSansX-DemiBold.woff2 | 600 | Small labels, table headers, badges |
| Bold | IRANSansX-Bold.woff2 | 700 | **All headings (direction A)**, buttons |
| ExtraBold | IRANSansX-ExtraBold.woff2 | 800 | Article title only |
| Black | IRANSansX-Black.woff2 | 900 | The wordmark «همزیست» only — not for UI text |
| Thin · UltraLight · Light · ExtraBlack (950) · Heavy (1000) | … | 100–300, 950, 1000 | Shipped for completeness; not used in UI |

## Scale

Headings are Bold 700 with a generous line height (Persian ascenders and dots need ≥1.4 on headings, ≥1.6 on body).

| Style | Desktop ≥1024 | Mobile <768 | Use |
|---|---|---|---|
| display | 44 / 64 · 700 | 28 / 44 · 700 | Home hero only |
| h1 | 32 / 48 · 700 | 24 / 38 · 700 | Page title, record header |
| **h2** | 24 / 38 · 700 | 20 / 32 · 700 | Section title with `accent-bar` |
| h3 | 20 / 32 · 700 | 18 / 30 · 700 | Panel title |
| h4 | 16 / 26 · 700 | 16 / 26 · 700 | Card title, list-item title |
| body-lg | 18 / 32 · 400 | 16 / 28 · 400 | Lead paragraph |
| body | 16 / 28 · 400 | 15 / 26 · 400 | Default body (SiteShell, PublicShell) |
| body-sm | 14 / 24 · 400 | 14 / 24 · 400 | OpsShell body, tables, helper text |
| label | 15 / 24 · 700 | 15 / 24 · 700 | Buttons 44–48px, tabs |
| label-sm | 13 / 20 · 600 | 13 / 20 · 600 | 36px buttons, dense field labels, table headers |
| caption | 12 / 20 · 400 | 12 / 20 · 400 | Meta, timestamps, counters |
| overline | 12 / 20 · 700 | 12 / 20 · 700 | Category tags, status labels |
| numeric-lg | 36 / 52 · 700 | 26 / 40 · 700 | Stat tiles, queue counts |

Tablet (768–1023) uses the mobile heading sizes and the desktop body sizes.

**OpsShell** uses the same scale one step denser: page title `h3`, panel titles `h4`, body `body-sm`.

## Long form — articles (separate from interface text)

| Style | Value | Use |
|---|---|---|
| article-title | 36 / 56 · 800 (mobile 28 / 44) | Headline on `/articles/[slug]` |
| article-h2 | 24 / 40 · 700 | Headings inside `RichText` |
| article-body | 17 / 34 · 400 | Reading text; measure ≤ 720px (`container-reading`), paragraph spacing 1.25em |
| article-quote | 20 / 36 · 500 | Pull quote with `accent-bar` at the start |
| article-caption | 13 / 22 · 400 | Figure caption and image source |

## Numbers in columns

IRANSansX's **Latin digits are tabular; Persian digits are proportional**, so Persian amounts do not align by themselves.

- Align numeric columns (money, counts, dates) to the **end** of the cell, so the units digit lines up.
- Put the unit in the header («مبلغ (تومان)») in dense tables so cells hold digits only.
- Try `font-variant-numeric: tabular-nums` in the build; IRANSansX 3.000 does not tabulate Persian digits, so end-alignment is the rule regardless.
- Identifiers (Latin) are tabular and can be start-aligned in a monospace-like column.

## Latin and identifiers

- `id` style 13 / 20 · 600 for `PET-8JDUN4GH`, `HZP-…`, microchip and mobile numbers, always in `<bdi dir="ltr">`. The longest identifier, `HZP-` + 16 characters, fits one line at 360px at this size.
- `latin-body` is **reserved** for multilingual: IRANSansX covers basic Latin only (2 of 64 Latin-1 characters, no Latin Extended). When English or other languages arrive, a Latin pair font is chosen and set here; the token names do not change.
- All widths must survive **30% longer** text (English, German).

## Do / don't

- Do build hierarchy with size and weight — `text-primary` and `text-secondary` are only 1.81:1 apart.
- Do keep headings to two lines; truncate card titles at two lines with an ellipsis and show the full title on the detail page.
- Don't use Black or ExtraBlack for UI text; don't letter-space Persian; don't use italics (Persian has none).
