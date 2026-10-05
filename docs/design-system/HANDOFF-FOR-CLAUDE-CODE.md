# Hamzist Design System v1.0.3 — handoff to the App

**For:** Claude Code working in the `App` repository (`X:\Work\01_Clients\دراگون\هم زیست\App`).
**Approved by the product owner:** 11 Mehr 1405 (3 Oct 2026). Every open decision is closed; dark mode and the article reading tools are backlog for after the beta.
**Binding rules for Claude Code:** `CLAUDE-CODE-DESIGN-SYSTEM-RULES.md` (read first) · start message: `START-PROMPT-FOR-CLAUDE-CODE.md` · demo data: `demo-content/` · changes since v1.0: `CHANGELOG.md`.
**Checked against:** `App` at commit `74fbfb7` (Next.js 15, React 19, Tailwind CSS 4, tokens in `app/globals.css` `@theme`, components in `src/ui/*` and `src/<module>/*`).

Live versions (same content as this folder, rendered):
- Design system: https://claude.ai/artifact/XBu7b9eyzZKB3E31kc8vFn
- Key screens K1–K19 and brand boards: https://claude.ai/artifact/85Z6AZDVJRPzhWvYAEkY92

The links open in the project's Claude account; the same key screens are in `key-screens/` as images, so the repo has everything without them.

## What this replaces

This package is the new **Design System** source in the repo's source precedence (CLAUDE.md, item 4: "Design System for visual tokens/components"). It supersedes the Figma Design System file `2GMJPgnnenGnr1zBN2yH5h` and the prototype token values in `app/globals.css` where they differ. Record that as a decision (DEC-NNNN) when you start. Product behaviour (Requirements.md, decisions D01–D19, flows) is unchanged: this package changes how things look and are composed, not what they do.

## What is in this folder

| Path | What it is |
|---|---|
| `CLAUDE-CODE-DESIGN-SYSTEM-RULES.md` | **Mandatory** rules: one visual language, forbidden styles, close fidelity to K1–K19, demo data, definition of done. |
| `demo-content/DEMO-DATA-SPEC.md` · `images-manifest.json` | What to seed page by page so every designed screen is visible; where each of the 78 photos is used, with Persian alt text. |
| `key-screens/` | **Images of K1–K19** at 1440 and 390 (+ 3 extra states) and the two brand boards — the visual reference for every page; index in `key-screens/README.md`. |
| `design-system/README.md` | Brand book and the rules that apply to every screen. |
| `design-system/01-color.md` … `08-content.md` | Foundations: colour (incl. **code token → new token mapping**), typography, layout, iconography (approved 128 icons), imagery, motion, **status dictionary** (81 keys), content rules. |
| `design-system/shells.md` | SiteShell, PublicShell, OpsShell at mobile / tablet / desktop. |
| `design-system/patterns/P01–P12` | The 12 page patterns; each names the pages that use it. |
| `design-system/brand.md` | Logo system, app icon (**option A chosen**), favicon, share image, manifest. |
| `design-system/zz-checklist.md` | Acceptance checklist, all decisions, and **"Code handoff — verified against the App repository"**: what exists, what is new, corrections, token/spacing/type mapping, recommended order. |
| `design-system/tokens.json` · `tokens.css` | All tokens (primitives + semantic, light theme; dark theme reserved). |
| `design-system/components/bundle.css` | Reference implementation of every component as `.hz-*` classes (semantic tokens only, logical properties only). |
| `design-system/components/bundle.js` · `index.d.ts` | Helpers: Persian digits, Toman, Jalali dates, «تعیین‌نشده», mobile/national-ID validation. |
| `design-system/components/<Name>/README.md` | 129 components: anatomy, states, mobile↔desktop, a11y, data, and a **Code mapping** section. For the 53 that already exist in code, it starts with "Verified in the App code (commit 74fbfb7)" and gives the real file, export and props. |
| `design-system/components/<Name>/preview.html` | HTML fragment of each component (open the live design system to see them rendered; they need `tokens.css` + `bundle.css`). |
| `design-system/fonts/` | IRANSansX woff2 (11 weights) — the only font files the app needs. |
| `fonts/` | The full licensed IRANSansX Pro family (TTF/OTF, woff, FaNum, variable) + `licenses.pdf`, for design tools and print; see `fonts/README.md`. Kept in the handoff package only, not copied into the repo. |
| `design-system/assets/brand/` | Logo SVGs, app icons A/B/C (use **A**), favicons (SVG, 16/32/48 PNG, .ico), OG image. |
| `design-system/assets/imagery/` | 78 photos + `IMAGES.json` (file, ratio, Persian alt); usage in `demo-content/images-manifest.json`. |
| `sample-content/` | The pack's sample data corrected to the approved decisions (`CHANGES.md` lists the 6 changed files). |

## Rules that must survive the migration

- Persian RTL, logical properties only (`inline-start/end`), never left/right.
- Semantic tokens only in components (`bg-surface`, `text-primary`, `status-warning-text` …), never primitives or hex.
- One primary button per view; start = primary.
- Status = one key from the dictionary → one label + one tone for every viewer; who acts next is `ActionOwner`.
- Persian digits, «۲۵۰٬۰۰۰ تومان», unset values «تعیین‌نشده» (never ۰), Jalali dates, Latin ids in `<bdi dir="ltr">`.
- Locked service = what · why · what unlocks it. Every open case shows «اقدام بعدی با: …».
- Touch targets ≥ 44px on coarse pointers; focus ring on every control; `prefers-reduced-motion` respected.

## Recommended order (one coherent, runnable step per commit, following the repo's own Git rules)

1. **Fonts** — copy `design-system/fonts/*` to `public/fonts/`, add `@font-face` (closes DEC-0007).
2. **Tokens** — extend `@theme` in `app/globals.css` with the new names and values (*Color › Mapping*, *Layout*, *Typography*); keep the old names as aliases until the last step. Only value change for existing names: text ink `#171A17` → `#3A3B36`.
3. **Brand** — copy `assets/brand/` to `public/brand/` (app icon option **A** → `public/brand/app-icon/`), update `Logo`, metadata and the manifest (*Brand › Files*).
4. **Status dictionary** — `src/ui/status-dictionary.ts` from *Status dictionary*; `StatusBadge` and the cards accept a key.
5. **Icons** — add the approved glyphs to `src/ui/icon-paths.ts` (camelCase of the Phosphor name).
6. **Shells** — SiteShell, PublicShell, OpsShell at three breakpoints.
7. **Core components** in `src/ui/*`, then the ★ new components as patterns need them, using `bundle.css` as the visual reference (translate to Tailwind utilities or import the `.hz-*` classes — pick one and record the decision).
8. **Pages**, pattern by pattern, compared with K1–K19 on the key-screens canvas. Then remove the old token aliases.

Do not invent copy, statuses or colours that are not in the system; if something is missing, log a decision and keep to the closest existing part.
