# PROMPT-007 — یافتن دامپزشک و کد مراجعه مستقل

## Purpose
Use preapproved vets and complete approved locations; no public vet-onboarding feature. Keep professional vet code and location licence independent. Finder supports Microchip/DNA/Pregnancy contexts only in permitted entrances; normal pedigree will reuse existing custodian/sample.

## Traceability
Sections: s07, s11, s21, s23, s26; decisions: D01, D02, D03, D05, D08, D09, D15

```text
You are executing PROMPT-007: یافتن دامپزشک و کد مراجعه مستقل.

Read first:
CLAUDE.md, EXECUTION_CONTRACT.md, Requirements.md sections 7, 11, 21, 23, 26, IMPLEMENTATION_DECISIONS.md, DECISIONS.md, IMPLEMENTATION_STATUS.md and the relevant existing source/tests. Read linked Flow/Prototype/DS only as appropriate through available read-only tools. Inspect repository changes first. Do not duplicate completed work.

Objective and required implementation:
1. Use preapproved vets and complete approved locations; no public vet-onboarding feature. Keep professional vet code and location licence independent. Finder supports Microchip/DNA/Pregnancy contexts only in permitted entrances; normal pedigree will reuse existing custodian/sample.
2. Search vet/centre/clinic/neighborhood and supported location/distance filters; contact CTA and cost text «برای اطلاع دقیق از قیمت‌ها با دامپزشک یا مرکز تماس بگیرید.» Keep location incomplete/no valid licence ineligible. No appointment/time slot/calendar/earliest-slot sorting.
3. Build multi-animal selection with per-animal IMPLANT or VERIFICATION; each animal gets independent request/referral code/state, despite grouping. QR/manual entry represent the same referral. Referral is created before sampling.
4. Read active validity from DB (initial 21 days), persist issuedAt/expiresAt/settings version and display the same expiry the server enforces. Document nonretroactive settings policy. Expiry allows a new code with refreshed vet/location eligibility and preserved prior code history.
5. Implement assigned vet/location/animal/code validation and one-time atomic check-in. Reject invalid, expired, cancelled, superseded, consumed and wrong-vet/location codes without exposing another user's animal.
6. In-place observed service change supersedes only that animal's old request/code, creates correct service request/new referral and returns to check-in. Preserve all old audit and other batch animals. Pregnancy referral expiry never expires the declaration/permit.

Validation that must actually run:
Test double scan race, unauthorized vet/location, all invalid code states, settings change/new issuance, expiry renewal, inactive vet accepting no new work but valid existing request, and service correction isolated to one batch item. Required gates: referral-concurrency, finder-browser.

Cross-cutting constraints:
Preserve D01–D19 and Phase 1 exclusions. Use real persistence and backend actor/entity authorization; all asynchronous operations preserve request/resume context. Every feature covers its real states, audit, notifications and item-level outcomes. Synthetic fixtures must be isolated and clearly labeled. Source/prototype conflicts resolve by precedence, not by convenience. Do not modify Figma. Fill gaps in code with DS; do not redesign approved flows.

Autonomous decisions:
For unspecified technical details inspect evidence, choose the smallest compatible solution, record DEC-NNNN with rationale/impact and tell the user in Persian. Do not wait for ordinary approval. Unknown real tariffs, accounts, issuer approvals or integration success are facts to configure/verify, not inventions. A genuine unavailable integration is recorded with its exact scope while independent work continues.

Completion and Git (mandatory):
- Use docs/reports/README.md. Write docs/reports/PROMPT-007.json with status COMPLETE only when all work and required gate records passed; otherwise PARTIAL/BLOCKED and never mark done. Mention concrete evidence and remaining integration/readiness limits.
- Update implementation status, decisions and traceability evidence. Preserve Requirements.md/reference originals and unrelated user changes.
- Review/stage only this task's changes; Claude itself makes a local Git commit containing PROMPT-007 in the message. Verify actual success, do not claim a proposed commit happened.
- Run `node tools/runner.mjs complete 7 --commit HEAD` only with committed COMPLETE evidence. Then commit PROJECT_STATUS.md separately, following CLAUDE.md. No manual-user done gate, no empty or fake commits, no push.
- Report behavior, files/migrations, tests actually run, new decisions and their impact, real limitations, work/progress hashes and next eligible prompt in Persian. If the user requested full execution, continue to next eligible prompt without asking for routine permission.
```
