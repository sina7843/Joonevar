# Start prompt for Claude Code (copy everything below the line)

---

This is a binding instruction from the product owner (CLAUDE.md source precedence item 1). Communicate with me in Persian.

The fix pack is in `<path of the unzipped pack>`.

1. Read `README-FOR-CLAUDE-CODE.md` completely, then `fix-pack/APPROVED-DECISIONS.md` and `fix-pack/WORKPLAN.md`.
2. Do the setup in README § 4:
   - work on branch `design-system-v1`;
   - copy `hamzist-design-system-v1/` into `docs/design-system/` (without `fonts/`);
   - copy the fix pack into `docs/qa/design-system/fix-pack-1405-07-26/`;
   - update CLAUDE.md;
   - make one `docs(design-system)` commit;
   - record the DEC that v1.0.4 replaces v1.0.3, that K1 replaces DEC-0186's home order, and that the no-fee rule stays (decision 14).
3. Fix the 454 findings of `design-code-audit/` in the order of `fix-pack/WORKPLAN.md`.
   - Start with T01 (copy the v1.0.4 `bundle.css` / `tokens.css`) and T02: rebuild `/` exactly as K1 (`key-screens/html/K01-home-D.html` and `-M.html`, P01).
   - Nothing from the old home layout survives.
   - The «خدمات همزیست» cards show no fee.
   - Fix every finding from the design system. Check each page at 390 and 1440 against its key screen or pattern. Keep `audit-tracker.csv` up to date in every commit.
4. Findings marked **D** need new data or behaviour.
   - Build only their UI part now.
   - Fill «پیشنهاد Claude Code» in `fix-pack/DECISIONS-NEEDED.md` and send it to me early. Wait for my answers before changing any data or behaviour, and keep working on the other items meanwhile.
5. When all themes are done, run `docs/design-system/QA-FINAL-RECONCILIATION.md` end to end:
   - compare the whole design system and every route and key screen with the code;
   - fill everything still missing from the design system;
   - run `ds-audit.mjs` until it shows 0 FAIL;
   - run `compare-key-screens.mjs` for all key screens;
   - run `npm run check` and `npm run test:browser`.
6. Write `docs/qa/design-system/QA-REPORT.md` and give me the final report:
   - what was fixed, by theme;
   - what is waiting for my decision;
   - gaps;
   - checks;
   - commit hashes.

Do not build dark mode or the article reading tools (backlog). Do not change product behaviour without a recorded decision.
