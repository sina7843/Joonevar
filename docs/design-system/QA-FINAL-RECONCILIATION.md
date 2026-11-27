# Final QA — reconcile the whole design system and every key screen with the code

> **خلاصه برای تیم:** این فایل دستور کار QA نهایی Claude Code است. وقتی پیاده‌سازی تمام شد، Claude Code باید یک بار کل سیستم طراحی (پایه‌ها، فونت، لوگو، ۱۲۹ کامپوننت، ۱۲ الگو) و همه صفحه‌های کلیدی K1 تا K19 را با کد مقایسه کند. هر چیزی که جا افتاده باید از روی سیستم طراحی ساخته شود. بعد گزارش `docs/qa/design-system/QA-REPORT.md` را بنویسد. تا وقتی ممیزی خودکار FAIL دارد، کار تمام‌شده حساب نمی‌شود.

**For:** Claude Code in the `App` repository. **Binding:** product-owner instruction (CLAUDE.md precedence item 1), part of the definition of done in `CLAUDE-CODE-DESIGN-SYSTEM-RULES.md` §3.
**When:** after the implementation work in `START-PROMPT-FOR-CLAUDE-CODE.md` is finished, and again after any later UI change. Do not report the design-system work as done before this QA passes.
**Version:** design system **v1.0.4** (approved 11 Mehr 1405; home page 22 Mehr 1405). Check that `docs/design-system/CHANGELOG.md` starts with v1.0.4. If the repo has an older copy, update it from the package first.

---

## 1. Sources of truth

| What | Live link (same Claude account) | Offline copy in this package (`docs/design-system/`) |
|---|---|---|
| **Design system:** foundations, brand, 129 components (rendered previews), 12 patterns, tokens, fonts, assets | https://claude.ai/artifact/XBu7b9eyzZKB3E31kc8vFn | `design-system/` (the artifact's `project/…` files; brand and photos are in `design-system/assets/brand/` and `design-system/assets/imagery/`) |
| **Key screens:** K1–K19 at 1440 and 390 (+3 extra states), brand boards B01–B02 | https://claude.ai/artifact/85Z6AZDVJRPzhWvYAEkY92 | `key-screens/*.png` (images) and `key-screens/html/*.html` (the exact markup of each board, renders offline) |

**How to read the links:**

- If your session has the `Artifact` tool, use `action: "read"` with the URL.
- For one file, add `path`, for example `project/components/Button/README.md` on the design system, or `project/K05-vets-D.dc.html` on the key-screens canvas.
- If the tool is not available or the link needs a sign-in you do not have, work from the offline copy. It is the same v1.0.4 content.
- If a live file and the offline copy ever differ, the live link is newer. Follow it and note the difference in the report.

**Approved boards only.** On the key-screens canvas, use only the pages «۱۸ صفحه کلیدی × ۲ اندازه» (K1–K19) and «برند و آیکون اپ» (B01–B02).

- The pages «خانه — واریانت‌ها و گزینه‌ها» and «خانه — ترکیب برای مقایسه» hold the rejected home-page options (optA/B/C, v1–v5, mix). Never build from them.
- The home page is **K1** (`K01-home-D`, `K01-home-M`).

**Order of authority** when sources disagree:

1. The newest `CHANGELOG.md` entry.
2. The key screen (image + html).
3. The pattern (`patterns/P*.md`).
4. The component README.
5. Foundations.

Product behaviour still comes from Requirements.md / D01–D19. This QA never changes what a page does.

## 2. Tools in this package

| Tool | What it does |
|---|---|
| `qa/ds-inventory.json` | Machine-readable list of everything to find in the code: 137 tokens, 11 font files + weights, 25 brand files with their `public/` targets, 81 status keys with labels, 128 icons, 78 photos, 129 components (README, preview, classes, code files), 12 patterns (pages, key screens), 19 key screens (route, role, hard case, images, html, classes). |
| `qa/ds-audit.mjs` | Static audit of the code against the inventory: stylesheet sync, tokens, fonts, brand, photos, status dictionary, icons, component and key-screen class coverage, QA evidence. Writes `docs/qa/design-system/ds-audit.md`; exit 1 on any FAIL. `node docs/design-system/qa/ds-audit.mjs` |
| `qa/compare-key-screens.mjs` | Opens each key-screen reference and the running app page at the same width (390 / 1440, touch emulation at 390). Saves `<name>.ref.png` + `<name>.app.png`. Writes a structural diff: headings, missing `.hz-*` parts, primary buttons, alt text, horizontal scroll, font, landmarks. `--init` writes the route config; `--base http://localhost:3000` runs it. Uses the App's `playwright`. |
| Existing | `npm run check` (includes `check:ds`, the forbidden-style check), `npm run test:browser`. |

## 3. Procedure

Work through the steps in order. Log every finding in the report (§5) as you go. Fix it in the same pass, and do not leave a list of suggestions. Follow CLAUDE.md's Git rules: small coherent commits with explicit paths, and never `add -A`.

### Step 0: prepare

1. Record `git status --short` and HEAD. Start from a clean or explicitly scoped tree.
2. Run `npm run check`. It must pass before QA starts.
3. Load the demo seed so that every designed screen is full.
   - Spec: `demo-content/DEMO-DATA-SPEC.md`.
   - Use the seed command the repo exposes (`npm run db:demo` / `db:seed:sample`).
4. Start the app (`npm run build && npm run start`, or `npm run dev`).
5. Save one Playwright storage state per role from the fixture accounts (`src/db/seed/dev-fixtures.ts`): visitor (none), user, trusted vet, association operator, listing moderator, superadmin, content admin, seller, genetics operator.
   - Put them under `docs/qa/.auth/` and git-ignore them.

### Step 1: automated audit

1. Run `node docs/design-system/qa/ds-audit.mjs`.
2. Fix **every FAIL**:
   - copy the v1.0.4 `bundle.css` and `tokens.css` into `src/ui/design-system/`;
   - fonts in `public/fonts/` and nowhere else;
   - brand files, `favicon.ico`, metadata and manifest exactly as `brand.md` gives them;
   - photos, the status dictionary and icons.
3. Re-run until 0 FAIL. The two Evidence items clear at steps 4 and 6.
4. Open `docs/qa/design-system/ds-audit.md` and keep it. Every **REVIEW** row must be closed by the end of step 5. Close it by implementing the part, or with a one-line reason in the report: the part is not on any page that exists, with a DEC.

### Step 2: foundations (read each file completely, then check the code)

| File | Check in the code |
|---|---|
| `01-color.md` | Only semantic tokens in components. The code-token → new-token mapping is applied and the old aliases are removed. Text ink is `#3A3B36`. No primitives, hex, palette or arbitrary colours (`check:ds`). Status colours only through the status tokens. |
| `02-typography.md` | IRANSansX only, through the type tokens and `.hz-*` type classes. The scale, weights and line heights match. No FaNum, no faux bold, nothing below the minimum size. Persian digits in UI text. Latin ids in `<bdi dir="ltr">`. |
| `03-layout.md` | Breakpoints, containers (`container-site` 1280), grid, gutters, margins and spacing tokens at 390 / 768 / 1024 / 1440. Logical properties only. |
| `04-iconography.md` | Only the 128 approved icons. The `fill` weight is used only for the active item and the SiteShell user button. Directional icons mirror and the others never do. Sizes come from the icon tokens. |
| `05-imagery.md` | Ratios, RecordImage crop (object-position 50% 40%) and the missing-image state. All 78 photos are visible somewhere in the app with their Persian alt (list where each one is seen). No remote or stock images. |
| `06-motion.md` | Durations and easings come from tokens. `prefers-reduced-motion` turns off carousel slides and card lift. |
| `07-status.md` | 81 keys, one label and one tone for every viewer. «اقدام بعدی با: …» appears on every open case. Module-level `*_STATUS_FA` maps are migrated to dictionary keys (GAPS #4). |
| `08-content.md` | Persian digits, «۲۵۰٬۰۰۰ تومان», Jalali dates, «تعیین‌نشده» for unset values (never ۰), copy rules, one primary per view with primary at the start. |
| `shells.md` | SiteShell, PublicShell and OpsShell at mobile / tablet / desktop: header heights, nav, drawer, sidebar, rail and footer. |
| `brand.md` | Fonts and logo as in `CLAUDE-CODE-DESIGN-SYSTEM-RULES.md` §1.8–1.9. In each shell, check the lockup and its height: site header 36 / 30, footer, PublicShell, OpsShell 26, rail symbol 32, sign-in stacked 100, A4 head 40. Also check the `aria-label`, `favicon.ico` at the root, `<head>` icons, the manifest and the OG image in the built HTML. |
| `README.md`, `zz-checklist.md` | Every rule in the brand book. Every row of the acceptance checklist is ticked with evidence. |

### Step 3: components (all 129, in `ds-inventory.json` order)

For each component, do these checks:

1. Read `design-system/components/<Name>/README.md` and `preview.html`. Open it rendered in the live design system, or open the preview with `tokens.css` + `bundle.css`.
2. Find the implementation. Use the README's **Code mapping** first, then search `src/ui/*` and `src/<module>/*`.
3. Check:
   - anatomy (every part);
   - every variant, size and tone;
   - every state (default, hover, focus, active, disabled, loading, error, empty, long Persian text, missing image, unset value);
   - mobile ↔ desktop behaviour;
   - accessibility (role, name, keyboard, focus ring, 44px targets on coarse pointers);
   - data and content rules;
   - the props named in Code mapping.
4. Record one row: **Done**, **Fixed now** (what you added), or **Not used** (no page in the app uses it — name the pattern that would). A component that a pattern or key screen uses must never be "Not used".
5. Build what is missing **now**, from `bundle.css` classes and the README. Never restyle or invent a variant.

### Step 4: patterns and every page

1. List every route in the app (`app/**/page.tsx`). Map each one to its pattern and shell.
   - The patterns' "Pages that use it" lists are in `ds-inventory.json`.
   - A route that fits no pattern is a finding: give it the closest pattern and log a DEC.
2. Open every route at **390 and 1440**, signed in as the right role, with demo data. Check against its pattern file:
   - anatomy and section order;
   - the layout table (all three columns);
   - states (loading skeleton, empty with reason and next step, error, locked as what · why · what unlocks it, hard cases);
   - content and data rules;
   - accessibility and keyboard;
   - Do / Don't.
3. Check every page, not only the 19 key screens. A page without its own key screen still follows its pattern at close fidelity.

### Step 5: key screens (all 43 references)

1. Run `node docs/design-system/qa/compare-key-screens.mjs --init`.
2. Fill `docs/qa/design-system/key-screen-routes.json`:
   - replace each `[id]` with a demo record that shows the **hard case** listed in `key-screens/README.md`;
   - set `storageState` for the role.
3. Run `node docs/design-system/qa/compare-key-screens.mjs --base http://localhost:3000`.
4. For **every** screen, work through these checks:
   - **Look at both images yourself** (`<name>.ref.png` and `<name>.app.png`). Compare structure, section order, components, density, spacing, alignment, states and the hard case.
   - Work through `<name>.diff.md`: missing headings, missing `.hz-*` parts, primary buttons, alt text, font, landmarks, horizontal scroll.
   - Read the reference markup (`key-screens/html/<name>.html`) for anything unclear: which component, which classes, which order, what copy.
   - Fix the page, re-run with `--only <name>`, and repeat until the diff has no structural item left. Different record names or counts from the demo data are fine. Missing parts, other order or other components are not.
5. `SUMMARY.md` plus the image pairs stay in `docs/qa/design-system/key-screens/` as evidence.

### Step 6: global checks (every page)

- No horizontal scroll at 360, 390, 768, 1024, 1280 and 1440, or at 200% zoom.
- Focus is visible on every control, and the focus order follows the patterns.
- Touch targets are ≥ 44px on coarse pointers.
- `prefers-reduced-motion` is respected.
- RTL with logical properties only.
- The fonts really load: `document.fonts` shows IRANSansX loaded, there is no fallback rendering, and the Network tab shows no other font.
- One primary button per view.
- Every image has alt text, and no image is broken.
- `npm run check` and `npm run test:browser` pass.

### Step 7: fill what is missing

Everything found in steps 1–6 is implemented **from the design system**:

- its components and classes;
- its tokens;
- its icons;
- its copy (README / pattern / key-screen markup);
- its photos.

Never invent colours, statuses, icons, copy or behaviour. Use a gap entry only when the design needs product behaviour or data the app does not have. In that case:

1. Use the closest existing part.
2. Add a row to `docs/design-system/GAPS.md`.
3. Log a DEC with the reason.

Re-check the existing GAPS rows too, and close the ones that are now possible.

### Step 8: loop

Re-run step 1 (audit), step 5 (compare) and `npm run check` until all of these hold:

- the audit shows **0 FAIL**;
- every REVIEW is closed;
- every key screen has no structural difference left.

## 4. Done means

- [ ] `ds-audit.mjs`: 0 FAIL, and every REVIEW item is closed with a fix or a DEC.
- [ ] All 129 components: Done / Fixed now / Not used (with reason).
- [ ] All 12 patterns and **every route** checked at 390 and 1440.
- [ ] All 43 key-screen references compared, with image pairs saved and no structural difference left.
- [ ] Fonts: IRANSansX only, 11 weights loaded from `public/fonts/`, including in PDFs.
- [ ] Brand: exact files and sizes per shell, app icon A, favicon / manifest / OG verified.
- [ ] Photos 78 / 78 seen on screen with Persian alt.
- [ ] `npm run check` and `npm run test:browser` pass.
- [ ] `docs/qa/design-system/QA-REPORT.md` is written and committed, along with `ds-audit.md`, `key-screens/` and the GAPS / DEC entries.

## 5. Report (`docs/qa/design-system/QA-REPORT.md`)

```markdown
# Design system v1.0.4 — final QA report
Date · HEAD before / after · commands run with results

## Summary
Audit: FAIL 0 · REVIEW 0 (n closed) · components 129 (done x · fixed y · not used z) · routes n/n · key screens 43/43 · photos 78/78 · gaps opened / closed

## Foundations   — one row per file in step 2: status, what was fixed, evidence
## Components    — 129 rows: name · status · code file · what was fixed / why not used
## Pages         — every route: pattern · shell · 390 ✓ · 1440 ✓ · states ✓ · fixes
## Key screens   — 43 rows: name · route · result · link to .ref.png / .app.png / .diff.md
## Global checks — step 6 list with result
## Photos        — 78 rows: file · where it is seen
## Gaps          — new / closed GAPS rows with DEC ids
```

Finish by telling the product owner, in Persian:

- what was found and fixed;
- the audit result;
- the gaps that remain and why;
- the commit hashes.
