# PROMPT-004 — ورود، OTP، احراز هویت و حساب

## Purpose
Implement mobile normalization/validation, OTP send/resend/expiry/attempt limits/technical retry and server session. Decide unset TTL, resend and lock limits with rationale and configurable technical settings; do not reopen product questions. No production backdoor OTP.

## Traceability
Sections: s04, s06, s08, s21, s23, s26; decisions: D10, D11

```text
You are executing PROMPT-004: ورود، OTP، احراز هویت و حساب.

Read first:
CLAUDE.md, EXECUTION_CONTRACT.md, Requirements.md sections 4, 6, 8, 21, 23, 26, IMPLEMENTATION_DECISIONS.md, DECISIONS.md, IMPLEMENTATION_STATUS.md and the relevant existing source/tests. Read linked Flow/Prototype/DS only as appropriate through available read-only tools. Inspect repository changes first. Do not duplicate completed work.

Objective and required implementation:
1. Implement mobile normalization/validation, OTP send/resend/expiry/attempt limits/technical retry and server session. Decide unset TTL, resend and lock limits with rationale and configurable technical settings; do not reopen product questions. No production backdoor OTP.
2. New account PROFILE_INCOMPLETE; returning account resumes the authorized originating request or dashboard. OTP states match §6.1. Apply rate limiting and secure session/cookie strategy appropriate to chosen stack.
3. Account fields: first/last name, unique 10-digit national ID and date of birth; optional display name/visibility. Residence province/city/address/postcode/location remain optional; validate entered values. KYC accepts only national-card image/document JPG/PNG/PDF up to 10 MB, privately stored.
4. Build KYC submission, UNDER_REVIEW, approved, needs-correction and rejected-with-reason flow with responsible operations access from source; preserve valid data/files on correction. Choose a scoped existing operator permission if exact assignment is missing and disclose it, without a new product gate.
5. After KYC, first/last name and birth date are directly editable; national ID is read-only. Address/display name editable. Mobile change requires OTP on new number; old mobile stays valid until successful verification and survives cancel/failure.
6. Keep account, KYC, membership, public role and request states distinct. Record sensitive before/after with private access. Confirm animal registration unlocks after KYC regardless of membership.

Validation that must actually run:
Test invalid/expired/replayed OTP, resend/rate-limit boundaries, uniqueness races, optional empty residence, private KYC access, correction, direct allowed profile edits and unsuccessful phone change. Browser-run new and returning user resume. Required gates: identity-integration, identity-browser.

Cross-cutting constraints:
Preserve D01–D19 and Phase 1 exclusions. Use real persistence and backend actor/entity authorization; all asynchronous operations preserve request/resume context. Every feature covers its real states, audit, notifications and item-level outcomes. Synthetic fixtures must be isolated and clearly labeled. Source/prototype conflicts resolve by precedence, not by convenience. Do not modify Figma. Fill gaps in code with DS; do not redesign approved flows.

Autonomous decisions:
For unspecified technical details inspect evidence, choose the smallest compatible solution, record DEC-NNNN with rationale/impact and tell the user in Persian. Do not wait for ordinary approval. Unknown real tariffs, accounts, issuer approvals or integration success are facts to configure/verify, not inventions. A genuine unavailable integration is recorded with its exact scope while independent work continues.

Completion and Git (mandatory):
- Use docs/reports/README.md. Write docs/reports/PROMPT-004.json with status COMPLETE only when all work and required gate records passed; otherwise PARTIAL/BLOCKED and never mark done. Mention concrete evidence and remaining integration/readiness limits.
- Update implementation status, decisions and traceability evidence. Preserve Requirements.md/reference originals and unrelated user changes.
- Review/stage only this task's changes; Claude itself makes a local Git commit containing PROMPT-004 in the message. Verify actual success, do not claim a proposed commit happened.
- Run `node tools/runner.mjs complete 4 --commit HEAD` only with committed COMPLETE evidence. Then commit PROJECT_STATUS.md separately, following CLAUDE.md. No manual-user done gate, no empty or fake commits, no push.
- Report behavior, files/migrations, tests actually run, new decisions and their impact, real limitations, work/progress hashes and next eligible prompt in Persian. If the user requested full execution, continue to next eligible prompt without asking for routine permission.
```
