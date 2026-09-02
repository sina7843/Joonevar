# PROMPT-006 — ثبت حیوان، نسب و بررسی شجره‌نامه خارجی

## Purpose
Build source-approved animal registration fields and persistent Draft, G0, internal G1+ and foreign-pedigree routes. KYC required, membership not required for initial animal record. Internal record is distinct from official Pet ID/document issuance.

## Traceability
Sections: s05, s09, s10, s21, s23, s24, s26; decisions: D14

```text
You are executing PROMPT-006: ثبت حیوان، نسب و بررسی شجره‌نامه خارجی.

Read first:
CLAUDE.md, EXECUTION_CONTRACT.md, Requirements.md sections 5, 9, 10, 21, 23, 24, 26, IMPLEMENTATION_DECISIONS.md, DECISIONS.md, IMPLEMENTATION_STATUS.md and the relevant existing source/tests. Read linked Flow/Prototype/DS only as appropriate through available read-only tools. Inspect repository changes first. Do not duplicate completed work.

Objective and required implementation:
1. Build source-approved animal registration fields and persistent Draft, G0, internal G1+ and foreign-pedigree routes. KYC required, membership not required for initial animal record. Internal record is distinct from official Pet ID/document issuance.
2. For G1+, resolve actual animal/paternal/maternal pedigree records and read ancestry. With valid direct parents compute 1+min(parent generations), read-only. A genuinely missing direct parent yields G0 plus complete-parent CTA. Technical lookup failure preserves draft/current generation as LOOKUP_ERROR with retry.
3. Preserve original child draft, entered codes and return context while registering missing parent; rematch/update with audit rather than duplicating child. Prevent lineage self-links/cycles and stale update overwrites as technical integrity details.
4. Foreign route: separate front/back uploads, review, UNDER_REVIEW, approved/needs correction/rejected. Association owns review using database-managed approved issuers. Generation extracted from reviewed record remains read-only. No fixed SLA, additional superadmin approval or invented mandatory translation.
5. Build association foreign-pedigree queue/detail/reason/audit actions and issuer administration scoped to association permission. Missing real issuer data must not be represented as verified approval; test fixtures are synthetic.
6. Build animal profile identity/ownership/document/family/timeline with links for future sections. General edit cannot overwrite chip/sample/result/verified identifiers. Validate resource-level permissions on all detail and lookup endpoints.

Validation that must actually run:
Test G0xG0->G1 and G2xG1->G2, genuine parent absence vs lookup error, return/rematch without duplicate, generation tampering, foreign front/back preservation/correction and association-only review. Verify no membership or residence lock on initial animal creation. Required gates: animal-lineage-integration, animal-registration-browser.

Cross-cutting constraints:
Preserve D01–D19 and Phase 1 exclusions. Use real persistence and backend actor/entity authorization; all asynchronous operations preserve request/resume context. Every feature covers its real states, audit, notifications and item-level outcomes. Synthetic fixtures must be isolated and clearly labeled. Source/prototype conflicts resolve by precedence, not by convenience. Do not modify Figma. Fill gaps in code with DS; do not redesign approved flows.

Autonomous decisions:
For unspecified technical details inspect evidence, choose the smallest compatible solution, record DEC-NNNN with rationale/impact and tell the user in Persian. Do not wait for ordinary approval. Unknown real tariffs, accounts, issuer approvals or integration success are facts to configure/verify, not inventions. A genuine unavailable integration is recorded with its exact scope while independent work continues.

Completion and Git (mandatory):
- Use docs/reports/README.md. Write docs/reports/PROMPT-006.json with status COMPLETE only when all work and required gate records passed; otherwise PARTIAL/BLOCKED and never mark done. Mention concrete evidence and remaining integration/readiness limits.
- Update implementation status, decisions and traceability evidence. Preserve Requirements.md/reference originals and unrelated user changes.
- Review/stage only this task's changes; Claude itself makes a local Git commit containing PROMPT-006 in the message. Verify actual success, do not claim a proposed commit happened.
- Run `node tools/runner.mjs complete 6 --commit HEAD` only with committed COMPLETE evidence. Then commit PROJECT_STATUS.md separately, following CLAUDE.md. No manual-user done gate, no empty or fake commits, no push.
- Report behavior, files/migrations, tests actually run, new decisions and their impact, real limitations, work/progress hashes and next eligible prompt in Persian. If the user requested full execution, continue to next eligible prompt without asking for routine permission.
```
