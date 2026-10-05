# VerificationResult

The public answer to «استعلام اصالت»: whether a document number (registration sheet, pedigree, mating permit, puppy card) is valid, revoked, superseded or unknown — showing only the document's public facts.

Use it on `/verify` (SiteShell, signed out) under the identifier search field, and wherever a QR code on a printed document lands. Not for the owner's own document pages (use DocumentCard / the document record) and never as a way to look up people or animals.

## Anatomy

1. **Head** (`role="status"`) — 48px icon disc in the tone (`seal-check` valid · `prohibit` revoked · `arrows-clockwise` superseded · `magnifying-glass` not found) · StatusBadge (معتبر · باطل‌شده · جایگزین‌شده; none for not found) · title sentence · one-line summary that names the document number in `bdi`.
2. **Body** — KeyValueList of public fields (valid / revoked / superseded) or a short checklist for fixing the identifier (not found).
3. **Actions** (not found only) — «استعلام شناسه دیگر» (secondary) · «تماس با پشتیبانی» (ghost).
4. **Foot** (`bg-subtle`) — `lock-simple` «نام، شماره همراه و نشانی مالک نمایش داده نمی‌شود» · time of the check «استعلام: ۱۰ مهر ۱۴۰۵، ۹:۰۰».

## CSS API

css-additions `VerificationResult.css`:

| Class | Role |
|---|---|
| `.hz-verify` | card (white, `border-default`, `radius-xl`) |
| `--valid` · `--revoked` · `--superseded` · `--not-found` · `--loading` | outcome; valid/revoked also tint the card border |
| `__head`, `__icon`, `__text`, `__title`, `__summary` | head |
| `__body` (contains `.hz-kv`), `__hints` | facts or checklist |
| `__actions`, `__foot`, `__private` | actions row, footer with privacy note |

```html
<section class="hz-verify hz-verify--valid" aria-labelledby="v1">
  <div class="hz-verify__head" role="status"><span class="hz-verify__icon">…seal-check…</span>
    <div class="hz-verify__text"><span class="hz-badge hz-badge--success"><span class="hz-badge__dot"></span>معتبر</span>
      <h2 class="hz-verify__title" id="v1">سند معتبر است</h2>
      <p class="hz-verify__summary">برگه ثبتی <bdi class="hz-id" dir="ltr">RS-JTFZYEWD</bdi> برای «رکس» صادر شده و معتبر است.</p></div></div>
  <div class="hz-verify__body"><dl class="hz-kv">…</dl></div>
  <div class="hz-verify__foot">…</div>
</section>
```

## Tokens

`bg-surface`, `bg-subtle` (foot, not-found icon), `border-default`, `border-subtle`, `status-success-*` (valid), `status-error-*` (revoked), `status-neutral-*` (superseded), `icon-default`, `text-secondary`, `radius-xl`.

## Variants & sizes

| Outcome | Status key → label · tone | Fields |
|---|---|---|
| Valid | `VALID` → معتبر · success | type, number, animal (name — species, breed, sex), `PET-` id, microchip (last 4 only), issue date |
| Revoked | `REVOKED` → باطل‌شده · error | type, number, animal name, issue date, revocation date — **no reason** |
| Superseded | `SUPERSEDED` → جایگزین‌شده · neutral | type, number, animal name, issue date, superseded date — **not the new number** |
| Not found | — | identifier echoed + how to check it (prefix + 8 characters; O, I, L, 0, 1 never used) |

One size; the card fills its column (max ≈ 560 on `/verify`).

## States

Loading («در حال استعلام…» with a spinner in the icon disc, `aria-busy`) · the four outcomes · focus-visible on actions (preview: «استعلام شناسه دیگر») · rate-limited/error (proposal: PageStates error inside the same card: «استعلام انجام نشد. چند دقیقه دیگر دوباره تلاش کنید.») · **long Persian text**: the 30-character animal name and long breed wrap inside the KV value at 360px (edge-cases.json; layout test only).

## Mobile ↔ desktop

Same structure at every width. <768: head padding 16, KV key column min 104px, actions wrap to full rows; ≥768: padding 20. On `/verify` the card sits directly under the search field, one column, max 560.

## RTL & LTR

Icon disc at the start; KV keys start, values follow. Every identifier — document number, `PET-` id, masked microchip, prefixes in hints — is `bdi dir="ltr"`. `arrows-clockwise` is not mirrored (it means "replaced", not direction).

## Accessibility

The head is a `role="status"` live region so the outcome is announced after submit; the title is an `h2` under the page's `h1` «استعلام اصالت». Tone is never colour alone: badge text + title sentence. The masked microchip has visible text «(۴ رقم آخر)». Focus moves to the result title after a check on small screens so it is not missed below the keyboard.

## Data

`documents.json`: `registrationSheets[].sheetNo/animalName/petId/microchipNumber/issuedAt`, `pedigrees[].pedigreeCode`, `matingPermits[].permitNo`, `puppyCards[].cardNo`; `verifyExamples` («سند معتبر است — صادرشده برای «رکس»», «سندی با این شناسه پیدا نشد» for `RS-ZZZZZZZZ`). Animal facts from `animals.json`. The sample pack has **no revoked or superseded document**: the preview assigns those outcomes to `PD-475VU8E2` and `RS-7W4CRUM2` with illustrative dates. Never shown: owner name, mobile, national id, address, sample tracking code, payment ids.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/verification/result.tsx`: `VerificationResult({ answer: VerificationAnswer })`, `answer = { state, kindFa, code, issuedAt, animal, noticeFa }`; labels in `VERIFICATION_STATE_FA` (`src/verification/model.ts`). Keep.


`src/verification/result.tsx` — keep its existing props. Map status with the status dictionary (`VALID`, `REVOKED`, `SUPERSEDED`); render `not found` when the lookup returns nothing. Proposed: `maskMicrochip(n)` helper (last 4 digits), `checkedAt` for the foot.

## Do / Don't

- Do show the document number back to the person in every outcome.
- Do keep the privacy note in the foot of every found result.
- Don't show why a document was revoked or the number of its replacement — send the person to the holder.
- Don't show «تعیین‌نشده» or blank rows; omit a field that does not apply (a pedigree has no microchip row).
