# Design System v1 — mandatory rules for Claude Code

**Status:** binding instruction from the product owner (11 Mehr 1405 / 3 Oct 2026). It sits at item 1 of CLAUDE.md's source precedence ("current explicit user instructions") and overrides item 4's "Prototype … layout" for everything visual: layout, composition, components, colour, type, spacing, imagery.
**Design source:** `docs/design-system/` (this package, v1.0.4). Live: design system https://claude.ai/artifact/XBu7b9eyzZKB3E31kc8vFn · key screens https://claude.ai/artifact/85Z6AZDVJRPzhWvYAEkY92.
**Product behaviour is unchanged:** Requirements.md, D01–D19 and the flows still decide *what* a page does. The design system decides *how it looks and is composed*.

## 1. Non-negotiable

1. **One visual language.** Every page in `app/` and every component in `src/` uses the system: its tokens (`app/globals.css` `@theme`, mapped from `design-system/tokens.json`) and its components (`src/ui/*` rendering the `.hz-*` classes of `src/ui/design-system/bundle.css`). A page that still looks like the old prototype is **not done**.
2. **Forbidden in pages and components:** hex/rgb colours; Tailwind palette colours (`bg-white`, `text-gray-*`, `border-slate-*` …); arbitrary colour/radius/shadow values; physical `left/right/ml/mr/pl/pr/text-left/text-right`; local style constants (like the removed `CONTROL`); a new one-off component when a system component exists; emoji; lorem ipsum.
3. **Fidelity = close (DEC-0259).** Each page follows its pattern (P01–P12) and shell, and the 19 key screens (K1–K19, images in `docs/design-system/key-screens/`) are the visual reference at **390** and **1440**: same structure, order, components, density, states. Do not "restyle conservatively".
4. **Every state is designed:** loading (skeleton), empty (reason + next step), error, locked (what · why · what unlocks it), long Persian text, missing image (RecordImage empty state), unset value «تعیین‌نشده».
5. **Content rules:** Persian digits; «۲۵۰٬۰۰۰ تومان»; Jalali dates; Latin ids in `<bdi dir="ltr">`; statuses only from the dictionary (`src/ui/status-dictionary.ts`, 81 keys) with one label + one tone for every viewer; «اقدام بعدی با: …» on every open case; one primary button per view, start = primary.
6. **Imagery:** the **78 approved photos** in `design-system/assets/imagery/` are the app's images. All of them are used, each where its manifest entry says (`demo-content/images-manifest.json`), with its Persian alt text. No remote or stock images, no grey boxes where a photo exists.
7. **Backlog — do not build now:** dark theme; article reading tools (progress bar, share, save, comments, likes).
8. **Fonts — exact.** One family: **IRANSansX** (11 static woff2 in `design-system/fonts/` → `public/fonts/`, byte-identical), loaded only through the `@font-face` rules of `tokens.css` (weights 100–950, `font-display: swap`), stack `"IRANSansX", Tahoma, system-ui, sans-serif`, used only through the font tokens. Forbidden: any other family anywhere (including PDFs and print documents — they use IRANSansX too), the FaNum build, Google Fonts / `next/font/google`, faux bold (only the 11 weights exist). The full desktop family in the package's `fonts/` folder is for design tools and stays out of the repo.
9. **Logo and brand files — exact.** Use only the files of `design-system/assets/brand/`, copied to `public/brand/` under the stable names of `brand.md › Files` (app icon **option A** only; B and C are never shipped). Each place gets the lockup and height of `brand.md › Usage per shell` (site header 36/30, ops sidebar 26, rail symbol 32, sign-in stacked 100, A4 head 40). Height only, never width; never recoloured, re-typeset, stretched, shadowed, placed on a photo, or below the minimum (use the symbol). The name is always «همزیست» in brand use. Favicon set + `favicon.ico` at the root, `app/layout.tsx` metadata, manifest (`theme_color`/`background_color` `#FFFCF8`) and OG image exactly as `brand.md` gives them.
10. **Stylesheets in sync.** `src/ui/design-system/bundle.css` and `tokens.css` are copies of `design-system/components/bundle.css` and `design-system/tokens.css` (only the `@font-face` URLs may differ). Never edit them in the app; app-specific rules go in app CSS with tokens. When the design system changes, copy them again.

## 2. Demo data — make every designed screen visible

Pages without data only show empty states, so the design cannot be checked. Build a **demo seed** that fills the app the way the key screens show it.

- **One seed, extended — not a second one.** The design-system sample seed already started in `src/db/seed/sample-content.ts` (DEC-0269: public pages through the product's own services) is the place: extend it to every area in the spec (user, vet, operations, market, shop, finder), keep its rules (services only, one transaction per record, skip what exists). Expose it as one command (e.g. `npm run db:seed:sample`). **Refuses to run when `APP_ENV=production`** (same guard as `seedDevFixtures`). Idempotent (re-running changes nothing); `--reset` removes only demo rows (mark them, e.g. a `DEMO` source column or a demo-id registry table).
- Data comes from `docs/design-system/sample-content/*.json` (corrected copy). Where a page needs data that is not there, **create it** in the same style: real Persian names, cities, breeds, amounts in Toman, Jalali-consistent dates around 10 Mehr 1405, ids in the system's formats (`_meta.json`). Never invent product behaviour — only rows the existing model accepts.
- Photos are imported through the app's own storage (`putPrivateFile` / `storedFiles`) so every `imageFileId` is real, with `imageAltFa` from the manifest.
- Attach records to the fixture accounts (`0999…`, `src/db/seed/dev-fixtures.ts`) so each role's pages are full when you sign in as that role.
- Full checklist of what to seed, page by page: `demo-content/DEMO-DATA-SPEC.md`.

## 3. Definition of done (per page)

- Demo data loaded; page screenshot at **390** and **1440** saved to `docs/qa/design-system/<route>-{390,1440}.png`; compared with its key screen or pattern; differences either fixed or logged as a DEC with the reason.
- No forbidden styles (rule 1.2) — add a check to `npm run check` that fails on hex, palette colours and physical direction utilities in `app/**` and `src/**` (allow-list `src/ui/design-system/*` and the PDF/print templates).
- No horizontal scroll at 360–1440 and at 200% zoom; focus visible on every control; touch targets ≥ 44px on coarse pointers; `prefers-reduced-motion` respected.

- **Final QA passed:** `QA-FINAL-RECONCILIATION.md` run end to end, `node docs/design-system/qa/ds-audit.mjs` with **0 FAIL**, every REVIEW item closed, `docs/qa/design-system/QA-REPORT.md` written.

## 4. When the system lacks something

Use the closest existing component, log `DEC-NNNN`, and append the gap to `docs/design-system/GAPS.md` (what, where, what you used instead). Do not invent colours, statuses, icons or copy outside the system.

## 5. Order of work from here

1. Commit these instructions (`docs/design-system/CLAUDE-CODE-DESIGN-SYSTEM-RULES.md`, `docs/design-system/demo-content/*`, the CLAUDE.md section) as their own `docs(design-system)` commit.
2. Demo seed (section 2) with all 78 photos.
3. The forbidden-style check (section 3) — fix what it finds.
4. Walk every route group (public → user → vet → each ops environment) with demo data at 390/1440 and bring each page to its pattern/key screen; screenshots in `docs/qa/design-system/`.
5. Report: pages done, gaps logged, photos used (78/78).
6. **Final QA** — when everything above is done, run `QA-FINAL-RECONCILIATION.md` in full: compare the whole design system and every key screen with the code (links and offline copies are listed there), fill every missing part from the design system, and only then report the work as finished.
