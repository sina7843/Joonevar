# PROMPT-009 — صدور مستقل برگه ثبتی و پرداخت گروهی

## Purpose
Connect existing animal selection/referrals/service/sampling to registration-sheet request. Payment comes after microchip and required sample, not before them. Vet service fees are distinct and outside this document checkout.

## Traceability
Sections: s05, s08, s10, s13, s22, s23, s26; decisions: D13, D16

```text
You are executing PROMPT-009: صدور مستقل برگه ثبتی و پرداخت گروهی.

Read first:
CLAUDE.md, EXECUTION_CONTRACT.md, Requirements.md sections 5, 8, 10, 13, 22, 23, 26, IMPLEMENTATION_DECISIONS.md, DECISIONS.md, IMPLEMENTATION_STATUS.md and the relevant existing source/tests. Read linked Flow/Prototype/DS only as appropriate through available read-only tools. Inspect repository changes first. Do not duplicate completed work.

Objective and required implementation:
1. Connect existing animal selection/referrals/service/sampling to registration-sheet request. Payment comes after microchip and required sample, not before them. Vet service fees are distinct and outside this document checkout.
2. Build review, per-animal amounts from current DB tariff, one batch payment and independent item issuance. Paid eligible animal can receive its document while another item is incomplete/rejected/delayed. Backend prerequisites and per-item money attribution enforce this.
3. Implement typed document/Pet ID issuance using existing approved format; if visual/document numbering details are absent choose minimal compatible local implementation and disclose it. Never invent external certification. Persist unique issuance and secure retrieval.
4. Preserve selected animals, service, vet, sample, batch/attempt and resume context through errors and retries. Do not invent refund/extra-charge policy for post-payment batch edits; keep paid item snapshots stable and record a compatible constrained edit rule.
5. Update animal timeline and unlocked services per issued document. Show «نمونه خون دریافت شده؛ آزمایش Parentage هنوز انجام نشده است.» Registration sheet is not genetic result/pedigree.
6. Make all UI actions real and end-to-end persisted, including loading/errors/cancelled payment and item-level status.

Validation that must actually run:
Test payment timing, two-item batch with one issuance blocked, callback/issuance retries yielding one document, secure document access and failed-payment resume. Required gates: registration-batch-integration, registration-browser.

Cross-cutting constraints:
Preserve D01–D19 and Phase 1 exclusions. Use real persistence and backend actor/entity authorization; all asynchronous operations preserve request/resume context. Every feature covers its real states, audit, notifications and item-level outcomes. Synthetic fixtures must be isolated and clearly labeled. Source/prototype conflicts resolve by precedence, not by convenience. Do not modify Figma. Fill gaps in code with DS; do not redesign approved flows.

Autonomous decisions:
For unspecified technical details inspect evidence, choose the smallest compatible solution, record DEC-NNNN with rationale/impact and tell the user in Persian. Do not wait for ordinary approval. Unknown real tariffs, accounts, issuer approvals or integration success are facts to configure/verify, not inventions. A genuine unavailable integration is recorded with its exact scope while independent work continues.

Completion and Git (mandatory):
- Use docs/reports/README.md. Write docs/reports/PROMPT-009.json with status COMPLETE only when all work and required gate records passed; otherwise PARTIAL/BLOCKED and never mark done. Mention concrete evidence and remaining integration/readiness limits.
- Update implementation status, decisions and traceability evidence. Preserve Requirements.md/reference originals and unrelated user changes.
- Review/stage only this task's changes; Claude itself makes a local Git commit containing PROMPT-009 in the message. Verify actual success, do not claim a proposed commit happened.
- Run `node tools/runner.mjs complete 9 --commit HEAD` only with committed COMPLETE evidence. Then commit PROJECT_STATUS.md separately, following CLAUDE.md. No manual-user done gate, no empty or fake commits, no push.
- Report behavior, files/migrations, tests actually run, new decisions and their impact, real limitations, work/progress hashes and next eligible prompt in Persian. If the user requested full execution, continue to next eligible prompt without asking for routine permission.
```
