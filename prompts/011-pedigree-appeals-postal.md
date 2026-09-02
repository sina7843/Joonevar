# PROMPT-011 — شجره‌نامه، اعتراض ژنتیک و درخواست پستی

## Purpose
Implement post-shipment issuance checkout and join gate: ready valid Parentage Result AND verified Hamzist issuance payment. Centre receipt alone does not satisfy issuance payment. Result remains visible when payment missing.

## Traceability
Sections: s10, s14, s21, s22, s23, s26; decisions: D07, D14, D16, D17, D19

```text
You are executing PROMPT-011: شجره‌نامه، اعتراض ژنتیک و درخواست پستی.

Read first:
CLAUDE.md, EXECUTION_CONTRACT.md, Requirements.md sections 10, 14, 21, 22, 23, 26, IMPLEMENTATION_DECISIONS.md, DECISIONS.md, IMPLEMENTATION_STATUS.md and the relevant existing source/tests. Read linked Flow/Prototype/DS only as appropriate through available read-only tools. Inspect repository changes first. Do not duplicate completed work.

Objective and required implementation:
1. Implement post-shipment issuance checkout and join gate: ready valid Parentage Result AND verified Hamzist issuance payment. Centre receipt alone does not satisfy issuance payment. Result remains visible when payment missing.
2. Issue pedigrees independently per eligible animal with idempotency, correct animal/parents and version links; no group status hiding partial success. Secure document and timeline access.
3. Build in-app appeal from exact result/animal, user text, same centre queue, review/response and optional corrected result as new version. Retain disputed result and relation to appeal. No invented appeal fee, deadline or automatic resampling.
4. If corrected results affect an already issued document, preserve original document and log a conservative version/provenance handling decision; do not silently rewrite official historical bytes or revoke permits. Keep current result and issuance provenance clear.
5. After document issuance implement postal request capture: document, recipient, address (optionally prefilled with user selection), submission confirmation. Do not require residence completion in KYC. No shipping integration, tariff/label/tracking/delivery states or claim actual dispatch.
6. Build user and operator actions with resource permissions, neutral states, notification exact target and history.

Validation that must actually run:
Test both orderings of payment/result, duplicate issuance callbacks, independent batch result, result visible unpaid, user cannot edit result via appeal, corrected result preserving prior evidence, postal request tied to issued document and no fake shipment. Required gates: pedigree-appeal-integration, pedigree-browser.

Cross-cutting constraints:
Preserve D01–D19 and Phase 1 exclusions. Use real persistence and backend actor/entity authorization; all asynchronous operations preserve request/resume context. Every feature covers its real states, audit, notifications and item-level outcomes. Synthetic fixtures must be isolated and clearly labeled. Source/prototype conflicts resolve by precedence, not by convenience. Do not modify Figma. Fill gaps in code with DS; do not redesign approved flows.

Autonomous decisions:
For unspecified technical details inspect evidence, choose the smallest compatible solution, record DEC-NNNN with rationale/impact and tell the user in Persian. Do not wait for ordinary approval. Unknown real tariffs, accounts, issuer approvals or integration success are facts to configure/verify, not inventions. A genuine unavailable integration is recorded with its exact scope while independent work continues.

Completion and Git (mandatory):
- Use docs/reports/README.md. Write docs/reports/PROMPT-011.json with status COMPLETE only when all work and required gate records passed; otherwise PARTIAL/BLOCKED and never mark done. Mention concrete evidence and remaining integration/readiness limits.
- Update implementation status, decisions and traceability evidence. Preserve Requirements.md/reference originals and unrelated user changes.
- Review/stage only this task's changes; Claude itself makes a local Git commit containing PROMPT-011 in the message. Verify actual success, do not claim a proposed commit happened.
- Run `node tools/runner.mjs complete 11 --commit HEAD` only with committed COMPLETE evidence. Then commit PROJECT_STATUS.md separately, following CLAUDE.md. No manual-user done gate, no empty or fake commits, no push.
- Report behavior, files/migrations, tests actually run, new decisions and their impact, real limitations, work/progress hashes and next eligible prompt in Persian. If the user requested full execution, continue to next eligible prompt without asking for routine permission.
```
