# PROMPT-012 — فعال‌سازی پرورش‌دهنده و مدیریت کنل

## Purpose
Implement accepted F11 breeder activation including under-review/approved/needs-correction. Preserve existing relation to kennel activation; if detail is missing inspect references then choose least restrictive compatible behavior and log it. Do not add extra breeder document upload or standalone role-activation fee.

## Traceability
Sections: s04, s05, s15, s21, s22, s23, s24, s26; decisions: D06, D10, D11, D16

```text
You are executing PROMPT-012: فعال‌سازی پرورش‌دهنده و مدیریت کنل.

Read first:
CLAUDE.md, EXECUTION_CONTRACT.md, Requirements.md sections 4, 5, 15, 21, 22, 23, 24, 26, IMPLEMENTATION_DECISIONS.md, DECISIONS.md, IMPLEMENTATION_STATUS.md and the relevant existing source/tests. Read linked Flow/Prototype/DS only as appropriate through available read-only tools. Inspect repository changes first. Do not duplicate completed work.

Objective and required implementation:
1. Implement accepted F11 breeder activation including under-review/approved/needs-correction. Preserve existing relation to kennel activation; if detail is missing inspect references then choose least restrictive compatible behavior and log it. Do not add extra breeder document upload or standalone role-activation fee.
2. Kennel entry label «شروع ثبت کنل»; active membership and at least one registration sheet; form, breed selection, review, payment, submit and association review. No new prerequisite invented just because role exists.
3. Kennel address/location required for submit and separate from optional residence. Preserve approved prototype fields/name constraints; search breeds in Persian/English, selected list/count, at least one breed.
4. Use DB tariffs and existing payment primitives. Build association queue/detail/correction/rejection-with-reason/approval with audit and notifications.
5. Kennel profile shows status/name/location/breeds. Breed add/remove reuses registry, cannot remove last breed, causes no new payment or review, records before/after/actor/time.
6. After activation public role switcher reflects real active breeder context without fixed slots. No public trusted-vet onboarding.

Validation that must actually run:
Test residence-empty kennel submission, missing kennel location, no registration sheet, minimum breed and last removal, payment retry, no extra breeder documents/fee, and breed edits without re-review. Required gates: kennel-workflow, kennel-browser.

Cross-cutting constraints:
Preserve D01–D19 and Phase 1 exclusions. Use real persistence and backend actor/entity authorization; all asynchronous operations preserve request/resume context. Every feature covers its real states, audit, notifications and item-level outcomes. Synthetic fixtures must be isolated and clearly labeled. Source/prototype conflicts resolve by precedence, not by convenience. Do not modify Figma. Fill gaps in code with DS; do not redesign approved flows.

Autonomous decisions:
For unspecified technical details inspect evidence, choose the smallest compatible solution, record DEC-NNNN with rationale/impact and tell the user in Persian. Do not wait for ordinary approval. Unknown real tariffs, accounts, issuer approvals or integration success are facts to configure/verify, not inventions. A genuine unavailable integration is recorded with its exact scope while independent work continues.

Completion and Git (mandatory):
- Use docs/reports/README.md. Write docs/reports/PROMPT-012.json with status COMPLETE only when all work and required gate records passed; otherwise PARTIAL/BLOCKED and never mark done. Mention concrete evidence and remaining integration/readiness limits.
- Update implementation status, decisions and traceability evidence. Preserve Requirements.md/reference originals and unrelated user changes.
- Review/stage only this task's changes; Claude itself makes a local Git commit containing PROMPT-012 in the message. Verify actual success, do not claim a proposed commit happened.
- Run `node tools/runner.mjs complete 12 --commit HEAD` only with committed COMPLETE evidence. Then commit PROJECT_STATUS.md separately, following CLAUDE.md. No manual-user done gate, no empty or fake commits, no push.
- Report behavior, files/migrations, tests actually run, new decisions and their impact, real limitations, work/progress hashes and next eligible prompt in Persian. If the user requested full execution, continue to next eligible prompt without asking for routine permission.
```
