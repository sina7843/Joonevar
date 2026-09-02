# Package validation — 2026-09-02

These are package/runtime checks, not tests of a built Hamzist application.

## Executed and passed

- `bash runner.sh check`: 23 tests passed, 0 failures, 0 skipped; package validation and sequential status passed. Runtime: Node.js v24.19.0 on Linux.
- Structural validator: 20 sequential unique prompt IDs, predecessor dependencies, one executable text block per prompt, required-check IDs and exact status/traceability keys.
- Source verification: both copies match the uploaded reference SHA-256; all 29 sections, 19 final decisions, 33 exact §28 acceptance rows and every original reference URL retained/mapped.
- Git integration tests: actual temporary repositories verify committed-report-only completion, reject no/new-invalid work commit, PARTIAL report, skipped gate, blockers and non-HEAD evidence; preserve unrelated staged user work; require a progress commit before next prompt.
- Resume/recovery tests: prepared HEAD stable across resume, idempotent completion, interrupted status/state recovery, reopen cascade without history rewrite, manifest mismatch, nested repo rejection and real Git worktree metadata file.
- Guard checks: ordinary local commit/Runner/decision-report edits allowed; direct original-source overwrite, real environment-file reads, remote push and destructive Git operations refused under tested patterns.
- Fresh full-package smoke in path containing spaces: setup twice, prepare, check, shell status and bash syntax check passed. Setup did not stage files or create an automatic commit.
- Bash start/start-step argument handoff verified using a stub Claude executable. The real model/CLI was not invoked.

## Limits explicitly retained

- Windows PowerShell/CMD wrappers were inspected and supplied with CRLF but not executed on Windows in this environment.
- Actual Claude CLI hook/permission enforcement remains to be checked in the user's installed CLI. No permission bypass is included. Pattern hooks are defense in depth, not a full shell sandbox.
- Live Figma, playback, actual fonts/logos, provider credentials, OTP/payment/reader integrations and application behavior were not tested while producing this instruction package.
- Runtime evidence records are declarations by the executing agent; the Runner validates structure, commit linkage and gate records, not semantic truth of the recorded test.
- Product execution starts NOT_STARTED; no work/progress commits or application-completion reports are fabricated in this ZIP.
