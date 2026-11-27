# Design system v1.0.4 — final QA report

2026-11-27 · HEAD before 1ce3ef5 · after a1e2ffc

## Commands run

| Command | Result |
|---|---|
| `npx tsc --noEmit -p .` | clean |
| `npm run check:ds` | no forbidden styles |
| `node tools/browser-tests.mjs` (isolated DB, production build) | 281 tests · 281 pass · 0 fail (HEAD a1e2ffc) |
| targeted `node --test` DB/domain suites per change | operations, vet-student, health, market-inquiry, market-discovery, animal-listing, animal-handover, deal-settlement, moderation, commerce catalog, document render, queue-tiles: all pass |
| `node tools/qa-key-screens.mjs` → `docs/design-system/qa/compare-key-screens.mjs` | see Key screens |
| `node docs/design-system/qa/ds-audit.mjs` | FAIL 0 · REVIEW 4 · OK 9 |

## Summary

- Audit: FAIL 0 · REVIEW 4 · OK 9. The REVIEW items are listed below and stay open; they are not closed by this report.
- Fix-pack tracker (454 findings): FIXED 177 · PARTIAL 42 · OPEN 234 · DECIDED_NO 1.
- Key screens: 41 references compared · 0 with no structural difference · 41 with listed differences · 0 not configured.
- Stylesheets, tokens, fonts, brand files, the 81 status keys and the 128 icons are identical to v1.0.4 (audit OK rows).
- **Not done:** the OPEN and PARTIAL rows below are real remaining work, not deferred evidence. Design-system work is therefore not complete, even with the audit at 0 FAIL.

## Foundations

Audit OK rows: `bundle.css` identical to v1.0.4; `tokens.css` matches (font URLs aside); 137 tokens; 11 IRANSansX woff2 identical; 25 brand files identical; 78 manifest photos imported by the demo seed; 81 status keys; 128 icons. FND findings: see the tracker (T25, T26, T27).

## Components

The audit reports which components have classes the app never renders (REVIEW). Component-level status per finding is in `fix-pack-1405-07-26/audit-tracker.csv` (column Status, Commit = DEC). Components built or completed in this pass: QueueTiles/StatTile states (DEC-0241), OpsShell PageHeader (DEC-0242), ConversationList/OfferCard (DEC-0243), BuyBox/VariantPicker/QuantityStepper/Rating (DEC-0244), FilterPanel drawer (DEC-0246), Timeline a11y (DEC-0248), OtpField (DEC-0251), MoneyField (DEC-0252), Identifier copy (DEC-0254), A4 document template (DEC-0240).

## Fix-pack themes

| Theme | FIXED | PARTIAL | OPEN |
|---|---|---|---|
| T01 | 7 | 0 | 0 |
| T02 | 18 | 0 | 0 |
| T03 | 12 | 0 | 0 |
| T04 | 8 | 0 | 2 |
| T05 | 29 | 0 | 0 |
| T06 | 23 | 5 | 0 |
| T07 | 9 | 2 | 0 |
| T08 | 9 | 2 | 0 |
| T09 | 11 | 2 | 0 |
| T10 | 6 | 7 | 0 |
| T11 | 4 | 4 | 4 |
| T12 | 7 | 5 | 5 |
| T13 | 4 | 0 | 8 |
| T14 | 3 | 3 | 7 |
| T15 | 3 | 1 | 15 |
| T16 | 2 | 2 | 11 |
| T17 | 1 | 0 | 7 |
| T18 | 0 | 0 | 4 |
| T19 | 2 | 1 | 3 |
| T20 | 4 | 1 | 6 |
| T21 | 0 | 1 | 23 |
| T22 | 1 | 1 | 23 |
| T23 | 0 | 1 | 11 |
| T24 | 2 | 0 | 13 |
| T25 | 1 | 0 | 7 |
| T26 | 1 | 1 | 9 |
| T27 | 1 | 0 | 7 |
| T28 | 2 | 1 | 14 |
| T29 | 3 | 1 | 10 |
| T30 | 2 | 1 | 19 |
| T31 | 1 | 0 | 7 |
| T32 | 0 | 0 | 7 |
| T33 | 0 | 0 | 8 |
| T34 | 1 | 0 | 4 |

## Key screens

Evidence: `docs/qa/design-system/key-screens/` (`*.ref.png`, `*.app.png`, `*.diff.md`). The comparison is structural (headings, landmarks, classes, primary buttons, scroll, alt, font); the two images still need an eye check.

| Screen | Width | Route | Result |
|---|---|---|---|
| K01-home-D | 1440 | `/` | 3 issue(s) → `K01-home-D.diff.md` |
| K01-home-M | 390 | `/` | 3 issue(s) → `K01-home-M.diff.md` |
| K02-dashboard-D | 1440 | `/dashboard` | 2 issue(s) → `K02-dashboard-D.diff.md` |
| K02-dashboard-M | 390 | `/dashboard` | 2 issue(s) → `K02-dashboard-M.diff.md` |
| K02-dashboard-new-M | 390 | `/dashboard` | 2 issue(s) → `K02-dashboard-new-M.diff.md` |
| K02-dashboard-ops-D | 1440 | `/dashboard` | 2 issue(s) → `K02-dashboard-ops-D.diff.md` |
| K03-kyc-desk-D | 1440 | `/assoc/kyc/ca349939-a767-4c85-bbf4-39655822a924` | 3 issue(s) → `K03-kyc-desk-D.diff.md` |
| K03-kyc-desk-M | 390 | `/assoc/kyc/ca349939-a767-4c85-bbf4-39655822a924` | 3 issue(s) → `K03-kyc-desk-M.diff.md` |
| K04-article-D | 1440 | `/articles/c-600375` | 3 issue(s) → `K04-article-D.diff.md` |
| K04-article-M | 390 | `/articles/c-600375` | 3 issue(s) → `K04-article-M.diff.md` |
| K05-vets-D | 1440 | `/veterinarians` | 2 issue(s) → `K05-vets-D.diff.md` |
| K05-vets-M | 390 | `/veterinarians` | 2 issue(s) → `K05-vets-M.diff.md` |
| K06-listing-D | 1440 | `/animals-market/224c96c4-c952-438c-821d-69a4e871a719` | 3 issue(s) → `K06-listing-D.diff.md` |
| K06-listing-M | 390 | `/animals-market/224c96c4-c952-438c-821d-69a4e871a719` | 4 issue(s) → `K06-listing-M.diff.md` |
| K07-product-D | 1440 | `/shop/product` | 3 issue(s) → `K07-product-D.diff.md` |
| K07-product-M | 390 | `/shop/product` | 3 issue(s) → `K07-product-M.diff.md` |
| K08-login-D | 1440 | `/login` | 2 issue(s) → `K08-login-D.diff.md` |
| K08-login-M | 390 | `/login` | 2 issue(s) → `K08-login-M.diff.md` |
| K09-animal-D | 1440 | `/animals/77209d83-d4d2-4b65-8dfe-c970af888e64` | 2 issue(s) → `K09-animal-D.diff.md` |
| K09-animal-M | 390 | `/animals/77209d83-d4d2-4b65-8dfe-c970af888e64` | 4 issue(s) → `K09-animal-M.diff.md` |
| K10-animal-new-D | 1440 | `/animals/new` | 3 issue(s) → `K10-animal-new-D.diff.md` |
| K10-animal-new-M | 390 | `/animals/new` | 3 issue(s) → `K10-animal-new-M.diff.md` |
| K11-request-D | 1440 | `/requests/28a7d5fc-f14b-474e-a747-c9cdc96daf9b` | 3 issue(s) → `K11-request-D.diff.md` |
| K11-request-M | 390 | `/requests/28a7d5fc-f14b-474e-a747-c9cdc96daf9b` | 3 issue(s) → `K11-request-M.diff.md` |
| K12-vet-checkin-D | 1440 | `/vet/check-in` | 3 issue(s) → `K12-vet-checkin-D.diff.md` |
| K12-vet-checkin-M | 390 | `/vet/check-in` | 3 issue(s) → `K12-vet-checkin-M.diff.md` |
| K13-assoc-home-D | 1440 | `/assoc` | 1 issue(s) → `K13-assoc-home-D.diff.md` |
| K13-assoc-home-M | 390 | `/assoc` | 2 issue(s) → `K13-assoc-home-M.diff.md` |
| K14-market-listings-D | 1440 | `/market/listings` | 2 issue(s) → `K14-market-listings-D.diff.md` |
| K14-market-listings-M | 390 | `/market/listings` | 2 issue(s) → `K14-market-listings-M.diff.md` |
| K15-settings-D | 1440 | `/admin/settings` | 2 issue(s) → `K15-settings-D.diff.md` |
| K15-settings-M | 390 | `/admin/settings` | 3 issue(s) → `K15-settings-M.diff.md` |
| K15-settings-edit-M | 390 | `/admin/settings` | 3 issue(s) → `K15-settings-edit-M.diff.md` |
| K16-content-report-D | 1440 | `/content/reports/fc53a2e5-451b-4d4e-aaa3-b526edbe54dc` | 3 issue(s) → `K16-content-report-D.diff.md` |
| K16-content-report-M | 390 | `/content/reports/fc53a2e5-451b-4d4e-aaa3-b526edbe54dc` | 3 issue(s) → `K16-content-report-M.diff.md` |
| K17-listing-chat-D | 1440 | `/account/listings/a2de131b-5ee6-4f55-9605-a7ddaa75ae80/requests` | 3 issue(s) → `K17-listing-chat-D.diff.md` |
| K17-listing-chat-M | 390 | `/account/listings/a2de131b-5ee6-4f55-9605-a7ddaa75ae80/requests` | 3 issue(s) → `K17-listing-chat-M.diff.md` |
| K18-pedigree-doc-D | 1440 | `/documents/pedigree/4bc93f14-c296-408d-bc5f-b56b6cb7f897` | 3 issue(s) → `K18-pedigree-doc-D.diff.md` |
| K18-pedigree-doc-M | 390 | `/documents/pedigree/4bc93f14-c296-408d-bc5f-b56b6cb7f897` | 4 issue(s) → `K18-pedigree-doc-M.diff.md` |
| K19-genetics-samples-D | 1440 | `/genetics/samples` | 2 issue(s) → `K19-genetics-samples-D.diff.md` |
| K19-genetics-samples-M | 390 | `/genetics/samples` | 2 issue(s) → `K19-genetics-samples-M.diff.md` |

## Open REVIEW items (audit)

**FAIL 1 · REVIEW 4 · OK 9**
## REVIEW · Status
## REVIEW · Icons
## REVIEW · Components
## REVIEW · Key screens

## Gaps and decisions

Gaps: `docs/design-system/GAPS.md` (#1–#25). Decisions of this pass: DEC-0240 to DEC-0254 in `DECISIONS.md`. Owner WIP left untouched and uncommitted: dashboard payments DataTable, `(list)` route moves with `loading.tsx`, admin audit/roles/communities/centres tables, market commission/orders.
