# Approved decisions — everything the product owner has settled

Use this list to settle any conflict between this pack, the audit and older documents or DEC entries in the repo. Each line names where the full rule lives. Rules marked **NEW** are newer than the App code (commit `6d4ac9f`).

## Source and version

- **NEW · Design system v1.0.4 is the only visual source.** It replaces v1.0.3, which `DEC-0225` names; record a new DEC that supersedes it.
  - The full package is in `hamzist-design-system-v1/`. The live links are in `README-FOR-CLAUDE-CODE.md`.
- **Fidelity is close (DEC-0259).** Each page follows its pattern P01–P12 and its key screen K1–K19 at 390 and 1440: same structure, order, components, density and states.
- **Product behaviour is unchanged unless a decision below or a DEC changes it.** Behaviour comes from Requirements.md, D01–D19 and the flows.

## Home page `/` (K1)

| # | Decision | Where |
|---|---|---|
| 13 · **NEW** | The home page is a column of rounded frames: white / cream alternating, Hero peach, no full-bleed band. Order: «تازه‌ها» → Hero → «دنبال چه می‌گردید؟» → «نژادهای سگ» (featured breed «نژاد این ماه» + 5 tiles) → «بازار همزیست» (4 listings + 4 products) → «دامپزشکان و مراکز معتمد» (4 vets + 3 centres) → «انجمن‌ها و کلاب‌ها» (4 `ClubCard --cover`) → «همزیست در یک نگاه» (4 counts + 3 steps; no separate «روش کار») → «خدمات همزیست» → `CtaBand --media`. | `patterns/P01-editorial-home.md`, `CHANGELOG.md` v1.0.4, `key-screens/html/K01-home-*.html` |
| 13 · **NEW** | On phones, card rows are swipe rows **inside the frame padding**: the first and last card never touch the frame edge, and the next card peeks. | `bundle.css` `.hz-row`, P01 › Layout |
| 14 · **NEW** | **No fee on any public page.** DEC-0186 stays. On K1, the «خدمات همزیست» cards have no price footer, no «تعیین‌نشده» and no fee note, and the section link is «مشاهده همه» → `/services`. Fees appear only on signed-in pages and in the payment flow. This overrides the fee part of finding KPUB-010. | `zz-checklist.md` › decision 14, P01 item 10, `ServiceCard/README.md` |
| — | DEC-0186's **home order** (data sections before services) is replaced by the K1 order above. Its **no-fee rule** stays (decision 14). | this file |
| v1.0.3 | «ورود / ثبت‌نام» (and «پنل من») is a **primary `sm` button with the filled `user` icon**. The mobile menu foot button is primary too. It is site chrome and does not count toward the one-primary rule. | `SiteShell/README.md`, `04-iconography.md` |
| v1.0.3 | «دنبال چه می‌گردید؟» keeps 5 tiles: دامپزشکان، مراکز دامپزشکی، نژادهای سگ، بازار فروش حیوان، فروشگاه کالا. There is no search field and no «استعلام اصالت» tile: search is in the header, and the Hero has the verify form. | P01 item 4 |
| v1.0.4 | Featured breed and CtaBand photo are home settings, each with a fallback. | P01 items 5 and 11 |

## Design-system decisions of 11 Mehr 1405

These are in `design-system/zz-checklist.md` › Decisions.

| # | Decision |
|---|---|
| 1 | Stale-decision alert is **warning (amber)**. |
| 2 | Statuses added to the dictionary: `PROPOSED`, `ACCEPTED`, `DECLINED`, `CODE_ISSUED`, `CLOSED`, stock keys, `FINDER_*`, and the `TRUSTED` mark. The dictionary has **81 keys**, one label and one tone for every viewer. |
| 3 | Content report (K16) keeps «نگه داشتن · پنهان کردن · برداشتن». The identity desk keeps «تأیید · نیازمند اصلاح · رد». |
| 5 | Brand: `cream-50` icon ground, minimum logo height 26px, full-colour favicon, «Hamzist». **App icon option A.** |
| 6 | Copy written by the designer is approved as written. |
| 7c | A second pedigree is not possible (P06, LockedServiceCard). |
| 7d | Finder READY and payout use separate keys (`FINDER_*`). |
| 7e | Each shop ships its own sub-order. Shipping is the sum of each shop's fee. |
| 7f | Reserved stock can never exceed stock on hand. |
| 7g | **Fixed price removed.** Every listing has an asking amount + «قابل مذاکره» and accepts offers. This decides findings CMPA2-036 and KPUB-029. |
| 8 | Toast 4 s / 5 s / 8 s undo, errors stay. Countdown is amber at ≤ 3 days and red only after the deadline. Low stock is ≤ 5 (admin setting). No bulk approve/reject for identity or document cases. Type the document number to revoke. |
| 9 | Data-model additions approved: image focal point, article image caption / credit / source, variant option name, shop logo. |
| 10 | BreedCard has 5 meters, with size and coat as facts. Expired-licence centres are hidden from public results. One icon per document type. Rating stars are ink. Club scope is «کشوری». |
| 11 | «ثبت دریافت نمونه» is a bulk action on `/genetics/samples` (K19). |
| 12 | Ink alpha: shadows 12–24% and `overlay-scrim` 48% of `#3A3B36`. No new colour. |

## Fonts, brand and imagery

- **Fonts:** only **IRANSansX**, everywhere, including PDFs.
  - Use the 11 woff2 files from `design-system/fonts/`, copied to `public/fonts/`.
  - No FaNum build, no Google Fonts, no other family.
  - The full Pro family in `hamzist-design-system-v1/fonts/` stays out of the repo.
  - Rule: CLAUDE-CODE-DESIGN-SYSTEM-RULES §1.8.
- **Logo and brand:** use only the files in `design-system/assets/brand/`, under the stable names in `brand.md`.
  - Each place uses the lockup and height that `brand.md › Usage per shell` gives it.
  - The app icon is option A.
  - The manifest uses `#FFFCF8`.
  - The name is always «همزیست».
  - Rule: §1.9.
- **Photos:** the 78 approved photos, each where `demo-content/images-manifest.json` puts it, with its Persian alt text. No remote or stock images.
- **Stylesheets:** `src/ui/design-system/bundle.css` and `tokens.css` are unchanged copies of the package files. Only the `@font-face` URLs may differ. Rule: §1.10.

## Product-owner confirmations already in the repo

- **DEC-0230:** the «اقدام بعدی با» team labels for the market queues are confirmed (GAPS #11).
- **DEC-0186:** no fee on public pages. Confirmed again as decision 14.

## Not now (backlog)

- Dark theme.
- Article reading tools: progress bar, share, save, comments, likes.

## How to treat older notes in the repo

- A **GAPS.md row or DEC that was a technical shortcut** does not override the design system. Examples: one OTP input instead of six boxes (GAPS #9), raw status codes kept for tests (GAPS #14). Implement the design, update the tests, and close the row.
- A **product-owner decision** does override the design: DEC-0186 / decision 14, DEC-0230, and every decision above.
- An item that needs new data or behaviour waits for an answer in `DECISIONS-NEEDED.md`.
