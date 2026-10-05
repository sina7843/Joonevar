# Start prompt for Claude Code (copy everything below the line)

---

You are continuing the Hamzist design-system integration on branch `design-system-v1`.
This is a binding user instruction (CLAUDE.md source precedence item 1).

1. Read `docs/design-system/CLAUDE-CODE-DESIGN-SYSTEM-RULES.md` completely, then `docs/design-system/demo-content/DEMO-DATA-SPEC.md` and `docs/design-system/demo-content/images-manifest.json`. The design system in `docs/design-system/` (v1.0.3) is the only visual source; the old prototype layout no longer applies to visuals.
2. Commit the new instruction files as their own `docs(design-system)` commit (CLAUDE.md section + the files above), following CLAUDE.md's Git rules.
3. Extend the existing sample seed (`src/db/seed/sample-content.ts`, DEC-0269) to everything in the spec — one seed, non-production only, idempotent, removable — importing all 78 approved photos through the app's file storage with their Persian alt text. Where the sample content has no data for a page, create realistic Persian data in the same style.
4. Add the forbidden-style check to `npm run check` and fix everything it finds.
5. Go through every route group (public → user → vet → association → genetics → market → content → admin → author) with the demo data at 390 and 1440, and bring each page to its pattern and key screen (K1–K19, images in `docs/design-system/key-screens/`) at close fidelity. Start with `/` and the site header: v1.0.3 (see `docs/design-system/CHANGELOG.md`) changed the home section order, the quick links and the «ورود / ثبت‌نام» button. Save screenshots to `docs/qa/design-system/`.
6. Log every decision as DEC-NNNN, every missing piece in `docs/design-system/GAPS.md`, and finish with a report: pages done, gaps, photos used (78/78), checks run.

Do not build dark mode or the article reading tools (backlog). Do not change product behaviour. Communicate with me in Persian.
