# Hamzist Design System — changelog

## v1.0.4 decision 14 — 26 Mehr 1405 (18 Oct 2026)

**No fee on public pages** (product owner): the product decision DEC-0186 stays. K1 «خدمات همزیست» cards have no price footer, no «تعیین‌نشده» and no fee note; the section link is «مشاهده همه» to `/services`. Fees appear only on signed-in pages and in the payment flow. Changed: K1 boards (1440, 390) and their images and html, `patterns/P01-editorial-home.md` (item 10, hard cases), `components/ServiceCard/README.md`, `zz-checklist.md` (decision 14). No CSS change.

## Handoff package — 23 Mehr 1405 (15 Oct 2026)

No design change (still v1.0.4). Made the package ready for Claude Code to implement and verify on its own:

1. **`QA-FINAL-RECONCILIATION.md`** — the required final QA: links to the live design system and key screens with their offline copies, then a step-by-step reconciliation of foundations, fonts, brand, all 129 components, all 12 patterns and every route, all key screens, global checks, gap filling and a report template.
2. **`qa/`** — `ds-inventory.json` (machine-readable list of tokens, fonts, brand files, status keys, icons, photos, components, patterns, key screens), `ds-audit.mjs` (static audit of the code, exit 1 on FAIL) and `compare-key-screens.mjs` (reference vs running app at 390 / 1440 with screenshots and a structural diff).
3. **`key-screens/html/`** — the exact markup of all 43 key-screen boards and the two brand boards, rendering offline with the package's CSS, photos and logos.
4. **Rules:** `CLAUDE-CODE-DESIGN-SYSTEM-RULES.md` §1.8 fonts (exact), §1.9 logo and brand files (exact), §1.10 stylesheets in sync, final QA in the definition of done; `START-PROMPT` step 7 runs the final QA. `brand.md` / `zz-checklist.md`: brand source path corrected to `design-system/assets/brand/`. `key-screens/README.md`: only K1–K19 and B01–B02 are approved; the home option boards are not specs.

## v1.0.4 — 22 Mehr 1405 (14 Oct 2026)

Home page redesign, approved by the product owner. Key screen **K1** (1440 and 390) replaced; pattern **P01** rewritten.

1. **Frames, not bands:** every section of `/` sits in a rounded frame (`.hz-frame`), alternating white and cream (`--cream`); the Hero frame is peach (`--peach`). No full-bleed band on `/`.
2. **Order:** «تازه‌ها» → Hero → «دنبال چه می‌گردید؟» → «نژادهای سگ» (featured breed «نژاد این ماه» with the five trait meters + five tiles) → **«بازار همزیست»** (4 listings + 4 products, new) → **«دامپزشکان و مراکز معتمد»** (4 trusted vets + 3 centres, new) → «انجمن‌ها و کلاب‌ها» (ClubCard `--cover`) → «همزیست در یک نگاه» (counts + the three steps; the separate «روش کار» section is gone) → «خدمات همزیست» → CtaBand `--media` (with a photo).
3. **Phones:** card rows become swipe rows (`.hz-row`), vets stack, counts 2×2, steps stacked, CtaBand photo on top. Swipe rows stay inside the frame padding: the first and last card never touch the frame edge, and the next card peeks.
4. **New CSS** in `components/bundle.css`, block «Home compositions»: `.hz-frame` (`--cream`, `--peach`), `.hz-home-stack`, `.hz-subhead`, `.hz-row` (`--cols`, `--cols-md`, `--row-item`, `--stack`), `.hz-breed-feature`, `.hz-club-cover`, `.hz-glance`, `.hz-cta--media`. Semantic tokens and logical properties only.
5. **Data:** two home settings with fallbacks — the featured breed (fallback: first breed by `sortOrder` with photo, history and all five traits) and the CtaBand photo (fallback: the plain CtaBand). Log both as decisions; no other behaviour changes.
6. **QA fixes:** SiteShell header fits at 1024–1279 (nav item padding 8, bar gap 24); on coarse pointers `.hz-btn--sm`, quantity steppers and segmented items reach 44px; seller name is an `<h2>` when it is the first heading under the page title (K6, K7); K17 phone has its `<h1>`.

In the app: rebuild `app/(public)/page.tsx` to P01 / K1 using the new classes (or Tailwind equivalents with the same tokens), extend the sample seed so every home section is full (see `demo-content/DEMO-DATA-SPEC.md`, Home row).

Changed files: `design-system/components/bundle.css`, `patterns/P01-editorial-home.md`, `components/CtaBand/*`, `components/SiteShell/README.md`, `components/Button/README.md`, `components/SellerCard/README.md`, `components/ClubCard/*`, `components/BreedCard/README.md`, `01-color.md`, `shells.md`, `zz-checklist.md`, `key-screens/K01-home-1440.png`, `key-screens/K01-home-390.png`, `demo-content/*`.

## v1.0.3 — 11 Mehr 1405 (3 Oct 2026)

**Package:** added `key-screens/` (images of K1–K19 at 1440 and 390, 3 extra states, 2 brand boards, with an index) and `fonts/` — the full licensed IRANSansX Pro family with `licenses.pdf` and a README (the app still only needs `design-system/fonts/*.woff2`).

Home page and site header, approved by the product owner. No `bundle.css` or token change. Key screens updated: **K1** (390 and 1440), header of **K4–K7**.

1. **Home order (P01):** «تازه‌ها» is now the **first section**, directly under the header, on the white page (no band). The one `bg-band` (cream, `border-subtle` top and bottom) moved **behind the Hero**; the band adds no padding of its own (the Hero's padding is used). On desktop the «استعلام اصالت سند» card inside the Hero uses `bg-surface` (white) instead of `bg-feature`. The next section starts `space-64` (desktop) / `space-48` (phone) below the band.
2. **«دنبال چه می‌گردید؟»:** the search field and the «استعلام اصالت» tile are removed (the header has search; the Hero has the verify form). Five tiles remain — دامپزشکان، مراکز دامپزشکی، نژادهای سگ، بازار فروش حیوان، فروشگاه کالا — 5 equal columns on desktop (title + one-line description, equal heights), 2 per row on phones with the fifth full width.
3. **SiteShell header:** «ورود / ثبت‌نام» (and «پنل من» when signed in) is a **primary** `sm` button with the **filled** `user` icon; the mobile menu's foot button is a primary block button with the same icon. It is site chrome and does not count toward the one-primary-per-view rule; filled `user` here is the one exception to «fill = active state only».
4. **Colour:** the two alpha uses of the ink — overlay shadows 12–24% and `overlay-scrim` 48% — are approved (no new colour; values unchanged). *Color* and *Acceptance* no longer list anything as awaiting approval.

In the app: reorder `app/(public)/page.tsx` to match P01, move the band to the Hero, slim the quick-entry section, and update `src/public/site-shell.tsx` (desktop login button and `MobileMenu` foot). Add `userFill` to `src/ui/icon-paths.ts` (Phosphor `user`, fill weight).

Changed files: `patterns/P01-editorial-home.md`, `components/SiteShell/README.md` + previews of SiteShell, SiteShellTablet, SiteShellMobile, GroupedNav; `components/Button/README.md`, `04-iconography.md`, `shells.md`, `zz-checklist.md`.

## Handoff package — 11 Mehr 1405 (3 Oct 2026)

- Added `CLAUDE-CODE-DESIGN-SYSTEM-RULES.md` (mandatory rules), `START-PROMPT-FOR-CLAUDE-CODE.md`, `demo-content/DEMO-DATA-SPEC.md` and `demo-content/images-manifest.json` (all 78 photos mapped to records).
- Design system content was unchanged from v1.0.2 at that point.

## v1.0.2 — 11 Mehr 1405 (3 Oct 2026)

**Dropdown options list.** `.hz-select` opens its list as a separate rounded panel in the system's menu style instead of the browser's square list glued to the field: 6px below the field, `radius-lg` (16), `border-default`, `shadow-overlay-sm`, 6px inner padding, at least the field's width, max 320px then scroll; 40px rows with `radius-sm`, hover `bg-subtle`, selected `bg-brand-subtle` + `text-brand` Bold + ✓ at the end; the arrow points up while open. Built with `appearance: base-select` inside `@supports` + `@media (pointer: fine)` — Chromium 135+ on desktop gets the panel; phones and other browsers keep the native picker. No JavaScript.
In the app: every dropdown must be the system's SelectField (`.hz-select-wrap` > `select.hz-select`) for this to apply — replace the local `CONTROL` native selects on the public list pages.

Changed files: `design-system/components/bundle.css`, `components/SelectField/README.md`, `zz-checklist.md`.

## v1.0.1 — 11 Mehr 1405 (3 Oct 2026)

Small visual fix; no new components, no token changes. Apply on top of v1.0.

1. **Text-field focus** — `.hz-input`, `.hz-textarea`, `.hz-select`, OTP boxes, `.hz-combobox__control`, `.hz-composer__input`: one orange stroke. The field's own border turns `focus-ring` at 2px (`border-color: var(--focus-ring); box-shadow: inset 0 0 0 1px var(--focus-ring); outline: none`), with the same `radius-md` (12px) corners as at rest — no second ring, no offset, no size change. An invalid field keeps a red 2px border while focused. Buttons, links, checkboxes and cards keep the 2px ring with 2px offset.
   In Tailwind terms for `src/ui/field.tsx`: replace any `focus:ring*` / `focus-visible:outline*` on text controls with `focus-visible:border-[var(--focus-ring)] focus-visible:shadow-[inset_0_0_0_1px_var(--focus-ring)] focus-visible:outline-none`.
2. **LTR value inside an RTL field with an icon, suffix or action button** (codes, mobile numbers, dates): the input's paddings swap so the text never runs under the button — `[dir="rtl"] .hz-input-wrap--action|--icon|--suffix .hz-input--ltr`.

Changed files: `design-system/components/bundle.css`; READMEs and previews of TextField, TextAreaField, SelectField, Combobox, OtpField, MobileField, MoneyField, ReasonField, MessageComposer (+ previews of Field, JalaliDateField, NationalIdField, SearchField, SettingsPanel, DeliveryCodeCard); `01-color.md`, `03-layout.md`, `README.md`, `shells.md`, `zz-checklist.md` (focus rule wording + "Updates after the v1 handoff").

## v1.0 — 11 Mehr 1405

First handoff (see HANDOFF-FOR-CLAUDE-CODE.md).
