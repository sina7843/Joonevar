# PROMPT-005 — پرداخت، عضویت مادام‌العمر و دسترسی خدمات

## Purpose
Implement payment intents/attempts/item snapshots, gateway adapter with backend verify, idempotent verified callbacks and recoverable pending/failed/cancelled states. Record actual currency/unit conversion and server-computed DB prices; browser success cannot mark payment paid.

## Traceability
Sections: s05, s07, s08, s21, s22, s23, s26; decisions: D04, D05, D15, D16

```text
You are executing PROMPT-005: پرداخت، عضویت مادام‌العمر و دسترسی خدمات.

Read first:
CLAUDE.md, EXECUTION_CONTRACT.md, Requirements.md sections 5, 7, 8, 21, 22, 23, 26, IMPLEMENTATION_DECISIONS.md, DECISIONS.md, IMPLEMENTATION_STATUS.md and the relevant existing source/tests. Read linked Flow/Prototype/DS only as appropriate through available read-only tools. Inspect repository changes first. Do not duplicate completed work.

Objective and required implementation:
1. Implement payment intents/attempts/item snapshots, gateway adapter with backend verify, idempotent verified callbacks and recoverable pending/failed/cancelled states. Record actual currency/unit conversion and server-computed DB prices; browser success cannot mark payment paid.
2. Implement F14 membership: hero, prerequisites/benefits, fee review, payment, verified success, active lifetime membership and resume. Initial documented tariff is 300000 toman in DB; changes are admin data. No annual expiry, renewal, post-payment blocking approval or invented suspension policy.
3. Membership number PENDING does not block active services. Membership is account-level across context switch.
4. Implement eligibility for dashboard, KYC-only registration, registration sheet, pedigree, kennel, permit, Puppy Card and personal declaration exactly from §5; do not add cooldown as a block. Use shared server rules with reason/next requirement/CTA.
5. An existing vet with inactive membership cannot receive new work/appear eligible in Finder, but may complete previously active assigned work; preserve role and locations. Reactivation restores only membership restriction without onboarding.
6. Build status/dashboard components backed by persisted state. Keep synthetic payment verification clearly scoped to tests/sandbox and record production adapter readiness.

Validation that must actually run:
Test duplicate and concurrent callbacks, tampered amounts and failed/cancelled payments, price change preserving old intent, pending number with active membership, cross-context membership, KYC-without-membership animal access and inactive vet old/new work distinction. Required gates: payment-idempotency, membership-eligibility.

Cross-cutting constraints:
Preserve D01–D19 and Phase 1 exclusions. Use real persistence and backend actor/entity authorization; all asynchronous operations preserve request/resume context. Every feature covers its real states, audit, notifications and item-level outcomes. Synthetic fixtures must be isolated and clearly labeled. Source/prototype conflicts resolve by precedence, not by convenience. Do not modify Figma. Fill gaps in code with DS; do not redesign approved flows.

Autonomous decisions:
For unspecified technical details inspect evidence, choose the smallest compatible solution, record DEC-NNNN with rationale/impact and tell the user in Persian. Do not wait for ordinary approval. Unknown real tariffs, accounts, issuer approvals or integration success are facts to configure/verify, not inventions. A genuine unavailable integration is recorded with its exact scope while independent work continues.

Completion and Git (mandatory):
- Use docs/reports/README.md. Write docs/reports/PROMPT-005.json with status COMPLETE only when all work and required gate records passed; otherwise PARTIAL/BLOCKED and never mark done. Mention concrete evidence and remaining integration/readiness limits.
- Update implementation status, decisions and traceability evidence. Preserve Requirements.md/reference originals and unrelated user changes.
- Review/stage only this task's changes; Claude itself makes a local Git commit containing PROMPT-005 in the message. Verify actual success, do not claim a proposed commit happened.
- Run `node tools/runner.mjs complete 5 --commit HEAD` only with committed COMPLETE evidence. Then commit PROJECT_STATUS.md separately, following CLAUDE.md. No manual-user done gate, no empty or fake commits, no push.
- Report behavior, files/migrations, tests actually run, new decisions and their impact, real limitations, work/progress hashes and next eligible prompt in Persian. If the user requested full execution, continue to next eligible prompt without asking for routine permission.
```
