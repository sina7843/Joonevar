# PROMPT-017 — اعلام توافق شخصی جدا از مسیر رسمی

## Purpose
Build unpaid declaration of existence of an outside agreement: KYC, active membership, two existing animal records; no registration-sheet/pedigree requirement. Pick own animal and actual counterparty animal, enter mobile, invite, login/create account, confirm or reject existence.

## Traceability
Sections: s05, s17, s20, s23, s26; decisions: source rules

```text
You are executing PROMPT-017: اعلام توافق شخصی جدا از مسیر رسمی.

Read first:
CLAUDE.md, EXECUTION_CONTRACT.md, Requirements.md sections 5, 17, 20, 23, 26, IMPLEMENTATION_DECISIONS.md, DECISIONS.md, IMPLEMENTATION_STATUS.md and the relevant existing source/tests. Read linked Flow/Prototype/DS only as appropriate through available read-only tools. Inspect repository changes first. Do not duplicate completed work.

Objective and required implementation:
1. Build unpaid declaration of existence of an outside agreement: KYC, active membership, two existing animal records; no registration-sheet/pedigree requirement. Pick own animal and actual counterparty animal, enter mobile, invite, login/create account, confirm or reject existence.
2. Validate animal/user relationship and invitation recipient; preserve pending origin through OTP/account creation. PENDING_COUNTERPARTY_CONFIRMATION until response. Use product SMS adapter and synthetic/sandbox recipients in tests; do not send real invitations while implementing without authorization.
3. Store only permitted existence declaration and related identifiers/status. No contract terms, text/file/image/signatures, share terms, official ownership allocation or agreement-signature OTP. Login OTP is separate.
4. Use separate routes/entities/statuses/payment policy from official permit. This cannot create permit, lineage, official CONFIRMED dates, Puppy Card or paid checkout.
5. Optional personal date/pregnancy/birth notes remain UNVERIFIED and independent; do not contaminate official last confirmed date. Formal Hamzist contract remains disabled/به‌زودی, not a functioning contract builder.
6. Build pending/rejected/confirmed, notification/resume, authorized details and audit.

Validation that must actually run:
Test membership/KYC/two-record prerequisites but no pedigree/sheet requirement, recipient mismatch, decline, signup/return, no payment or contract storage, personal dates isolated and no path to official cards. Required gates: personal-declaration-isolation, personal-browser.

Cross-cutting constraints:
Preserve D01–D19 and Phase 1 exclusions. Use real persistence and backend actor/entity authorization; all asynchronous operations preserve request/resume context. Every feature covers its real states, audit, notifications and item-level outcomes. Synthetic fixtures must be isolated and clearly labeled. Source/prototype conflicts resolve by precedence, not by convenience. Do not modify Figma. Fill gaps in code with DS; do not redesign approved flows.

Autonomous decisions:
For unspecified technical details inspect evidence, choose the smallest compatible solution, record DEC-NNNN with rationale/impact and tell the user in Persian. Do not wait for ordinary approval. Unknown real tariffs, accounts, issuer approvals or integration success are facts to configure/verify, not inventions. A genuine unavailable integration is recorded with its exact scope while independent work continues.

Completion and Git (mandatory):
- Use docs/reports/README.md. Write docs/reports/PROMPT-017.json with status COMPLETE only when all work and required gate records passed; otherwise PARTIAL/BLOCKED and never mark done. Mention concrete evidence and remaining integration/readiness limits.
- Update implementation status, decisions and traceability evidence. Preserve Requirements.md/reference originals and unrelated user changes.
- Review/stage only this task's changes; Claude itself makes a local Git commit containing PROMPT-017 in the message. Verify actual success, do not claim a proposed commit happened.
- Run `node tools/runner.mjs complete 17 --commit HEAD` only with committed COMPLETE evidence. Then commit PROJECT_STATUS.md separately, following CLAUDE.md. No manual-user done gate, no empty or fake commits, no push.
- Report behavior, files/migrations, tests actually run, new decisions and their impact, real limitations, work/progress hashes and next eligible prompt in Persian. If the user requested full execution, continue to next eligible prompt without asking for routine permission.
```
