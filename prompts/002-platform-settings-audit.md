# PROMPT-002 — زیرساخت، داده، تنظیمات و تاریخچه

## Purpose
Initialize or extend the chosen application, reproducible package scripts, migrations, local database and test database. Preserve any existing working modules. Create health/config validation and a minimal runnable entry point, not invented feature success screens.

## Traceability
Sections: s04, s08, s21, s22, s23, s26, s29; decisions: D10, D11, D15, D16

```text
You are executing PROMPT-002: زیرساخت، داده، تنظیمات و تاریخچه.

Read first:
CLAUDE.md, EXECUTION_CONTRACT.md, Requirements.md sections 4, 8, 21, 22, 23, 26, 29, IMPLEMENTATION_DECISIONS.md, DECISIONS.md, IMPLEMENTATION_STATUS.md and the relevant existing source/tests. Read linked Flow/Prototype/DS only as appropriate through available read-only tools. Inspect repository changes first. Do not duplicate completed work.

Objective and required implementation:
1. Initialize or extend the chosen application, reproducible package scripts, migrations, local database and test database. Preserve any existing working modules. Create health/config validation and a minimal runnable entry point, not invented feature success screens.
2. Implement typed contracts for IDs, service requests, actions, pagination/errors and server authorization. Seed only approved product configuration: referral validity 21 days, membership fee 300000 toman; treat male 14 days/female six calendar months as documented policy, not freely changeable workflow rules. Preserve existing configured values on rerun.
3. Implement DB-backed versioned settings: tariffs, referral validity, centre identity/contact/account fields, approved issuer registry, breed data and permitted guide text. Unknown real tariffs/centre details remain NOT_CONFIGURED; no production sample bank account or issuer approval. Exact integer money unit and gateway conversions must be documented and tested.
4. Add scoped settings permissions, actor/time/before-after audit, stable request/resume context and notification delivery abstraction with idempotency. Narrow future module tables can be added in their own migrations.
5. Implement private upload/storage primitives with authorized downloads, file type/signature/size checks, path safety and no public identity files. KYC later uses JPG/PNG/PDF <=10 MB. Persist source associations rather than raw public links.
6. Create explicit local-test adapters for providers only where needed, disabled in production. Supply a safe .env.example, startup validation and reproducible synthetic fixtures. Real credentials are supplied externally; never commit them.

Validation that must actually run:
Run foundation startup/health, migration up/rerun on an isolated DB, settings authorization/history and private-file access tests. Prove seed rerun preserves modified DB settings and missing monetary data is not silently zero. Required gate: foundation-integration.

Cross-cutting constraints:
Preserve D01–D19 and Phase 1 exclusions. Use real persistence and backend actor/entity authorization; all asynchronous operations preserve request/resume context. Every feature covers its real states, audit, notifications and item-level outcomes. Synthetic fixtures must be isolated and clearly labeled. Source/prototype conflicts resolve by precedence, not by convenience. Do not modify Figma. Fill gaps in code with DS; do not redesign approved flows.

Autonomous decisions:
For unspecified technical details inspect evidence, choose the smallest compatible solution, record DEC-NNNN with rationale/impact and tell the user in Persian. Do not wait for ordinary approval. Unknown real tariffs, accounts, issuer approvals or integration success are facts to configure/verify, not inventions. A genuine unavailable integration is recorded with its exact scope while independent work continues.

Completion and Git (mandatory):
- Use docs/reports/README.md. Write docs/reports/PROMPT-002.json with status COMPLETE only when all work and required gate records passed; otherwise PARTIAL/BLOCKED and never mark done. Mention concrete evidence and remaining integration/readiness limits.
- Update implementation status, decisions and traceability evidence. Preserve Requirements.md/reference originals and unrelated user changes.
- Review/stage only this task's changes; Claude itself makes a local Git commit containing PROMPT-002 in the message. Verify actual success, do not claim a proposed commit happened.
- Run `node tools/runner.mjs complete 2 --commit HEAD` only with committed COMPLETE evidence. Then commit PROJECT_STATUS.md separately, following CLAUDE.md. No manual-user done gate, no empty or fake commits, no push.
- Report behavior, files/migrations, tests actually run, new decisions and their impact, real limitations, work/progress hashes and next eligible prompt in Persian. If the user requested full execution, continue to next eligible prompt without asking for routine permission.
```
