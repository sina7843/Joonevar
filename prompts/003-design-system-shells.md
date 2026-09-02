# PROMPT-003 — دیزاین سیستم، پوسته‌ها و تجربه فارسی

## Purpose
Inspect prototype/DS through read-only tooling and reuse existing assets/components. Implement code tokens and shared form/select/location, status badge, alert, timeline, cards, modal/drawer/bottom-sheet patterns. Do not draw a new brand or crop the logo. IRANSansX requires an available legitimate asset; record any temporary fallback.

## Traceability
Sections: s04, s08, s24, s27; decisions: D06, D10, D11

```text
You are executing PROMPT-003: دیزاین سیستم، پوسته‌ها و تجربه فارسی.

Read first:
CLAUDE.md, EXECUTION_CONTRACT.md, Requirements.md sections 4, 8, 24, 27, IMPLEMENTATION_DECISIONS.md, DECISIONS.md, IMPLEMENTATION_STATUS.md and the relevant existing source/tests. Read linked Flow/Prototype/DS only as appropriate through available read-only tools. Inspect repository changes first. Do not duplicate completed work.

Objective and required implementation:
1. Inspect prototype/DS through read-only tooling and reuse existing assets/components. Implement code tokens and shared form/select/location, status badge, alert, timeline, cards, modal/drawer/bottom-sheet patterns. Do not draw a new brand or crop the logo. IRANSansX requires an available legitimate asset; record any temporary fallback.
2. Build responsive RTL shells: public user/breeder/vet contexts and separate association/genetics/superadmin operations. Role switcher derives only active public roles; no fixed slots or operational role promotion. Enforce route access on the server, not only navigation hiding.
3. Create accessible form errors, keyboard/focus behavior, readable identifiers with direction isolation, long Persian text, loading/empty/error/needs-correction/waiting states and next-action owner labels. Placeholder data must be explicitly synthetic and isolated.
4. Create dashboard/animal profile composition points for future real data. Locked services show reason, next prerequisite and direct CTA. Deep-link/resume routes preserve entity/request context across session restoration.
5. Use vocabulary in §24.4, including کاربر, دامپزشک معتمد, مجوز جفت‌گیری and شروع ثبت کنل. Owner remains valid where ownership is the actual concept.
6. Document design mapping and missing reference evidence; do not classify a code screenshot as a visual match if the source was unavailable.

Validation that must actually run:
Run route/role-switch permission tests and browser render at reference mobile/desktop sizes or documented chosen breakpoints. Inspect screenshots for RTL overflow, identifiers, form errors, focus and logo. Required gates: shell-permissions, rtl-browser-review.

Cross-cutting constraints:
Preserve D01–D19 and Phase 1 exclusions. Use real persistence and backend actor/entity authorization; all asynchronous operations preserve request/resume context. Every feature covers its real states, audit, notifications and item-level outcomes. Synthetic fixtures must be isolated and clearly labeled. Source/prototype conflicts resolve by precedence, not by convenience. Do not modify Figma. Fill gaps in code with DS; do not redesign approved flows.

Autonomous decisions:
For unspecified technical details inspect evidence, choose the smallest compatible solution, record DEC-NNNN with rationale/impact and tell the user in Persian. Do not wait for ordinary approval. Unknown real tariffs, accounts, issuer approvals or integration success are facts to configure/verify, not inventions. A genuine unavailable integration is recorded with its exact scope while independent work continues.

Completion and Git (mandatory):
- Use docs/reports/README.md. Write docs/reports/PROMPT-003.json with status COMPLETE only when all work and required gate records passed; otherwise PARTIAL/BLOCKED and never mark done. Mention concrete evidence and remaining integration/readiness limits.
- Update implementation status, decisions and traceability evidence. Preserve Requirements.md/reference originals and unrelated user changes.
- Review/stage only this task's changes; Claude itself makes a local Git commit containing PROMPT-003 in the message. Verify actual success, do not claim a proposed commit happened.
- Run `node tools/runner.mjs complete 3 --commit HEAD` only with committed COMPLETE evidence. Then commit PROJECT_STATUS.md separately, following CLAUDE.md. No manual-user done gate, no empty or fake commits, no push.
- Report behavior, files/migrations, tests actually run, new decisions and their impact, real limitations, work/progress hashes and next eligible prompt in Persian. If the user requested full execution, continue to next eligible prompt without asking for routine permission.
```
