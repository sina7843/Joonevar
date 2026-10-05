# Design system gaps

Where the system lacks something, the closest existing part is used and the gap is logged here (CLAUDE-CODE-DESIGN-SYSTEM-RULES §4).

| # | What | Where | Used instead | DEC |
|---|---|---|---|---|
| 1 | Support hours, phone and trust badge in SiteFooter | `src/public/site-shell.tsx` | Omitted: no real contact facts or issuer exist; inventing them is forbidden (CLAUDE.md). Footer keeps «تماس با ما». | DEC-0226 |
| 2 | Waiting / overdue counts in the OpsShell sidebar | `src/ui/shell.tsx` | No pill shown (the system allows none while unknown); needs per-queue count services. | DEC-0226 |
| 3 | PublicShell top-bar search field (desktop) | `src/ui/shell.tsx` | Not shown; the app has no signed-in record search endpoint yet. | DEC-0226 |
| 4 | Status dictionary (81 keys) as `src/ui/status-dictionary.ts` | all StatusBadge callers | Callers still pass tone + label; badges render the system look. Migration pending. | DEC-0226 |
| 5 | «پشتیبانی، شنبه تا چهارشنبه، ۹ تا ۱۷» in the contact menu item | `src/public/sections.ts` | Neutral description «پشتیبانی و پاسخ به پرسش‌ها» (hours are not a known fact). | DEC-0226 |
