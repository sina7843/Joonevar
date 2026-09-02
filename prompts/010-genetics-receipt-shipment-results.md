# PROMPT-010 — فیش ژنتیک، ارسال نمونه و ثبت نتیجه

## Purpose
Normal pedigree entry requires registration sheet, valid chip/sample and known custodian. Reuse them; do not choose vet or collect again. Display one configured genetics centre and its real configured payment details; no centre selector.

## Traceability
Sections: s10, s12, s14, s21, s22, s23, s26; decisions: D07, D09, D16

```text
You are executing PROMPT-010: فیش ژنتیک، ارسال نمونه و ثبت نتیجه.

Read first:
CLAUDE.md, EXECUTION_CONTRACT.md, Requirements.md sections 10, 12, 14, 21, 22, 23, 26, IMPLEMENTATION_DECISIONS.md, DECISIONS.md, IMPLEMENTATION_STATUS.md and the relevant existing source/tests. Read linked Flow/Prototype/DS only as appropriate through available read-only tools. Inspect repository changes first. Do not duplicate completed work.

Objective and required implementation:
1. Normal pedigree entry requires registration sheet, valid chip/sample and known custodian. Reuse them; do not choose vet or collect again. Display one configured genetics centre and its real configured payment details; no centre selector.
2. Build direct-to-centre transfer information and receipt upload mapped to exact batch sample codes, centre-only review/needs-correction/approval, history and preservation. Centre receipt approval is separate from Hamzist document issuance payment.
3. Approved receipt notifies user and the actual sample custodian to send. Assigned custodian records shipment event against same sample code; user receives status. Centre receives, judges sample usability, processes and records result. Centre never samples.
4. After shipment, processing and Hamzist issuance payment are independent branches. Result may be produced/displayed without issuance payment; no false paid-processing lock.
5. For G0 attach Parentage Result to animal. For G1+ final result requires resolvable complete Parentage Results of both direct parents; otherwise waiting-parent-results. Retain ancestry/parent context and lookup errors.
6. Keep result version/technical-review stages consistent with F10 when visible; decide necessary technical fields without creating DNA Profile or second result identifier. Invalid sample triggers existing same-request resampling with preserved history.
7. Build full centre queue/detail/action/history for receipts, expected/received/invalid/processing/waiting-parent/final samples. No ownership/chip/permit mutation authority.

Validation that must actually run:
Test receipt rejection/resubmit, correct custodian-only shipment, sample-code continuity, processing before issuance payment, both missing/ready parent-result cases, invalid resampling and unauthorized centre mutation. Required gates: genetics-workflow, genetics-browser.

Cross-cutting constraints:
Preserve D01–D19 and Phase 1 exclusions. Use real persistence and backend actor/entity authorization; all asynchronous operations preserve request/resume context. Every feature covers its real states, audit, notifications and item-level outcomes. Synthetic fixtures must be isolated and clearly labeled. Source/prototype conflicts resolve by precedence, not by convenience. Do not modify Figma. Fill gaps in code with DS; do not redesign approved flows.

Autonomous decisions:
For unspecified technical details inspect evidence, choose the smallest compatible solution, record DEC-NNNN with rationale/impact and tell the user in Persian. Do not wait for ordinary approval. Unknown real tariffs, accounts, issuer approvals or integration success are facts to configure/verify, not inventions. A genuine unavailable integration is recorded with its exact scope while independent work continues.

Completion and Git (mandatory):
- Use docs/reports/README.md. Write docs/reports/PROMPT-010.json with status COMPLETE only when all work and required gate records passed; otherwise PARTIAL/BLOCKED and never mark done. Mention concrete evidence and remaining integration/readiness limits.
- Update implementation status, decisions and traceability evidence. Preserve Requirements.md/reference originals and unrelated user changes.
- Review/stage only this task's changes; Claude itself makes a local Git commit containing PROMPT-010 in the message. Verify actual success, do not claim a proposed commit happened.
- Run `node tools/runner.mjs complete 10 --commit HEAD` only with committed COMPLETE evidence. Then commit PROJECT_STATUS.md separately, following CLAUDE.md. No manual-user done gate, no empty or fake commits, no push.
- Report behavior, files/migrations, tests actually run, new decisions and their impact, real limitations, work/progress hashes and next eligible prompt in Persian. If the user requested full execution, continue to next eligible prompt without asking for routine permission.
```
