# Hamzist — execution instructions

Read EXECUTION_CONTRACT.md first. Build/complete the actual Phase 1 application; do not stop after planning. Communicate progress and decisions in Persian. Run from this package at the target repository root.

## Source precedence by concern
1. Current explicit user instructions, including authorized autonomous decisions and local commits.
2. Final product decisions D01–D19 in Requirements.md (especially F14 lifetime membership).
3. Flow Map for workflow/actors/dependencies; the supplied complete reference records the accepted interpretation.
4. Prototype for approved fields, layout and compatible interaction; Design System for visual tokens/components.
5. Existing code/contracts where consistent with the above.
6. This package's implementation suggestions and Claude's documented decisions for genuinely unresolved details.
Never silently restore obsolete annual membership, scheduling, vet onboarding, signing gates or old DNA ordering from live/historical materials. A missing standalone flow node does not authorize deleting an approved field. Original source is reference-inputs/Hamzist_Project_Reference_v1.1.md; Requirements.md is byte-identical.

## Execution
- Inspect existing git status, repository instructions, architecture and implementation before editing. Preserve correct code and unrelated user changes. No blanket rewrite.
- Run `node tools/runner.mjs setup` once, then `node tools/runner.mjs prepare` for the next incomplete prompt. Read the complete active text and relevant source sections.
- Execute one coherent vertical slice at a time: migration/model, server permissions, API, persisted UI, states, notifications, audit and relevant tests. Keep app runnable between steps.
- Routine uncertainties: decide, implement, log DEC-NNNN with rationale/impact/source and tell the user; do not wait for approval. Missing external facts: configuration + truthful readiness status, not invented facts.
- Keep Requirements.md and reference-inputs originals unchanged. Preserve prompt sequencing and scope. Technical architecture can evolve in docs/architecture and DECISIONS.md; do not use planning-file immutability to block authorized choices.
- Figma is read-only for this task. Fill missing operational pages in code with existing DS. Do not edit Figma files or DS masters.
- New source/configuration/tests are work; never finish at a list of suggestions. Do not mark unexecuted tests passed, skipped tests passed, or incident reports closed without evidence.
- Agents are optional role descriptions, not a required chain. Work directly unless delegation is useful and allowed by the actual session. Only the main agent owns Git commits and Runner state.

## Git and completion (required)
1. Record initial `git status --short`, staged diff and HEAD for the active step. Do not stage, reset, stash or commit unrelated user work. In an existing dirty repository use explicit paths/hunks or an isolated worktree; preserve the user's index.
2. In a new repository, include the reviewed safe package files (instructions, prompts, Runner, reference document, configuration and planning/status) in the first work commit using explicit paths, so a clone can reproduce execution. In an existing repository include only authorized added/changed package files and preserve existing instructions. Never leave required execution files untracked at final handoff.
3. Use existing effective Git identity. If absent, set repository-local `user.name` to `Hamzist Implementation Agent` and `user.email` to `hamzist-agent@local.invalid`, log this choice, and continue. Never change global identity or impersonate a human.
4. Run the active prompt's relevant checks. Fix failures. Write docs/reports/PROMPT-NNN.json using docs/reports/README.md, update IMPLEMENTATION_STATUS.md, DECISIONS.md and evidence links in REQUIREMENTS_TRACEABILITY.md as appropriate.
5. Review diff and stage only this task's safe changes (never blanket add -A in a dirty existing repo). Include report and decision entries. `git commit -m "feat(scope): PROMPT-NNN concrete behavior"` (docs/fix/test/chore type as appropriate). No empty commits, amend of prior work, history rewrite, --no-verify or push. Review hooks' effects and rerun affected checks if needed.
6. Run `node tools/runner.mjs complete N --commit HEAD`. Runner verifies the report committed in HEAD, required check records and dependency order, then updates PROJECT_STATUS.md with the work hash. Runner does not perform semantic review or run product tests for you.
7. Commit only the updated PROJECT_STATUS.md in a separate `chore(progress): PROMPT-NNN complete` commit. This avoids a report containing its own unknowable hash. .runner state stays ignored. If this second commit fails, resume it before proceeding; never claim a clean committed state until verified.
8. Report actual work hash and progress hash, checks/results, autonomous decisions and impacts, limitations and next prompt. Verify final status without altering unrelated changes.
9. When asked to execute the whole project, proceed to the next eligible prompt yourself. Do not ask the user to run done or approve a routine decision. If the context window ends, leave an exact resume instruction.

If required work/checks remain incomplete: a truthful checkpoint commit is allowed, but use PARTIAL/BLOCKED report and do not run complete. If Git identity or signing is enforced by the environment and fails, report COMMIT_BLOCKED; never weaken those policies to continue. Local commits are authorized; changing permissions is not.
