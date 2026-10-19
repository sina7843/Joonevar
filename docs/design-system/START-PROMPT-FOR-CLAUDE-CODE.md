# Start prompt for Claude Code (copy everything below the line)

---

You are continuing the Hamzist design-system integration. Work on branch `design-system-v1` (create it from the current branch if it does not exist; follow CLAUDE.md's Git rules).
This is a binding user instruction (CLAUDE.md source precedence item 1).

1. Read `docs/design-system/CLAUDE-CODE-DESIGN-SYSTEM-RULES.md` completely, then `docs/design-system/demo-content/DEMO-DATA-SPEC.md` and `docs/design-system/demo-content/images-manifest.json`. The design system in `docs/design-system/` (v1.0.4) is the only visual source; the old prototype layout no longer applies to visuals.
2. Commit the new instruction files as their own `docs(design-system)` commit (CLAUDE.md section + the files above), following CLAUDE.md's Git rules. Then copy `docs/design-system/design-system/components/bundle.css` and `tokens.css` into `src/ui/design-system/` (rules §1.10; keep only the app's `@font-face` URLs) so the app runs on v1.0.4.
3. Extend the existing demo seed (`npm run db:demo` / `src/db/seed/demo.ts`, started from `sample-content.ts`, DEC-0269) to everything in the spec — one seed, non-production only, idempotent, removable — importing all 78 approved photos through the app's file storage with their Persian alt text. Where the sample content has no data for a page, create realistic Persian data in the same style.
4. Keep the forbidden-style check (`npm run check:ds`, part of `npm run check`) covering `app/**` and `src/**`, and fix everything it finds. Run `node docs/design-system/qa/ds-audit.mjs` now for a baseline and fix its FAIL items (stylesheets, fonts, brand, photos, status, icons) early.
5. Go through every route group (public → user → vet → association → genetics → market → content → admin → author) with the demo data at 390 and 1440, and bring each page to its pattern and key screen (K1–K19, images in `docs/design-system/key-screens/`) at close fidelity. Start with `/`: v1.0.4 (see `docs/design-system/CHANGELOG.md`) redesigned the home page — framed sections, featured breed, market and shop, vets and centres, club covers, counts with steps, CtaBand with a photo (P01, key screen K1). Save screenshots to `docs/qa/design-system/`.
6. Log every decision as DEC-NNNN, every missing piece in `docs/design-system/GAPS.md`.
7. **Final QA — required before you call the work done:** follow `docs/design-system/QA-FINAL-RECONCILIATION.md` from start to finish. Compare the entire design system (links + offline copy) and every key screen with the code, using `qa/ds-audit.mjs` and `qa/compare-key-screens.mjs`. Implement everything that is missing from the design system. Repeat until the audit shows 0 FAIL and every REVIEW item is closed. Then write `docs/qa/design-system/QA-REPORT.md` and give me the report: pages done, gaps, photos used (78/78), checks run, audit result.

Do not build dark mode or the article reading tools (backlog). Do not change product behaviour. Communicate with me in Persian.
