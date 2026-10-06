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
| 10 | Audit row person name and readable subject | `/admin/audit` | Role + target type/id; long values clamped to two lines with the full text in `title` (no client toggle). Audit rows store only an account id. | DEC-0228 |
| 11 | ActionOwner labels for marketplace roles | `/market/*` queues | Team names: ناظر آگهی، داور بازار، مالی بازار، پشتیبانی بازار، بررسی فروشندگان، بررسی کاتالوگ، ناظر جفت‌یابی. Confirmed by the product owner (2026-10-06). | DEC-0228, DEC-0230 |
| 12 | Case age on handovers, trust questions, reviews | `/market/handovers`, `/market/trust` | No age column: their queries return no submission time. | DEC-0228 |
| 13 | «بدون دانلود» note on seller documents | `/market/sellers` | Omitted: `/api/files` may serve a download, so the note would be untrue. | DEC-0228 |
| 14 | Raw status codes on promotion rules, review status, market setting value | `/market/promotions`, `/market/trust`, `/market/settings` | Kept as is: browser tests read the stored values. To migrate together with the dictionary (gap 4). | DEC-0228 |
| 15 | Cart line form (quantity input + remove) | `/shop/cart` | Existing forms placed in the CartRow quantity slot. | DEC-0229 |
| 16 | RadioCard as links (delivery method, vet path) | `/shop/cart`, `/account/vet-profile` | `.hz-option` links with `aria-current`. | DEC-0229 |
| 17 | Sub-navigation for the mating-finder account area | `/account/mating-finder/*` | Scrolling chips. | DEC-0229 |
