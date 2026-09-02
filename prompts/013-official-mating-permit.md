# PROMPT-013 — مجوز رسمی جفت‌گیری

## Purpose
Implement official permit route/entity distinct from personal declaration. Require active membership, real pedigree-resolved male/female animals and correct owner/user relationships. Choose own animal, counterparty pedigree code, resolve participant, invite and confirm.

## Traceability
Sections: s05, s16, s21, s22, s23, s26; decisions: D06, D12, D13, D16

```text
You are executing PROMPT-013: مجوز رسمی جفت‌گیری.

Read first:
CLAUDE.md, EXECUTION_CONTRACT.md, Requirements.md sections 5, 16, 21, 22, 23, 26, IMPLEMENTATION_DECISIONS.md, DECISIONS.md, IMPLEMENTATION_STATUS.md and the relevant existing source/tests. Read linked Flow/Prototype/DS only as appropriate through available read-only tools. Inspect repository changes first. Do not duplicate completed work.

Objective and required implementation:
1. Implement official permit route/entity distinct from personal declaration. Require active membership, real pedigree-resolved male/female animals and correct owner/user relationships. Choose own animal, counterparty pedigree code, resolve participant, invite and confirm.
2. Build fixed/percentage/mixed Allocation Rule before birth, review both parties/animals/rule, fee payment before final submit, association operational review and permit issuance with official case/lineage context.
3. Pre-birth rule is not final ownership of unborn specific puppies. Validate rule structure consistently; determine rounding/real allocation details conservatively at post-birth proposal, with documented decisions rather than invented newborn counts.
4. Reuse payments, scoped invitations, notifications and request resume. No real SMS in development/tests. Party confirmation is identity/resource-bound, not trusting a posted user ID.
5. Pregnancy, birth, vet confirmation and physical signatures are not issuance prerequisites. No digital signing gate. Payment cannot switch to unpaid personal route.
6. Wire cooldown component seam using source confirmed dates; final date calculations land next prompt. A warning never disables continue. Operational review records reasons/history and updates both animals.

Validation that must actually run:
Test wrong sex/pedigree/ownership/invite actor, missing party confirmation, payment before submit, official/personal route isolation, no pregnancy/signature gating and exactly-once permit issuance. Required gates: permit-workflow, permit-browser.

Cross-cutting constraints:
Preserve D01–D19 and Phase 1 exclusions. Use real persistence and backend actor/entity authorization; all asynchronous operations preserve request/resume context. Every feature covers its real states, audit, notifications and item-level outcomes. Synthetic fixtures must be isolated and clearly labeled. Source/prototype conflicts resolve by precedence, not by convenience. Do not modify Figma. Fill gaps in code with DS; do not redesign approved flows.

Autonomous decisions:
For unspecified technical details inspect evidence, choose the smallest compatible solution, record DEC-NNNN with rationale/impact and tell the user in Persian. Do not wait for ordinary approval. Unknown real tariffs, accounts, issuer approvals or integration success are facts to configure/verify, not inventions. A genuine unavailable integration is recorded with its exact scope while independent work continues.

Completion and Git (mandatory):
- Use docs/reports/README.md. Write docs/reports/PROMPT-013.json with status COMPLETE only when all work and required gate records passed; otherwise PARTIAL/BLOCKED and never mark done. Mention concrete evidence and remaining integration/readiness limits.
- Update implementation status, decisions and traceability evidence. Preserve Requirements.md/reference originals and unrelated user changes.
- Review/stage only this task's changes; Claude itself makes a local Git commit containing PROMPT-013 in the message. Verify actual success, do not claim a proposed commit happened.
- Run `node tools/runner.mjs complete 13 --commit HEAD` only with committed COMPLETE evidence. Then commit PROJECT_STATUS.md separately, following CLAUDE.md. No manual-user done gate, no empty or fake commits, no push.
- Report behavior, files/migrations, tests actually run, new decisions and their impact, real limitations, work/progress hashes and next eligible prompt in Persian. If the user requested full execution, continue to next eligible prompt without asking for routine permission.
```
