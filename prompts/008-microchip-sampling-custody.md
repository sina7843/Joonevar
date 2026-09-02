# PROMPT-008 — میکروچیپ، نمونه‌گیری و نگهداری نمونه

## Purpose
Build assigned vet queue and visit detail with animal image, user, service, code and location. Implement reader Bluetooth/mobile, package barcode and manual number entry as adapters to one canonical Microchip Number. Declare real hardware readiness accurately; manual retry remains usable.

## Traceability
Sections: s11, s12, s21, s23, s26; decisions: D02, D05, D07, D09, D13

```text
You are executing PROMPT-008: میکروچیپ، نمونه‌گیری و نگهداری نمونه.

Read first:
CLAUDE.md, EXECUTION_CONTRACT.md, Requirements.md sections 11, 12, 21, 23, 26, IMPLEMENTATION_DECISIONS.md, DECISIONS.md, IMPLEMENTATION_STATUS.md and the relevant existing source/tests. Read linked Flow/Prototype/DS only as appropriate through available read-only tools. Inspect repository changes first. Do not duplicate completed work.

Objective and required implementation:
1. Build assigned vet queue and visit detail with animal image, user, service, code and location. Implement reader Bluetooth/mobile, package barcode and manual number entry as adapters to one canonical Microchip Number. Declare real hardware readiness accurately; manual retry remains usable.
2. Implant: read serial before implantation, check global uniqueness and no lifetime chip for this animal, confirm implant event, reread and match, then bind permanently. Verification: same-chip/same-animal valid; other animal, different lifetime chip or mismatch => recorded conflict with no overwrite. Existing physical unregistered chip can bind only after uniqueness and lifetime checks.
3. Enforce one chip per lifetime including historical data at DB transaction boundary. No second chip, replacement, transfer, deletion-based conflict bypass or auto conflict resolution.
4. Both implant and verification require blood sampling. Only after actual sampling record issue a unique Sample Tracking Code linked to animal/request/vet/location. Referral and sample code must never be conflated.
5. Record custody with the same vet; no automatic sample expiry. Keep sample until receipt approval/send instruction. Shipment later is an event on that code.
6. Implement resampling as a new sample/code after actual recollection within the same request, preserving old invalid/insufficient/damaged/lost sample and reason. Do not implant again.
7. Build service summary with all source fields and physical-signature information only; no digital signature workflow/gate.

Validation that must actually run:
Test concurrent chip binding and second lifetime chip prevention, existing physical unrecorded chip, serial mismatch, mandatory blood in both services, no early sample code, custody and resampling on same request. Browser verify assigned vet only and manual entry fallback. Required gates: chip-sample-integrity, vet-service-browser.

Cross-cutting constraints:
Preserve D01–D19 and Phase 1 exclusions. Use real persistence and backend actor/entity authorization; all asynchronous operations preserve request/resume context. Every feature covers its real states, audit, notifications and item-level outcomes. Synthetic fixtures must be isolated and clearly labeled. Source/prototype conflicts resolve by precedence, not by convenience. Do not modify Figma. Fill gaps in code with DS; do not redesign approved flows.

Autonomous decisions:
For unspecified technical details inspect evidence, choose the smallest compatible solution, record DEC-NNNN with rationale/impact and tell the user in Persian. Do not wait for ordinary approval. Unknown real tariffs, accounts, issuer approvals or integration success are facts to configure/verify, not inventions. A genuine unavailable integration is recorded with its exact scope while independent work continues.

Completion and Git (mandatory):
- Use docs/reports/README.md. Write docs/reports/PROMPT-008.json with status COMPLETE only when all work and required gate records passed; otherwise PARTIAL/BLOCKED and never mark done. Mention concrete evidence and remaining integration/readiness limits.
- Update implementation status, decisions and traceability evidence. Preserve Requirements.md/reference originals and unrelated user changes.
- Review/stage only this task's changes; Claude itself makes a local Git commit containing PROMPT-008 in the message. Verify actual success, do not claim a proposed commit happened.
- Run `node tools/runner.mjs complete 8 --commit HEAD` only with committed COMPLETE evidence. Then commit PROJECT_STATUS.md separately, following CLAUDE.md. No manual-user done gate, no empty or fake commits, no push.
- Report behavior, files/migrations, tests actually run, new decisions and their impact, real limitations, work/progress hashes and next eligible prompt in Persian. If the user requested full execution, continue to next eligible prompt without asking for routine permission.
```
