# PROMPT-020 — اجرای نهایی، مستندات و آمادگی تحویل

## Purpose
Complete reproducible local and production-build configurations for the selected existing architecture, dependency lock, validated env contract, migrations, health/readiness, private file persistence and operating instructions. Docker/CI where appropriate to architecture, not inherited by obligation.

## Traceability
Sections: s02, s21, s23, s28, s29; decisions: D01, D06, D14, D15, D16, D17, D18, D19

```text
You are executing PROMPT-020: اجرای نهایی، مستندات و آمادگی تحویل.

Read first:
CLAUDE.md, EXECUTION_CONTRACT.md, Requirements.md sections 2, 21, 23, 28, 29, IMPLEMENTATION_DECISIONS.md, DECISIONS.md, IMPLEMENTATION_STATUS.md and the relevant existing source/tests. Read linked Flow/Prototype/DS only as appropriate through available read-only tools. Inspect repository changes first. Do not duplicate completed work.

Objective and required implementation:
1. Complete reproducible local and production-build configurations for the selected existing architecture, dependency lock, validated env contract, migrations, health/readiness, private file persistence and operating instructions. Docker/CI where appropriate to architecture, not inherited by obligation.
2. Write exact install/start/test/build/update commands verified from clean checkout or isolated directory. Document database+private-file backup/restore together and verify a restore on disposable data, preserving sample/history/document links.
3. Provide operator guide in Persian for member/KYC review, foreign issuers, tariffs and 21-day initial referral setting, preapproved vet/location data, one genetics centre, receipt/result/appeal handling, kennel/permit queues and request-only postal records. Never seed fake production accounts/licences/real tariffs other than supplied baseline as verified.
4. Provide runbook for config entry, provider activation, sandbox/live evidence, monitoring/redaction, migration recovery and safe rollback. Production must fail clearly for missing essentials, never silently use demo payment/OTP.
5. Summarize implemented source acceptance rows, remaining real external data/credentials/hardware/visual checks, actual commit hashes and known risks. All in-scope code and local verification must be done; do not mark whole product production-ready solely because prompts ran.
6. Do not deploy to live infrastructure, push commits, make real payments or send real messages as part of this package's authorization. Prepare concrete reviewable release artifacts/config; record external readiness separately.
7. Complete final progress commit and concise Persian handoff with exact startup entrypoint, test evidence and autonomous decisions. Do not claim any legacy incident resolved merely by finishing this plan.

Validation that must actually run:
Run clean checkout install/build/start smoke, config validation, migration on clean and existing disposable DB, persistence and backup/restore smoke, no-production-demo fallback, final acceptance/traceability and Git status. Required gates: reproducible-startup, backup-restore, release-readiness-review.

Cross-cutting constraints:
Preserve D01–D19 and Phase 1 exclusions. Use real persistence and backend actor/entity authorization; all asynchronous operations preserve request/resume context. Every feature covers its real states, audit, notifications and item-level outcomes. Synthetic fixtures must be isolated and clearly labeled. Source/prototype conflicts resolve by precedence, not by convenience. Do not modify Figma. Fill gaps in code with DS; do not redesign approved flows.

Autonomous decisions:
For unspecified technical details inspect evidence, choose the smallest compatible solution, record DEC-NNNN with rationale/impact and tell the user in Persian. Do not wait for ordinary approval. Unknown real tariffs, accounts, issuer approvals or integration success are facts to configure/verify, not inventions. A genuine unavailable integration is recorded with its exact scope while independent work continues.

Completion and Git (mandatory):
- Use docs/reports/README.md. Write docs/reports/PROMPT-020.json with status COMPLETE only when all work and required gate records passed; otherwise PARTIAL/BLOCKED and never mark done. Mention concrete evidence and remaining integration/readiness limits.
- Update implementation status, decisions and traceability evidence. Preserve Requirements.md/reference originals and unrelated user changes.
- Review/stage only this task's changes; Claude itself makes a local Git commit containing PROMPT-020 in the message. Verify actual success, do not claim a proposed commit happened.
- Run `node tools/runner.mjs complete 20 --commit HEAD` only with committed COMPLETE evidence. Then commit PROJECT_STATUS.md separately, following CLAUDE.md. No manual-user done gate, no empty or fake commits, no push.
- Report behavior, files/migrations, tests actually run, new decisions and their impact, real limitations, work/progress hashes and next eligible prompt in Persian. If the user requested full execution, continue to next eligible prompt without asking for routine permission.
```
