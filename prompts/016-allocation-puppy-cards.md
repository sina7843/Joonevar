# PROMPT-016 — تخصیص دوطرفه و صدور کارت توله

## Purpose
For actual registered puppies after birth show proposed owner using pre-birth rule as proposal context only. Each allocation version needs both actual counterparties' confirmation to reach FINAL. One party/payment cannot bypass it.

## Traceability
Sections: s05, s19, s22, s23, s26; decisions: D16, D18

```text
You are executing PROMPT-016: تخصیص دوطرفه و صدور کارت توله.

Read first:
CLAUDE.md, EXECUTION_CONTRACT.md, Requirements.md sections 5, 19, 22, 23, 26, IMPLEMENTATION_DECISIONS.md, DECISIONS.md, IMPLEMENTATION_STATUS.md and the relevant existing source/tests. Read linked Flow/Prototype/DS only as appropriate through available read-only tools. Inspect repository changes first. Do not duplicate completed work.

Objective and required implementation:
1. For actual registered puppies after birth show proposed owner using pre-birth rule as proposal context only. Each allocation version needs both actual counterparties' confirmation to reach FINAL. One party/payment cannot bypass it.
2. Changed/rejected proposal creates new version and requires fresh two-party approval. Old version approvals cannot approve new data. While unresolved keep PENDING_BOTH_OWNERS, card locked, both values/history readable; disagreement resolves outside system then revised proposal in system. No automatic winner/arbitration.
3. Puppy Card requires issued permit, recorded birth/litter, eligible born-alive puppy, FINAL allocation and paid item. Registration sheet of that puppy is not prerequisite. Keep card, registration sheet, pedigree and genetic result distinct even where Persian legacy copy says برگه ثبتی توله.
4. Choose one/many eligible puppies, DB tariff per puppy, one batch, payment before final submit, independent card issuance and timeline updates. Preserve data through failure and mixed batch results.
5. Preserve documents/ownership/history when later corrections/death occur; choose conservative new-issuance eligibility for deceased puppies and report it as a gap decision without retroactively deleting documents.
6. Personal declaration must never supply official permit/lineage/card eligibility. Enforce all checks server-side and at issued-item/version boundary.

Validation that must actually run:
Test one-party vs both, stale approvals, changed allocation and concurrency, payment cannot bypass gate, card before puppy registration sheet, per-item batch independence, personal-route denial and preserved history after death. Required gates: allocation-version-integrity, puppy-card-browser.

Cross-cutting constraints:
Preserve D01–D19 and Phase 1 exclusions. Use real persistence and backend actor/entity authorization; all asynchronous operations preserve request/resume context. Every feature covers its real states, audit, notifications and item-level outcomes. Synthetic fixtures must be isolated and clearly labeled. Source/prototype conflicts resolve by precedence, not by convenience. Do not modify Figma. Fill gaps in code with DS; do not redesign approved flows.

Autonomous decisions:
For unspecified technical details inspect evidence, choose the smallest compatible solution, record DEC-NNNN with rationale/impact and tell the user in Persian. Do not wait for ordinary approval. Unknown real tariffs, accounts, issuer approvals or integration success are facts to configure/verify, not inventions. A genuine unavailable integration is recorded with its exact scope while independent work continues.

Completion and Git (mandatory):
- Use docs/reports/README.md. Write docs/reports/PROMPT-016.json with status COMPLETE only when all work and required gate records passed; otherwise PARTIAL/BLOCKED and never mark done. Mention concrete evidence and remaining integration/readiness limits.
- Update implementation status, decisions and traceability evidence. Preserve Requirements.md/reference originals and unrelated user changes.
- Review/stage only this task's changes; Claude itself makes a local Git commit containing PROMPT-016 in the message. Verify actual success, do not claim a proposed commit happened.
- Run `node tools/runner.mjs complete 16 --commit HEAD` only with committed COMPLETE evidence. Then commit PROJECT_STATUS.md separately, following CLAUDE.md. No manual-user done gate, no empty or fake commits, no push.
- Report behavior, files/migrations, tests actually run, new decisions and their impact, real limitations, work/progress hashes and next eligible prompt in Persian. If the user requested full execution, continue to next eligible prompt without asking for routine permission.
```
