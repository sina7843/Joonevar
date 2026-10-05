# DocumentCard

An issued Hamzist document — برگه ثبتی, شجره‌نامه, مجوز جفت‌گیری or کارت توله — with its number, issue date, PDF download and a link to the public verify page.

Use on `/documents`, in the «اسناد» section of an animal record and on the dashboard after an issue. Not for the A4 print layout (Print documents group), not for a request that will produce a document (`RequestCard`), and not for the ops document viewer (`DocumentPreview`).

## Anatomy

1. Type icon (md) in a 44px `bg-subtle` square, `radius-md` — **one icon per type** (approved 11 Mehr 1405): برگه ثبتی `file-text` · شجره‌نامه `tree-structure` · مجوز جفت‌گیری `handshake` · کارت توله `paw-print`.
2. Type — Bold 16/26: «برگه ثبتی» · «شجره‌نامه» · «مجوز جفت‌گیری» · «کارت توله».
3. Subject — animal name + `PET-` id; for a permit «آرا (نر) × تارا (ماده)»; for a puppy card the puppy name.
4. Badge (optional) — only when the document is not simply valid: not yet issued, superseded, revoked.
5. Facts — `KeyValueList`: «شماره سند» as `Identifier` with copy, «تاریخ صدور» (Jalali, long form).
6. ActionOwner (only while not issued) — «اقدام بعدی با: طرف مقابل».
7. Footer — start: «دریافت PDF» (secondary sm, `download-simple`); end: «استعلام اصالت» (TextLink standalone, `shield-check`).

## CSS API

New in `css-additions/DocumentCard.css`: `.hz-document`, `__head`, `__icon`, `__titles`, `__type`, `__subject`, `__note`. Composes `.hz-card`, `.hz-kv`, `.hz-identifier`, `.hz-owner`, `.hz-card__footer`, `.hz-btn--secondary.hz-btn--sm`, `.hz-link--standalone`, `.hz-field__error`.

```html
<article class="hz-card hz-document">
  <div class="hz-document__head">
    <span class="hz-document__icon"><svg class="hz-icon hz-icon--md" …file-text…></svg></span>
    <div class="hz-document__titles">
      <h3 class="hz-document__type">برگه ثبتی</h3>
      <span class="hz-document__subject">رکس، <bdi class="hz-id" dir="ltr">PET-8JDUN4GH</bdi></span>
    </div>
  </div>
  <dl class="hz-kv">
    <div class="hz-kv__row"><dt class="hz-kv__key">شماره سند</dt><dd class="hz-kv__value"><span class="hz-identifier"><bdi dir="ltr">RS-JTFZYEWD</bdi><button class="hz-icon-btn" aria-label="کپی شماره سند">…</button></span></dd></div>
    <div class="hz-kv__row"><dt class="hz-kv__key">تاریخ صدور</dt><dd class="hz-kv__value">۱۲ فروردین ۱۴۰۵</dd></div>
  </dl>
  <div class="hz-card__footer">
    <a class="hz-btn hz-btn--secondary hz-btn--sm" href="…/pdf" download>…دریافت PDF</a>
    <a class="hz-link hz-link--standalone" href="/verify?no=RS-JTFZYEWD">…استعلام اصالت</a>
  </div>
</article>
```

## Tokens

`bg-surface`, `border-default`, `border-subtle`, `bg-subtle`, `icon-strong`, `text-primary`, `text-secondary`, `text-brand`, `border-control`, `status-info-*` / `status-neutral-*` / `status-error-*` (badge), `status-error-text` (PDF error), `radius-xl`, `radius-md`, `focus-ring`.

## Variants & sizes

| Type | Prefix | Subject |
|---|---|---|
| برگه ثبتی | `RS-` | animal name + `PET-` |
| شجره‌نامه | `PD-` | animal name + `PET-` |
| مجوز جفت‌گیری | `MP-` | «نر × ماده» |
| کارت توله | `PC-` | puppy name (`PUP-` temp code if unnamed) |

- **Issued** — no badge (validity is checked on `/verify`, not asserted by the card).
- **Not yet issued** (permit `AWAITING_COUNTERPARTY`) — badge «در انتظار تأیید طرف مقابل» (info), number «— پس از صدور مجوز», date row becomes «تاریخ درخواست», ActionOwner, footer link «پیگیری درخواست HZ-…»; no PDF, no verify.
- **Superseded / revoked** (not in sample data) — `SUPERSEDED` «جایگزین‌شده» (neutral) or `REVOKED` «باطل‌شده» (error) badge; PDF stays downloadable, verify shows the current state.
- One size. Grid: 1 column <768, 2 columns ≥768.

## States

- **Default** — card is not a link; its two actions are. **Hover** (pointer): button/link hover only.
- **Focus-visible** — ring on the button, copy button or link (preview: «استعلام اصالت»).
- **Loading** — PDF generated on demand: button `aria-busy="true"` + spinner, «در حال آماده‌سازی PDF…»; list loading uses card skeletons.
- **Error** — PDF failed: `.hz-field__error` under the footer with `role="alert"`, «فایل PDF آماده نشد. چند دقیقه دیگر دوباره دریافت کنید؛ سند معتبر است و تغییری نکرده.»; button becomes «دریافت دوباره PDF» (`arrow-clockwise`).
- **Disabled** — never; an unavailable action is removed and the reason stated.
- **Empty list** — `EmptyState` «هنوز سندی صادر نشده است» + «ثبت حیوان».
- **Long Persian text** — subject wraps (`overflow-wrap: anywhere`); a long badge drops below the titles (head wraps).

## Mobile ↔ desktop

<768 one column, footer stays one row (button + link) down to 320px and wraps below. 768–1023 two columns. ≥1024 two columns in the PublicShell content column; card padding 24. Copy button grows to 44px on coarse pointers (Identifier rule); below 768 render the PDF button at the default size (`control-md`) instead of `--sm` so the target is ≥ 44px.

## RTL & LTR

Icon square at the start. All numbers (`RS-…`, `PET-…`, `HZ-…`) are Latin in `<bdi dir="ltr">`; dates Persian digits. `download-simple`, `shield-check` and the four type icons are not mirrored; «پیگیری درخواست» uses `arrow-right` + `hz-icon--mirror`.

## Accessibility

- `<article>` with the type as `<h3>`; facts are a `<dl>`.
- Copy button `aria-label="کپی شماره سند"`; confirmation «کپی شد» in a `role="status"` region (Identifier).
- PDF link has `download` and the file name contains the number; loading button keeps its text.
- The error is `role="alert"` and names cause and next step.

## Data

`documents.json`: `registrationSheets[]` (`sheetNo`, `animalName`, `petId`, `issuedAt.longFa`), `pedigrees[]` (`pedigreeCode`, `animalName`, `issuedAt`; `generationAtIssue` is not shown on the card), `matingPermits[]` (`permitNo` nullable, `status`, `sireName`, `damName`, `issuedAt`/`createdAt`), `puppyCards[]` (`cardNo`, `puppyName`, `issuedAt`). Verify texts: `verifyExamples[]`. The long-name card in the preview reuses `PC-S3RRHVNQ` with the edge-case name «شاهزاده کوچولوی باغ ارم شیراز» (constructed).

## Code mapping

★ New — proposed `DocumentCard` in `src/ui/card.tsx`: `kind: 'REGISTRATION_SHEET' | 'PEDIGREE' | 'MATING_PERMIT' | 'PUPPY_CARD'`, `number: string | null`, `subject`, `petId?`, `issuedAt?`, `requestedAt?`, `status?` (status-dictionary key), `actionOwner?`, `pdfHref?`, `verifyHref?`, `requestHref?`. Type labels come from the code's enum labels («برگه ثبتی», «شجره‌نامه», «مجوز جفت‌گیری», «کارت توله»).

## Do / Don't

- Do link «استعلام اصالت» to the public `/verify` result for that number, so the owner can share it.
- Do keep the number copyable; owners read it out on the phone.
- Don't show a success «معتبر» badge on every card — validity is the verify page's job.
- Don't show a disabled PDF button for an unissued document; say when it will exist.
- **Decided (11 Mehr 1405):** one icon per type (see Anatomy 1), so a mixed list scans by shape as well as by title.
