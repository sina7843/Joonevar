# PROMPT-015 — بارداری، زایمان، تأیید اختیاری و اصلاح تعداد

## Purpose
Official declarations start from issued permit; user pregnancy/birth records are UNVERIFIED and can progress without vet. They never issue/suspend/revoke/change permit.

## Traceability
Sections: s11, s18, s19, s21, s23, s26; decisions: D08, D09, D12, D18

```text
You are executing PROMPT-015: بارداری، زایمان، تأیید اختیاری و اصلاح تعداد.

Read first:
CLAUDE.md, EXECUTION_CONTRACT.md, Requirements.md sections 11, 18, 19, 21, 23, 26, IMPLEMENTATION_DECISIONS.md, DECISIONS.md, IMPLEMENTATION_STATUS.md and the relevant existing source/tests. Read linked Flow/Prototype/DS only as appropriate through available read-only tools. Inspect repository changes first. Do not duplicate completed work.

Objective and required implementation:
1. Official declarations start from issued permit; user pregnancy/birth records are UNVERIFIED and can progress without vet. They never issue/suspend/revoke/change permit.
2. Optional verification uses Pregnancy Finder, complete location, assigned vet request/private queue, independent exam result including vet name/code/time/location. No general pick-up queue, mating-location field, or deadline invalidating whole case. Referral expiry only affects that visit code.
3. Keep user and vet records independently versioned. Differences show «مغایرت با اعلام مالک», neutral notification to exact case and audit linking both. No accusation/legal dispute, extra counterparty gate or automatic puppy/ownership overwrite.
4. Birth live and dead counts are independent nonnegative integers. Initially create exactly live-count provisional puppies; initially dead ones receive no profile/temp code/card. Both zero allows no-puppy litter/close per existing route. Puppy name optional until chip stage.
5. Authorized user may correct counts with actor/time/reason/version even after profiles exist, without new association review. Distinguish correction of original reporting from later death; choose a versioned reconciliation strategy preserving profiles/ownership/documents. Increases create only needed new valid records; decreases require traceable reason/affected puppy associations and never blind deletion.
6. Later death preserves original born-alive count/profile/history and records affected puppy death/current living count. Historical profile count need not equal current living count. Vet result never silently rewrites either.
7. Build complete source states and recoverable UI for both actors.

Validation that must actually run:
Test live/dead/zero cases, negative/fraction counts rejected, no profile for initially dead, user correction permitted with prior profiles, linked later death preserving history, stale edits, independent mismatching vet record and unchanged permit throughout. Required gates: birth-history-integrity, pregnancy-browser.

Cross-cutting constraints:
Preserve D01–D19 and Phase 1 exclusions. Use real persistence and backend actor/entity authorization; all asynchronous operations preserve request/resume context. Every feature covers its real states, audit, notifications and item-level outcomes. Synthetic fixtures must be isolated and clearly labeled. Source/prototype conflicts resolve by precedence, not by convenience. Do not modify Figma. Fill gaps in code with DS; do not redesign approved flows.

Autonomous decisions:
For unspecified technical details inspect evidence, choose the smallest compatible solution, record DEC-NNNN with rationale/impact and tell the user in Persian. Do not wait for ordinary approval. Unknown real tariffs, accounts, issuer approvals or integration success are facts to configure/verify, not inventions. A genuine unavailable integration is recorded with its exact scope while independent work continues.

Completion and Git (mandatory):
- Use docs/reports/README.md. Write docs/reports/PROMPT-015.json with status COMPLETE only when all work and required gate records passed; otherwise PARTIAL/BLOCKED and never mark done. Mention concrete evidence and remaining integration/readiness limits.
- Update implementation status, decisions and traceability evidence. Preserve Requirements.md/reference originals and unrelated user changes.
- Review/stage only this task's changes; Claude itself makes a local Git commit containing PROMPT-015 in the message. Verify actual success, do not claim a proposed commit happened.
- Run `node tools/runner.mjs complete 15 --commit HEAD` only with committed COMPLETE evidence. Then commit PROJECT_STATUS.md separately, following CLAUDE.md. No manual-user done gate, no empty or fake commits, no push.
- Report behavior, files/migrations, tests actually run, new decisions and their impact, real limitations, work/progress hashes and next eligible prompt in Persian. If the user requested full execution, continue to next eligible prompt without asking for routine permission.
```
