# Design system gaps

Where the system lacks something, the closest existing part is used and the gap is logged here (CLAUDE-CODE-DESIGN-SYSTEM-RULES §4).

| # | What | Where | Used instead | DEC |
|---|---|---|---|---|
| 1 | Support hours, phone and trust badge in SiteFooter | `src/public/site-shell.tsx` | Omitted: no real contact facts or issuer exist; inventing them is forbidden (CLAUDE.md). Footer keeps «تماس با ما». | DEC-0226 |
| 2 | Waiting / overdue counts in the OpsShell sidebar | `src/ui/shell.tsx` | No pill shown (the system allows none while unknown); needs per-queue count services. | DEC-0226 |
| 3 | PublicShell top-bar search field (desktop) | `src/ui/shell.tsx` | Not shown; the app has no signed-in record search endpoint yet. | DEC-0226 |
| 4 | Callers on the status dictionary | all StatusBadge callers | `src/ui/status-dictionary.ts` (81 keys, tested against the system file) and `StatusBadge status=` exist; module-specific labels (`*_STATUS_FA`) still pass tone + label until each module maps its states to a dictionary key. | DEC-0226 |
| 5 | «پشتیبانی، شنبه تا چهارشنبه، ۹ تا ۱۷» in the contact menu item | `src/public/sections.ts` | Neutral description «پشتیبانی و پاسخ به پرسش‌ها» (hours are not a known fact). | DEC-0226 |
| 6 | People avatars (10 photos) | account menu, sidebar user box, applicant rows | Initial on `bg-brand-subtle` (`.hz-avatar`); `profiles` has no image column. | DEC-0227 |
| 7 | Club post image never public | club posts | Product gap: club-post publish leaves `publishAt` empty, so the public image reader refuses it. Not changed (behaviour). | DEC-0227 |
| 8 | Listing statuses reserved / sold / expired, expired centre licence | demo data | Not seedable through services (system-set states); demo rows are published. | DEC-0227 |
| 9 | OTP as six boxes (DS *OtpField*) | `/login` | One LTR code input (autofill `one-time-code`, browser tests fill one field). | DEC-0226 |
