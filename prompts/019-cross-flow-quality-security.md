# PROMPT-019 — بررسی یکپارچه فلو، امنیت و کیفیت بصری

## Purpose
Read ACCEPTANCE_MATRIX.md and map every row to actual code, checks and evidence. Run complete official path KYC->animal->membership->referral->chip/sample->registration->receipt->shipment->parentage/payment->pedigree->permit->dates->birth->two-party allocation->card, plus independent kennel/foreign/personal/appeal/postal branches.

## Traceability
Sections: s01, s02, s03, s04, s05, s06, s07, s08, s09, s10, s11, s12, s13, s14, s15, s16, s17, s18, s19, s20, s21, s22, s23, s24, s25, s26, s27, s28, s29; decisions: D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D11, D12, D13, D14, D15, D16, D17, D18, D19

```text
You are executing PROMPT-019: بررسی یکپارچه فلو، امنیت و کیفیت بصری.

Read first:
CLAUDE.md, EXECUTION_CONTRACT.md, Requirements.md sections 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, IMPLEMENTATION_DECISIONS.md, DECISIONS.md, IMPLEMENTATION_STATUS.md and the relevant existing source/tests. Read linked Flow/Prototype/DS only as appropriate through available read-only tools. Inspect repository changes first. Do not duplicate completed work.

Objective and required implementation:
1. Read ACCEPTANCE_MATRIX.md and map every row to actual code, checks and evidence. Run complete official path KYC->animal->membership->referral->chip/sample->registration->receipt->shipment->parentage/payment->pedigree->permit->dates->birth->two-party allocation->card, plus independent kennel/foreign/personal/appeal/postal branches.
2. Cover error/resume and asynchronous ordering: code reuse/races, receipt correction/resampling, missing parent result vs technical lookup, callback replay, stale approvals, birth correction/death, pending membership number and inactive vet existing tasks.
3. Inspect access controls, private downloads, server input validation, upload limits, session/CSRF strategy, rate limits, duplicate notifications, secret/log redaction and dependency risks. Run concurrency tests against real isolated persistence, not only mocked repository calls.
4. Compare rendered mobile/desktop screens to accessible prototype/DS references; preserve logo/fonts/RTL/spacing/fields and scoped operator pages. Record screenshots and what was observed. If reference unavailable keep visual match UNVERIFIED and flag required remaining gate, not approved by count.
5. Track five independent claims: domain correctness, page/control coverage, visual fidelity, link integrity, real interaction verification. No page count implies quality. Legacy MAP-001/INC-01/INC-02 remain historical/unresolved unless specific evidence closes them.
6. Fix material failures and rerun affected checks. Produce docs/qa/phase-1-acceptance.md and integration readiness table listing local/sandbox/live/unavailable distinctly. Do not call phase complete with missing mandatory verification.

Validation that must actually run:
Run actual selected-stack typecheck/lint/build, domain/integration concurrency suites, critical browser journeys and visual inspection. Record commands, counts, skips and evidence per requirement. Required gates: domain-regression, cross-flow-browser, security-review, visual-reference-review.

Cross-cutting constraints:
Preserve D01–D19 and Phase 1 exclusions. Use real persistence and backend actor/entity authorization; all asynchronous operations preserve request/resume context. Every feature covers its real states, audit, notifications and item-level outcomes. Synthetic fixtures must be isolated and clearly labeled. Source/prototype conflicts resolve by precedence, not by convenience. Do not modify Figma. Fill gaps in code with DS; do not redesign approved flows.

Autonomous decisions:
For unspecified technical details inspect evidence, choose the smallest compatible solution, record DEC-NNNN with rationale/impact and tell the user in Persian. Do not wait for ordinary approval. Unknown real tariffs, accounts, issuer approvals or integration success are facts to configure/verify, not inventions. A genuine unavailable integration is recorded with its exact scope while independent work continues.

Completion and Git (mandatory):
- Use docs/reports/README.md. Write docs/reports/PROMPT-019.json with status COMPLETE only when all work and required gate records passed; otherwise PARTIAL/BLOCKED and never mark done. Mention concrete evidence and remaining integration/readiness limits.
- Update implementation status, decisions and traceability evidence. Preserve Requirements.md/reference originals and unrelated user changes.
- Review/stage only this task's changes; Claude itself makes a local Git commit containing PROMPT-019 in the message. Verify actual success, do not claim a proposed commit happened.
- Run `node tools/runner.mjs complete 19 --commit HEAD` only with committed COMPLETE evidence. Then commit PROJECT_STATUS.md separately, following CLAUDE.md. No manual-user done gate, no empty or fake commits, no push.
- Report behavior, files/migrations, tests actually run, new decisions and their impact, real limitations, work/progress hashes and next eligible prompt in Persian. If the user requested full execution, continue to next eligible prompt without asking for routine permission.
```
