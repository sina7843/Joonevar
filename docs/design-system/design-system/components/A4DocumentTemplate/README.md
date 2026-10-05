# A4DocumentTemplate

The printed A4 page behind every official document — registration sheet, pedigree, puppy card, mating permit — rebuilt on brand tokens, light theme always, rendered to PDF by Chromium.

Use for `src/documents/render.ts` output and the `/documents/*` print pages (K18). Today's template uses a teal palette; this replaces it with the brand: white page, `border-default` rules, one orange accent strip and the accent bar on headings. Not for on-screen document summaries (DocumentCard) or verification results (VerificationResult).

## Anatomy

Sheet 794×1123 CSS px (A4 at 96 dpi), padding 48/56/40 → 6px `accent-bar` strip across the top edge → **head**: Persian logo lockup (40px) + «سامانه رسمی ثبت سگ و گربه» at the start; document type («برگه ثبتی», `text-brand`), number (`RS-JTFZYEWD`, 18px 800, LTR) and «صادرشده در ۱۲ فروردین ۱۴۰۵» at the end → **title bar**: accent bar + «برگه ثبتی حیوان» (26/40 800) + one-sentence lead; QR placeholder (104px, dashed) captioned «استعلام اصالت» at the end → **sections** (accent-bar title + KeyValueList): مشخصات حیوان (with 168px 3:4 photo or RecordImage empty state), شناسه‌ها (two columns), مالک → **signatures** pinned to the bottom: two signature lines with role + name, one seal circle «مهر انجمن» → **footer**: `shield-check` verify line «برای استعلام اصالت، شماره RS-… را در «استعلام اصالت» همزیست وارد کنید یا کد QR را اسکن کنید.» + «صفحه ۱ از ۱، چاپ ۱۰ مهر ۱۴۰۵».

## CSS API

| Class | Use |
|---|---|
| `.hz-a4` | Fixed 794×1123 sheet, `print-color-adjust: exact`, `color-scheme: light` |
| `__head` · `__brand` (`-sub`) · `__docmeta` · `__doctype` · `__docno` · `__issued` | Header |
| `__titlebar` · `__title` · `__lead` · `__qr` (`-box`, `-cap`) | Title and QR |
| `__section` · `__section-title` | Section with 3px accent bar |
| `__record` · `__photo` | Photo + KeyValueList grid |
| `__kv2` | Two-column KeyValueList (with `.hz-kv`) |
| `__sign` · `__sign-slot` · `__sign-line` · `__sign-role` · `__sign-name` · `__seal` | Signature row (`margin-block-start: auto`) |
| `__foot` · `__verify` | Footer |
| `__stamp` | Rotated overlay for a void copy («باطل‌شده» `REVOKED`, «جایگزین‌شده» `SUPERSEDED`) |

`@media print { @page { size: A4; margin: 0 } }` — margins live inside the sheet so the PDF matches the screen.

## Tokens

`bg-surface` · `text-primary` · `text-secondary` · `text-brand` (doc type only) · `accent-bar` (top strip, title and section bars) · `border-default` (head/foot rules, sheet edge on screen) · `border-subtle` (KV rows) · `border-control` (QR and signature lines) · `bg-media-empty` (photo placeholder) · `icon-default` · `status-error-text` (void stamp) · `logo-*` via the lockup asset.

## Variants & sizes

One size (A4 portrait). Four documents share the frame and change only type, number prefix, title, lead and sections:

| Document | Number | Sections |
|---|---|---|
| برگه ثبتی | `RS-` | animal (photo), identifiers (PET-, microchip, SM-), owner |
| شجره‌نامه | `PD-` | animal + PedigreeTree (3 generations), generation at issue |
| مجوز جفت‌گیری | `MP-` | sire, dam (name, PET-, breed, owner), validity |
| کارت توله | `PC-` | puppy (PUP- code, birth, litter), permit MP-, owner |

## States

Issued (default) · void copy (`__stamp` «باطل‌شده» over the body; number and verify line stay readable) · missing photo (RecordImage empty state «تصویر ثبت نشده») · missing value («—», never blank) · approximate birth date «حدود ۱۴۰۲/۰۱» · **long Persian text**: long names and breeds wrap inside KV values (e.g. «سگ گله آناتولی (کانگال)»); the sheet never grows — content that does not fit moves to a second page with the same head and «صفحه ۲ از ۲». Hover/focus/loading do not apply to the printed sheet; the print page shows a Skeleton until the PDF is ready.

## Mobile ↔ desktop

Print output is independent of the screen. On screen (`/documents/*`), the sheet is scaled to fit the width (`zoom`/`transform` on a wrapper) with «دریافت PDF» and «چاپ» above it; below 768 show the DocumentCard summary and offer the PDF instead of a tiny sheet.

## RTL & LTR

Sheet `dir="rtl"`; numbers, IDs, microchip and foreign names in `<bdi dir="ltr">`. Doc meta sits at the end, logo at the start. An English export would set `dir="ltr"` and keep every class.

## Accessibility

The PDF must be tagged (Chromium `--export-tagged-pdf`) with `lang="fa"`, headings in order (h1 title, h2 sections) and `dl` for fields so screen readers read key/value pairs. The QR has a text alternative (the verify line). Contrast: all text pairs from the Color table; no information only in the orange strip.

## Data

From `documents.json`: `sheetNo`, `issuedAt.longFa`, `animalId` → `animals.json` (`name`, `speciesFa`, `breedFa`, `sexFa`, `birthDate.longFa`, `color`, `generation`/`origin`, `petId`, `microchipNumber`, `registeredAt`), `sampleTrackingCode`, owner `displayName` + `city`. Signers come from the case history (verifying vet, association reviewer). QR encodes the verify URL with the number. Print date = render date. Never print the owner's mobile or national id.

## Code mapping

`src/documents/render.ts` — keep its inputs and Chromium PDF step; replace the HTML/CSS with this template. Proposed ★ `A4Document` (`kind: 'REGISTRATION_SHEET' | 'PEDIGREE' | 'MATING_PERMIT' | 'PUPPY_CARD'`, `number`, `issuedAt`, `title`, `lead`, `sections`, `signers`, `verifyUrl`, `void?: 'REVOKED' | 'SUPERSEDED'`, `page`, `pages`).

## Do / Don't

- Do keep the page white and structured with lines; orange only on the strip and bars.
- Do keep the number, issue date and verify line on every page.
- Don't use the teal palette, a dark theme or background tints in print.
- Don't scale fonts below 11px; split to a second page instead.
