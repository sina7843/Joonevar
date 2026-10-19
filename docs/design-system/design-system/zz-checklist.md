# Acceptance & code handoff — معیار پذیرش و تحویل به کد

The pack's acceptance checklist (09), checked item by item at final delivery (10 Mehr 1405). ✓ = met and verified · ◐ = met with a note or an open decision · ✗ = not met. Open product-owner decisions are collected at the end.

## Checkpoint 1 — visual direction

| Item | | Evidence |
|---|---|---|
| 2–3 directions × 3 anchor screens × 390 / 1440 | ✓ | Canvas «Hamzist — Visual Directions»: A, B, C × home, dashboard, KYC desk × 2 sizes (18 frames). |
| Real IRANSansX, not a substitute | ✓ | Fonts from `fonts/`, loaded in every frame and preview. |
| Real SVG logo, current palette, no unmarked new colour | ✓ | Wordmark rebuilt from IRANSansX Black outlines, symbol verbatim. |
| Home sections from code (8) | ✓ | K1 follows `app/(public)/page.tsx`; redesigned and approved 22 Mehr 1405 (v1.0.4): framed sections, market, vets and centres added (P01). |
| Persian digits, Toman, Jalali | ✓ | Rules in *Content*; helpers in `components/bundle.js`. |
| Decision desk dense and working | ✓ | K3 + DecisionDesk. |
| One-line description per direction | ✓ | Canvas row titles. Direction **A «دفتر رسمی»** approved, with B's radii. |

## Checkpoint 2 — foundations

| Item | | Evidence |
|---|---|---|
| 27-colour palette kept (text `ink-900`) | ✓ | *Color*. |
| New colours listed separately with reason | ✓ | None added. Alpha uses of ink (shadows 12–24%, `overlay-scrim` 48%) approved 11 Mehr 1405 — *Color*. |
| Primitive + semantic layers; components semantic-only | ✓ | `tokens.json`; render checks reject hex/primitive use in previews. |
| Semantic layer ready for dark | ✓ | `dark` theme defined (inherits light until values are set). |
| Code-token → new-name mapping table | ✓ | *Color*. |
| Three-orange rule (no text in `#E46A1D` / `#C94F12`) | ✓ | `text-brand` = orange-700 everywhere; orange-600 only as primary fill. |
| Computed contrast table | ✓ | *Color* (every text/ground and mark/ground pair). |
| Field border `#938980` ≥ 3:1 | ✓ | `border-control` 3.43:1 on white. |
| Type scale display → caption incl. h2, mobile + desktop | ✓ | *Typography*, TextStyles. |
| Long-form style separate | ✓ | `article-*` styles, ContentDetail. |
| Numeric column alignment with Persian digits | ✓ | `.hz-num` tabular figures, end-aligned (DataTable). |
| Latin scale reserved | ✓ | Typography group "Latin & identifiers". |
| Spacing to 96, one grid/breakpoint set for all shells | ✓ | *Layout*, *Shells* (360/768/1024/1440; 4/8/12 columns). |
| Radius, borders, elevation (shadow only on overlays) | ✓ | *Layout*. |
| Phosphor, sizes, directional list | ✓ | *Iconography*; `.hz-icon--mirror`, nested-LTR safe. |
| Motion: durations, easing, reduced motion | ✓ | *Motion*; bundle.css disables animation under `prefers-reduced-motion`. |
| Status dictionary: 75 · 6 families · 5 tones · 7 approved changes · 11 approved additions + trust mark | ✓ | *Status dictionary* (scoped sets for sub-orders, stock, offers, delivery code, chat, finder, payment). |

## Checkpoint 3 — components and shells

| Item | | Evidence |
|---|---|---|
| Every P0 and P1 row of 03 built (P2 too) | ✓ | 123 rows → 129 component folders (shells at 3 breakpoints). |
| Anatomy, tokens, variants, sizes | ✓ | Each `components/<Name>/README.md`. |
| All states incl. long Persian text | ✓ | Previews show default/hover note/focus/disabled/loading/error/empty/long text. |
| Mobile and desktop behaviour explicit | ✓ | README "Mobile ↔ desktop" sections; previews pinned to a layout width. |
| Start/end only | ✓ | Render check flags any left/right; none remain in bundle.css or previews. |
| No hex in specs | ✓ | READMEs and previews checked. |
| ARIA, keyboard, focus order | ✓ | README "Accessibility" sections. |
| Mapping to code components/props | ✓ | Verified against the App repository (commit `74fbfb7`): every component README states the real file, export and props, and what to keep or add. Summary in *Code handoff* below. |
| Real Persian sample text | ✓ | From `sample-content/`; copy written by the designer approved on 11 Mehr 1405. |
| Three shells × mobile/tablet/desktop | ✓ | SiteShell, PublicShell, OpsShell (+Tablet, +Mobile). |
| 16 public sections grouped | ✓ | GroupedNav: 5 groups + «استعلام اصالت». |
| PublicShell real desktop layout | ✓ | 264px sidebar + top bar, content to 1200. |
| OpsShell grouped, collapsible, 5–24 items | ✓ | OpsShell (24), OpsShellTablet (rail), OpsShellMobile (5); rules in *Shells*. |
| Role switcher shows only active roles | ✓ | RoleSwitcher. |

## Final delivery

| Item | | Evidence |
|---|---|---|
| 12 patterns, mobile + desktop + states | ✓ | *Patterns* P01–P12. |
| 18 key screens × 2 sizes = 36 frames | ✓ | Canvas «همزیست — صفحه‌های کلیدی و برند»: 36 frames + 3 extra state frames (K2 new user, K2 ops role, K15 edit). |
| A hard case on every screen | ✓ | Listed on the canvas overview board. |
| 6 operator/admin screens at the same quality | ✓ | K3, K12, K13, K14, K15, K16. |
| Brand files of 08 §4 | ◐ | Logos (14 SVG), app icons (3 options × 5 PNG + SVG), favicons (SVG + 16/32/48 PNG), OG image in assets; `favicon.ico` delivered in the file package (the asset store holds no .ico). |
| App icon 2–3 options on iPhone, Android, browser tab | ✓ | Canvas board B02; option A chosen. |
| Logo shape unchanged | ✓ | Symbol and Persian wordmark copied verbatim; renders pixel-identical. |
| Text ≥ 4.5:1, large text/UI ≥ 3:1, computed | ✓ | *Color* table. |
| Touch targets ≥ 44px on mobile | ✓ | Coarse-pointer rules raise chips, pages, small icon buttons and identifier copy to 44px. |
| Focus ring on every interactive element | ✓ | `focus-ring` 2px + 2px offset; text fields use their own border at 2px in `focus-ring` (one stroke, same corners — approved 11 Mehr 1405); ≥ 3:1 on white and chrome. |
| Never colour alone | ✓ | Status = label + colour; stock, rating, trends use words/icons. |
| 200% zoom without horizontal scroll | ✓ | Every desktop key screen re-rendered at 720 px: no horizontal scroll except the fixed A4 sheet (K18 desktop), which has its own phone view. |
| `prefers-reduced-motion` | ✓ | Global rule in bundle.css. |
| LTR ready: no physical properties, directional icons listed, English lockup | ✓ | |
| Dark ready: semantic tokens only; dark logo versions | ◐ | Structure ready; dark values and dark photo treatment still to be designed. |
| Other languages: widths tolerate +30% text | ◐ | Buttons wrap (`.hz-btn--wrap`), cards and tables wrap; not tested with a real translation. |
| Design System artifact with §3.1 structure | ✓ | README, sections, components, assets, fonts, `bundle.css`, `bundle.js`, `index.d.ts`. |
| `tokens.json` in the system's own list format, usage on every token, light complete, dark defined | ✓ | |
| Component names = code names | ✓ | |
| Every preview opens RTL with Persian sample text | ✓ | 129 previews render-checked. |
| Design artifact with directions and 36 key frames | ✓ | Two canvases (directions; key screens and brand). |
| IRANSansX woff2 in `fonts/`, used everywhere | ✓ | |

## Final test (for Claude Code)

**Run on 11 Mehr 1405: passed.** `/genetics/samples` (P9 ops queue, genetics operator) was built from these files only — canvas boards **K19** (1440 and 390). No new component was needed. The test found 11 small gaps, all now closed in the system:

- genetics sample lifecycle added to the dictionary (6 code statuses + sample kinds as tags) — *Status dictionary › Scoped sets*;
- rule "one look for every viewer": the badge never changes per viewer, ActionOwner does;
- P09: case code = the record being decided (sample `SM-` in genetics), animal-centred rows (`PUP-` code for puppies), dependency line «منتظر: …», one count per place, desktop column budget (max 7 columns), allowed bulk actions per module;
- BulkActionBar: `.hz-bulkbar__note` and the mobile select-mode control; CaseQueue: `.hz-toolrow` for the mobile tool row;
- Pagination single-page variant; one sort-indicator rule for all tables.

## Decisions (11 Mehr 1405)

| # | Question | Decision |
|---|---|---|
| 1 | Stale-decision alert tone | **Warning (amber)**, as built in DecisionDesk and K3. |
| 2 | Statuses missing from the dictionary | **Added**: `PROPOSED`, `ACCEPTED`, `DECLINED`, `CODE_ISSUED`, `CLOSED`, `IN_STOCK`, `LOW_STOCK`, `OUT_OF_STOCK`, `FINDER_READY`, `FINDER_INVITE_ONLY`, `FINDER_UNAVAILABLE`, plus the `TRUSTED` «معتمد» mark; scoped sets fixed. |
| 3 | Content-report wording (K16) | **Keep its own words** «نگه داشتن · پنهان کردن · برداشتن»; the identity desk keeps «تأیید · نیازمند اصلاح · رد». |
| 5 | Brand changes | **Approved**: `cream-50` icon ground, minimum by height (26px), full-colour favicon, «Hamzist». App icon: **option A**. |
| 6 | Copy written by the designer | **Approved** as written. |
| 7a | National IDs failing the check digit | Presentation data only; real IDs come later. No change. |
| 7b | رعد's breed | **روتوایلر** (registry `animals.json` wins); finder card fixed, with رعد's own photo. |
| 7c | Second pedigree | **Not possible.** Rule added to *P06* and LockedServiceCard; the open pedigree request HZ-49UQ9KAEBE now belongs to تارا (no pedigree yet), and K2 shows تارا. |
| 7d | READY in finder vs payout | **Separate keys** (`FINDER_*`). |
| 7e | Cart shipping | Each shop ships its own sub-order; shipping = **sum of each shop's fee**, each shop's free threshold on its own items. OrderSummary shows per-shop rows (آریا ۸۵٬۰۰۰ + نمونه رایگان = ۸۵٬۰۰۰). |
| 7f | SKU-GZ29X4 reserved > stock | **Data mistake.** Oversell state removed; reserved can never exceed stock on hand. |
| 7g | Offer on a fixed-price listing | **Fixed price removed**: every listing is «قابل مذاکره» and accepts offers. |
| 8 | Proposed rules | **Approved**: toast 4 s / 5 s / 8 s undo / errors stay; countdown amber at ≤ 3 days, red only after the deadline; low stock ≤ 5 (admin setting); no bulk approve/reject for identity or document cases; type the document number to revoke. |
| 9 | Data-model additions | **Approved**: image focal point, article image caption/credit/source, variant option name, shop logo. |
| 10 | Small component notes | **Approved**: BreedCard 5 meters + size and coat as facts; expired-licence centres hidden from public results; one icon per document type; ink rating stars; club scope «کشوری». |
| 11 | Bulk sample receipt (genetics) | **Approved**: «ثبت دریافت نمونه» is a bulk action on `/genetics/samples` (K19). |
| 12 | Ink alpha for shadows and scrim | **Approved**: shadows 12–24% and `overlay-scrim` 48% of the ink `#3A3B36`; no new colour. |
| 13 | Home page look (K1) | **Approved 22 Mehr 1405 (v1.0.4)**: every section in a rounded frame (white / cream alternating, Hero peach), featured breed with trait meters, market + shop rows, vets + centres, club cover cards, counts + steps in one box, CtaBand with a photo. |
| 14 | Fees on public pages | **Not shown** (26 Mehr 1405): the product decision DEC-0186 stays — no number on any public page; fees appear only in the payment flow. K1 «خدمات همزیست» cards have no price footer and no «تعیین‌نشده» note; the section link is «مشاهده همه». |

## Still open

1. Dark theme values — deferred until after the beta (structure is ready).
2. Article reading tools (K4) — deferred until after the beta (decided 11 Mehr 1405), inspired by news-magazine article pages:
   - reading progress bar under the header (front-end only, small);
   - share: native share sheet on phones, copy link + Telegram, WhatsApp, Eitaa/Bale on desktop (small);
   - save article for signed-in users: extend `saved_item` to content + a «مقاله‌های ذخیره‌شده» list (medium);
   - comments: needs a product decision first — new data, moderation queue, report reasons, spam limits, off on announcements (large);
   - like counts: not recommended (empty counts at launch; never show «۰»).
   Design work then: article action rail (desktop) + action bar (mobile), reading progress component, K4 D/M frames, ContentDetail and P03 updates.

## Code handoff — verified against the App repository

Checked on 11 Mehr 1405 against `App` at commit `74fbfb7` (Next.js 15, React 19, Tailwind CSS 4 with tokens in `app/globals.css` `@theme`, components in `src/ui/*` and per-module `src/<module>/*`).

**What exists in code and is kept** (props verified, see each component's *Code mapping*): Button, ButtonLink, ActionRow, Card/CardHeader, AnimalCard, RequestCard, ServiceCard, LockedServiceCard, Alert, StatusBadge, Identifier, ActionOwner, Field, TextField, TextAreaField, SelectField, LocationField, FileField, Icon, Logo, Modal, Drawer, BottomSheet, RecordImage, Breadcrumbs, RoleSwitcher, PlaceMap, Timeline, the five PageStates, SyntheticNotice, AccessDenied, PublicShell, OpsShell (+ nav lists), SiteShell (+ DesktopNav, MobileMenu), RelatedColumn, ContentDetail + RichText, MatingProfileCardView, VerificationResult, DocumentPreview + ReviewPanel, BreedPicker, MergeKindTabs. All other components are ★ new.

**Corrections found while checking:** SyntheticNotice lives in `states.tsx`; there is no confirm dialog in `overlay.tsx` (SensitiveConfirm is new); `Breadcrumbs` takes `Crumb = { name, path }` plus `origin`; `Icon` defaults to `md`; `FileField` has no `error` prop yet; `RelatedColumn` takes groups; `Logo` defaults to 28px.

**Tokens.** Colour names: *Color › Mapping* (checked against `@theme`; the only value change is text ink `#171A17` → `#3A3B36`, plus new `border-default`, `border-control`, `action-primary-hover`, `action-destructive`, `bg-page`, `bg-chrome`). Spacing: code `2xs 2 · xs 4 · sm 8 · md 12 · lg 16 · xl 24`; add `20 · 32 · 40 · 48 · 64 · 80 · 96` from *Layout* (as `2xl`… or numeric names — never rename the existing six). Type: code has `caption`, `label-sm/md/lg`, `body-sm/md`, `h4`, `h3`, `h1`, `display`; add `h2`, `body-lg`, `overline`, `numeric-lg` and set the values from *Typography* (code `h3` 24/36 becomes the system's `h2`; code `h4` 20/32 becomes `h3`). Radii already match (add `2xl` 28).

**Icons.** `src/ui/icon-paths.ts` ships 25 Phosphor glyphs with camelCase keys. Add the rest of the approved 128 (*Iconography*) the same way: key = camelCase of the Phosphor name.

**Statuses.** The code has no central dictionary: each module passes `tone` + label. Add `src/ui/status-dictionary.ts` generated from *Status dictionary* (81 keys, families, tones, scoped sets) and let `StatusBadge`, `RequestCard`, `AnimalCard` and `Timeline` accept a key.

**Recommended order for the integration** (one commit each, app runnable between steps):
1. Fonts: copy the 11 IRANSansX woff2 files to `public/fonts/` and load them (`@font-face`); this closes DEC-0007.
2. Tokens: extend `@theme` with the new names and values above (keep the old names as aliases until the end).
3. Brand: copy `design-system/assets/brand/` (logo SVGs, app icon **A**, favicons, OG image) to `public/brand/`, update `Logo`, `app/layout.tsx` metadata and the manifest (*Brand*).
4. Status dictionary module; switch `StatusBadge` callers module by module.
5. Shells: SiteShell → PublicShell → OpsShell at the three breakpoints (*Shells*).
6. Core components in `src/ui/*` (Button tones and sizes, fields, Alert, Card variants, overlays), then the ★ new components as the patterns need them (P01–P12), using `components/bundle.css` class names as the reference implementation.
7. Pages, pattern by pattern, checked against the key screens (K1–K19) on the design canvas.

### Updates after the v1 handoff

- **v1.0.4 (22 Mehr 1405)** — home page (K1 at 1440 and 390, P01) and `components/bundle.css` block «Home compositions»: `.hz-frame` (+ `--cream`, `--peach`), `.hz-home-stack`, `.hz-subhead`, `.hz-row` (+ `--stack`), `.hz-breed-feature`, `.hz-club-cover` (ClubCard `--cover`), `.hz-glance`, `.hz-cta--media` (CtaBand `--media`). New sections on `/`: «بازار همزیست» (listings + products) and «دامپزشکان و مراکز معتمد» (vets + centres); «روش کار» moved into «همزیست در یک نگاه»; no full-bleed band on `/`. Data: the featured breed and the CtaBand photo are home settings with fallbacks (P01).
  QA fixes in the same release: SiteShell header fits at 1024–1279 (nav item padding 8, bar gap 24); on coarse pointers `.hz-btn--sm`, `.hz-qty` buttons and `.hz-segmented__item` reach 44px; seller name is `<h2>` when it is the first heading under the page title (K6, K7); K17 phone has its `<h1>` (the conversation name).

- **v1.0.3 (11 Mehr 1405)** — home page and site header (K1, K4–K7 updated on the key-screens canvas; no `bundle.css` change):
  1. **Home (P01) order:** «تازه‌ها» is the first section, on white. The one `bg-band` moved behind the Hero; on desktop the «استعلام اصالت سند» card in the Hero is `bg-surface` (white).
  2. **«دنبال چه می‌گردید؟»:** 5 quick-entry tiles only — the search field (header has search) and the «استعلام اصالت» tile (Hero has it) are removed.
  3. **SiteShell header:** «ورود / ثبت‌نام» (and «پنل من») is a primary sm button with the filled `user` icon; the mobile menu's foot button is primary too. It is chrome and does not count toward the one-primary rule; filled `user` is the one exception to «fill = active only».
  4. **Colour:** the two ink alpha uses (shadows 12–24%, scrim 48%) are approved; nothing in *Color* is awaiting approval any more.

- **v1.0.1 (11 Mehr 1405)** — `components/bundle.css` and field docs:
  1. **Text-field focus** (`.hz-input`, `.hz-textarea`, `.hz-select`, OTP boxes, `.hz-combobox__control`, `.hz-composer__input`): one orange stroke — the field's own border turns `focus-ring` at 2px (`border-color` + `box-shadow: inset 0 0 0 1px`), `outline: none`, same `radius-md` corners as at rest. Invalid fields keep a red 2px border while focused. Other controls (buttons, links, checkboxes, cards) keep the 2px ring with 2px offset.
  2. **LTR value inside an RTL field with an icon, suffix or action** (codes, mobile numbers, dates with a calendar button): the input's paddings swap so the text never runs under the button (`[dir="rtl"] .hz-input-wrap--action|--icon|--suffix .hz-input--ltr`).
- **v1.0.2 (11 Mehr 1405)** — `components/bundle.css` + SelectField: the options list of `.hz-select` opens as a detached rounded panel (6px gap, `radius-lg`, `border-default`, `shadow-overlay-sm`, 40px rows, selected = `bg-brand-subtle` + ✓) where the browser supports `appearance: base-select` with a fine pointer; phones and other browsers keep the native picker. The arrow points up while open.
