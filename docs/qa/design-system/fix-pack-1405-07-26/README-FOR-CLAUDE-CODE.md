# Hamzist — fix pack for Claude Code (design system v1.0.4 + design/code audit)

**For:** Claude Code in the `App` repository (`X:\Work\01_Clients\دراگون\هم زیست\App`), and the developers working with it.
**Binding:** this is an explicit instruction from the product owner (CLAUDE.md source precedence item 1). Communicate with the product owner in Persian.
**Date:** 26 Mehr 1405 (18 Oct 2026). It covers design system v1.0.4 with decision 14, and the audit of App `main` @ `6d4ac9f` (23 Mehr 1405).

**Goal:** bring the whole app to design system v1.0.4.

1. Fix every one of the **454 audit findings**, theme by theme.
2. Ask before anything that needs new data or behaviour.
3. Build the new home page **K1** exactly as designed.
4. Finish with the full final QA.

---

## 1. What is in this pack

| Path | What it is | Use it for |
|---|---|---|
| `README-FOR-CLAUDE-CODE.md` | This file. | The procedure. |
| `START-PROMPT.md` | The message to paste into Claude Code. | Starting the work. |
| `fix-pack/WORKPLAN.md` | All 34 themes (T01–T34) in work order, each with its finding ids. Each finding is marked ★ v1.0.4, **D** (needs a decision), **✓D** (already decided) or **14** (decision 14). | The order of work. |
| `fix-pack/audit-tracker.csv` | One row per finding (454), with Status, Commit and Note columns. 66 rows start as `WAITING_DECISION`. | Tracking. Update it in every commit. |
| `fix-pack/DECISIONS-NEEDED.md` | In Persian, for the product owner. The 66 findings that need new data or behaviour, grouped by theme, with answer slots. Also lists 7 findings already answered by approved decisions. | Asking the product owner before changing behaviour or data. |
| `fix-pack/APPROVED-DECISIONS.md` | Everything the product owner has settled: K1, decision 14 (no fees on public pages), decisions 1–13, fonts, brand, photos and backlog. Also says how to treat older DEC and GAPS rows. | Resolving conflicts. |
| `design-code-audit/` | The audit as delivered: `.md` (full report in Persian), `.json` (machine-readable: `themes[]`, `findings[]` with `design`, `code` / `body`, `current`, `fix`, `sevFinal`, `orgFinal`), `.csv` and `.html` (filterable). | The details of each finding: design source, code `path:line`, proposed fix. |
| `hamzist-design-system-v1/` | The complete design system package v1.0.4: rules, foundations, 129 components, 12 patterns, tokens, `bundle.css`, IRANSansX woff2, brand files, 78 photos, key screens (PNG + exact HTML), demo-data spec, the QA tools (`qa/`) and `QA-FINAL-RECONCILIATION.md`. | The design source. It goes to `docs/design-system/`. |
| `PACKAGE-README.md` | The package's own Persian README. | Context for people. |

**Live links (same Claude account):**

- Design system: https://claude.ai/artifact/XBu7b9eyzZKB3E31kc8vFn
- Key screens: https://claude.ai/artifact/85Z6AZDVJRPzhWvYAEkY92

How to use them:

- Read them with the `Artifact` tool (`action: "read"`, plus `path` for one file) when you have it. Otherwise use the offline copy in `hamzist-design-system-v1/`, which matches them as of 26 Mehr 1405.
- On the key-screens canvas, only the pages «۱۸ صفحه کلیدی × ۲ اندازه» and «برند و آیکون اپ» are approved. The home-page option boards (optA/B/C, v1–v5, mix) are **not specs**.

## 2. Order of authority

When two sources disagree, the higher one wins:

1. The product owner's answers in this session and in `DECISIONS-NEEDED.md`.
2. `fix-pack/APPROVED-DECISIONS.md` (decision 14 included).
3. Design system v1.0.4: `CHANGELOG.md` → key screen (html + png) → pattern → component README → foundations.
4. The audit (`design-code-audit/`). It tells you **what is wrong and where**. When its "design" text and the design system differ, the design system wins.
5. Older repo notes:
   - DEC entries made for v1.0.3 (for example DEC-0225 naming v1.0.3);
   - GAPS rows that were technical shortcuts;
   - the previous `START-PROMPT-FOR-CLAUDE-CODE.md`.

Product behaviour still comes from Requirements.md / D01–D19. Nothing here changes behaviour without a recorded decision.

## 3. The new home page K1 comes first and must not be mixed with the old one

The home page was fully redesigned in v1.0.4 (decision 13), with decision 14 added on 26 Mehr 1405. The code still has the v1.0.3 home.

**The only sources for `/` are:**

- `hamzist-design-system-v1/design-system/patterns/P01-editorial-home.md`;
- `key-screens/html/K01-home-D.html` (1440) and `K01-home-M.html` (390), with their PNGs;
- the «Home compositions» block of `components/bundle.css`.

**Superseded — do not keep or rebuild:**

- the full-width cream band behind the Hero (`hz-band hz-bleed`);
- the separate «روش کار» section;
- the old stats box;
- 6 breed tiles in a grid;
- the avatar ClubCard row;
- the plain CtaBand;
- the quick-entry search field and the «استعلام اصالت» tile;
- the home order in DEC-0186 (data sections first).

**The current K1 order:**

1. «تازه‌ها»
2. Hero (peach frame)
3. «دنبال چه می‌گردید؟»
4. «نژادهای سگ» (featured breed + 5 tiles in `.hz-row`)
5. «بازار همزیست»
6. «دامپزشکان و مراکز معتمد»
7. «انجمن‌ها و کلاب‌ها» (`ClubCard --cover`)
8. «همزیست در یک نگاه» (counts + 3 steps)
9. «خدمات همزیست»
10. `CtaBand --media`

**Decision 14:** the «خدمات همزیست» cards have **no fee footer, no «تعیین‌نشده» and no footnote**, and the link is «مشاهده همه» → `/services`. This replaces the fee part of finding **KPUB-010**. The rest of KPUB-010 still applies (cream frame, white cards).

**Swipe rows:** card rows on phones stay inside the frame padding. The cards never touch the frame edge, and the next card peeks.

**The audit's home findings already describe v1.0.4.** These are T01, T02 (18 findings) and the K1 rows of T13, T29 and T12. I checked them against the design, and the only conflict is the fee part of KPUB-010. If you find any other statement about `/` that does not match the K1 html, K1 wins. Note it in the tracker.

Record one DEC at the start. It should say:

- v1.0.4 replaces v1.0.3 (DEC-0225);
- K1 replaces DEC-0186's home order;
- DEC-0186's no-fee rule stays as decision 14.

## 4. Setup (first commit)

1. Record `git status --short` and HEAD. Work on branch `design-system-v1` (create it from `main` if it does not exist). Follow CLAUDE.md's Git rules: explicit paths, no `add -A`, no history rewrite.
2. Copy the contents of `hamzist-design-system-v1/` into `docs/design-system/`, replacing the old files.
   - Do **not** copy its `fonts/` folder (full desktop family, not for the repo).
   - Keep the repo-only `GAPS.md`.
   - Replace `PACKAGE-README.md` with this pack's `PACKAGE-README.md`.
3. Copy this pack into `docs/qa/design-system/fix-pack-1405-07-26/`:
   - `fix-pack/*`;
   - `design-code-audit/*`;
   - this README;
   - `START-PROMPT.md`.

   The tracker lives there from now on.
4. Update the CLAUDE.md "Design System" section so it points to v1.0.4, decision 14 and this fix pack.
5. Commit: `docs(design-system): v1.0.4 + decision 14 and the design/code audit fix pack`.
6. If HEAD is no longer `6d4ac9f`, note it. Before fixing each finding, confirm it still reproduces at HEAD. Mark findings that are already fixed as `ALREADY_FIXED` with the commit.

## 5. How to work

**Order:** follow `fix-pack/WORKPLAN.md`.

- **Phase 1:** T01 (CSS sync) → T02 (K1) → T03, T04, T05, T06, T09, T10.
- **Phase 2:** the priority-2 themes.
- **Phase 3:** the priority-3 themes.
- Inside each theme, work high → medium → low.
- Keep the app runnable after every commit.

**For each finding:**

1. Open its entry in `design-code-audit/design-code-discrepancies.json`. Read `design`, `code` / `body`, `current` and `fix`.
2. Read the design source it cites: component README, preview.html, pattern, key-screen html.
3. Fix it **from the design system**:
   - use its components, `.hz-*` classes, tokens, icons, copy and photos;
   - do not restyle, invent variants, colours, statuses, icons or copy, or change behaviour.
4. Check the page with demo data at **390 and 1440** next to its key screen or pattern.
   - Use `node docs/design-system/qa/compare-key-screens.mjs --base http://localhost:3000 --only <K..>` for key screens.
   - Look at both images yourself.
5. Update `audit-tracker.csv`:
   - Status is one of `FIXED`, `ALREADY_FIXED`, `WAITING_DECISION`, `DECIDED_NO` (with GAPS row + DEC) or `NOT_REPRODUCIBLE` (with reason).
   - Fill the Commit column, and Note when useful.

**Commits:** one theme, or one coherent part of a theme, per commit. Example: `fix(ui): T05 decision desk mobile bar and document preview (KOPS-001, CMPA2-010 …)`. Run `npm run check` before each commit, and `npm run test:browser` when a page's markup or test ids change. Update tests to the design. Never weaken a test.

**Shared parts first:** when a theme needs a shared component (StickyActionBar, DataTable, BulkActionBar, OtpField, MoneyField, UnsetValue, ArticleCard and so on), build it once in `src/ui/*` from its README. Then replace the hand-written markup everywhere the audit lists it.

## 6. Items that need a decision: ask first

There are 66 findings marked **D** (`WAITING_DECISION`). They need new data, settings or behaviour.

1. Build now only the part of each that needs no new data, using the design's hidden / empty / «تعیین‌نشده» states. Never invent values.
2. Early in phase 1, fill the line «پیشنهاد Claude Code» for every item in `fix-pack/DECISIONS-NEEDED.md` (short, in Persian). Send the file to the product owner and wait. Keep working on the code items in the meantime.
3. When the answers come back:
   - record one DEC per decision;
   - implement «انجام شود»;
   - finish the UI part of «فقط بخش ظاهری»;
   - add a GAPS.md row for «فعلاً نه»;
   - update the tracker.
4. The 7 findings marked **✓D** are already answered: by approved design decisions 7g, 9 and 11, or (ReadTime) because they can be computed from existing data. Implement them and cite the decision in the DEC.

## 7. Done means

- [ ] Every one of the 454 rows in `audit-tracker.csv` has a final status (`FIXED`, `ALREADY_FIXED`, `DECIDED_NO` or `NOT_REPRODUCIBLE`). None is still `WAITING_DECISION` unless the product owner has not answered yet, and that is reported.
- [ ] `/` matches K1 (`K01-home-D/M`) at 390 and 1440, with decision 14 applied.
- [ ] `node docs/design-system/qa/ds-audit.mjs` shows **0 FAIL**, and every REVIEW item is closed.
- [ ] **`docs/design-system/QA-FINAL-RECONCILIATION.md` has been run end to end.** This means the whole design system and every route and key screen were compared with the code, and anything still missing was filled in from the design system. The audit is a list of known issues, not proof that nothing else is missing.
- [ ] `npm run check` and `npm run test:browser` pass.
- [ ] `docs/qa/design-system/QA-REPORT.md` is written and includes:
  - a summary of the tracker (counts by status and theme);
  - the decisions taken;
  - GAPS opened and closed;
  - the audit result;
  - key-screen comparisons;
  - photos 78/78.

Finish with a report to the product owner, in Persian, covering:

- what was fixed (by theme);
- what is waiting for a decision;
- the gaps;
- the checks run;
- the commit hashes.
