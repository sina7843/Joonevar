# PROMPT-014 — تاریخ‌های دوطرفه و هشدار فاصله جفت‌گیری

## Purpose
Only an issued official permit enables official date declarations. Either participant can propose one or many dates, including multiple in a week. Store declaring actor, version and timestamp.

## Traceability
Sections: s10, s16, s17, s23, s26; decisions: D12

```text
You are executing PROMPT-014: تاریخ‌های دوطرفه و هشدار فاصله جفت‌گیری.

Read first:
CLAUDE.md, EXECUTION_CONTRACT.md, Requirements.md sections 10, 16, 17, 23, 26, IMPLEMENTATION_DECISIONS.md, DECISIONS.md, IMPLEMENTATION_STATUS.md and the relevant existing source/tests. Read linked Flow/Prototype/DS only as appropriate through available read-only tools. Inspect repository changes first. Do not duplicate completed work.

Objective and required implementation:
1. Only an issued official permit enables official date declarations. Either participant can propose one or many dates, including multiple in a week. Store declaring actor, version and timestamp.
2. Send each declaration/version to counterparty: confirm same date or declare different date and show DATE_CONFLICT with both values. Correction appends a version and invalidates prior approvals for the new version; it must be reconfirmed by counterparty.
3. Keep all confirmed date history. Latest two-party CONFIRMED date drives both animals' timeline/cooldown. Personal unverified dates never replace this official basis.
4. Male cooldown 14 days, female six calendar months. Inspect existing product calendar; decide and document exact civil/calendar-month arithmetic and timezone/date-only handling, including end-of-month clamp rules. No arbitrary conversion of six months to days.
5. Inside interval show sex, basis date/end, warning and enabled continue; record warning/continue. No confirmed history => no synthetic date/no computed warning. Apply uniformly across every permit entry.
6. Build conflict, correction, counterparty response, notifications and precise resume views.

Validation that must actually run:
Test stale approval cannot confirm new version, both actors, repeated dates/history, latest confirmed basis, male day boundaries, female month-end/leap boundaries, no history, timezone handling and continue while warned. Required gates: dates-version-concurrency, cooldown-boundaries.

Cross-cutting constraints:
Preserve D01–D19 and Phase 1 exclusions. Use real persistence and backend actor/entity authorization; all asynchronous operations preserve request/resume context. Every feature covers its real states, audit, notifications and item-level outcomes. Synthetic fixtures must be isolated and clearly labeled. Source/prototype conflicts resolve by precedence, not by convenience. Do not modify Figma. Fill gaps in code with DS; do not redesign approved flows.

Autonomous decisions:
For unspecified technical details inspect evidence, choose the smallest compatible solution, record DEC-NNNN with rationale/impact and tell the user in Persian. Do not wait for ordinary approval. Unknown real tariffs, accounts, issuer approvals or integration success are facts to configure/verify, not inventions. A genuine unavailable integration is recorded with its exact scope while independent work continues.

Completion and Git (mandatory):
- Use docs/reports/README.md. Write docs/reports/PROMPT-014.json with status COMPLETE only when all work and required gate records passed; otherwise PARTIAL/BLOCKED and never mark done. Mention concrete evidence and remaining integration/readiness limits.
- Update implementation status, decisions and traceability evidence. Preserve Requirements.md/reference originals and unrelated user changes.
- Review/stage only this task's changes; Claude itself makes a local Git commit containing PROMPT-014 in the message. Verify actual success, do not claim a proposed commit happened.
- Run `node tools/runner.mjs complete 14 --commit HEAD` only with committed COMPLETE evidence. Then commit PROJECT_STATUS.md separately, following CLAUDE.md. No manual-user done gate, no empty or fake commits, no push.
- Report behavior, files/migrations, tests actually run, new decisions and their impact, real limitations, work/progress hashes and next eligible prompt in Persian. If the user requested full execution, continue to next eligible prompt without asking for routine permission.
```
