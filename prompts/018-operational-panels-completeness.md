# PROMPT-018 — تکمیل پنل‌ها، تنظیمات و مسیرهای ادامه

## Purpose
Complete actual operational screens in code using DS: vet assigned visits/codes/services/samples/custody/ship/resampling/optional exams; association members/numbers/KYC if assigned/breeders/kennels/permits/foreign pedigree and issuers; genetics receipts/samples/results/appeals; independent superadmin scope/config/history.

## Traceability
Sections: s04, s05, s08, s10, s21, s22, s23, s24, s26; decisions: D05, D06, D10, D11, D14, D15, D16, D17, D19

```text
You are executing PROMPT-018: تکمیل پنل‌ها، تنظیمات و مسیرهای ادامه.

Read first:
CLAUDE.md, EXECUTION_CONTRACT.md, Requirements.md sections 4, 5, 8, 10, 21, 22, 23, 24, 26, IMPLEMENTATION_DECISIONS.md, DECISIONS.md, IMPLEMENTATION_STATUS.md and the relevant existing source/tests. Read linked Flow/Prototype/DS only as appropriate through available read-only tools. Inspect repository changes first. Do not duplicate completed work.

Objective and required implementation:
1. Complete actual operational screens in code using DS: vet assigned visits/codes/services/samples/custody/ship/resampling/optional exams; association members/numbers/KYC if assigned/breeders/kennels/permits/foreign pedigree and issuers; genetics receipts/samples/results/appeals; independent superadmin scope/config/history.
2. Reuse feature actions already implemented, not parallel inconsistent APIs. Every actionable table row leads to authorized detail/history/reason/action and exact notification target. No dashboard metrics, approval states or access roles invented by data placeholders.
3. Complete settings UI for DB tariffs, referral period, fixed centre details, issuer/breed registries and existing operational guide parameters. Validate values, authorize per group and audit before/after. Keep fixed business invariants noneditable; this is not a flow editor. Display missing required data honestly.
4. Complete user dashboard and animal timelines through all flows, active actor/next action, waiting/correction/blocked eligibility, context switches and request resume. Ensure all feature routes and source-approved controls work; no dead buttons or fake success.
5. Existing inactive-membership vet sees old allowed tasks and explanation but cannot take new assignments. Membership paid success is never sent into blocking review. Operations is not public role switcher.
6. Finish postal request capture/list within request-only scope and appeal queue; no shipping lifecycle. Fill all remaining in-scope §21 requirements without editing Figma.

Validation that must actually run:
Run actor/resource denial matrix including URL/ID tampering, settings audit/price snapshots, full dashboard resume after logout/payment/correction, old/new vet access and every operational queue/action smoke. Required gates: operations-rbac, operations-browser.

Cross-cutting constraints:
Preserve D01–D19 and Phase 1 exclusions. Use real persistence and backend actor/entity authorization; all asynchronous operations preserve request/resume context. Every feature covers its real states, audit, notifications and item-level outcomes. Synthetic fixtures must be isolated and clearly labeled. Source/prototype conflicts resolve by precedence, not by convenience. Do not modify Figma. Fill gaps in code with DS; do not redesign approved flows.

Autonomous decisions:
For unspecified technical details inspect evidence, choose the smallest compatible solution, record DEC-NNNN with rationale/impact and tell the user in Persian. Do not wait for ordinary approval. Unknown real tariffs, accounts, issuer approvals or integration success are facts to configure/verify, not inventions. A genuine unavailable integration is recorded with its exact scope while independent work continues.

Completion and Git (mandatory):
- Use docs/reports/README.md. Write docs/reports/PROMPT-018.json with status COMPLETE only when all work and required gate records passed; otherwise PARTIAL/BLOCKED and never mark done. Mention concrete evidence and remaining integration/readiness limits.
- Update implementation status, decisions and traceability evidence. Preserve Requirements.md/reference originals and unrelated user changes.
- Review/stage only this task's changes; Claude itself makes a local Git commit containing PROMPT-018 in the message. Verify actual success, do not claim a proposed commit happened.
- Run `node tools/runner.mjs complete 18 --commit HEAD` only with committed COMPLETE evidence. Then commit PROJECT_STATUS.md separately, following CLAUDE.md. No manual-user done gate, no empty or fake commits, no push.
- Report behavior, files/migrations, tests actually run, new decisions and their impact, real limitations, work/progress hashes and next eligible prompt in Persian. If the user requested full execution, continue to next eligible prompt without asking for routine permission.
```
