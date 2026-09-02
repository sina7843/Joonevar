# Committed completion evidence

Each active step writes `docs/reports/PROMPT-NNN.json`. No placeholder COMPLETE reports are shipped. Use this structure, replacing every example with actual evidence:

```json
{
  "promptId": "PROMPT-001",
  "status": "COMPLETE",
  "summary": "Concrete implemented or verified behavior",
  "changedFiles": ["docs/architecture/implementation-plan.md"],
  "decisions": ["DEC-0001"],
  "checks": [{
    "id": "source-and-architecture-review",
    "command": "actual inspection command or explicitly named manual procedure",
    "result": "PASS",
    "evidence": "actual observed result and/or committed evidence path"
  }],
  "blockers": [],
  "limitations": ["Example only: real gateway credentials not configured"],
  "readiness": {"code": "NOT_APPLICABLE", "visual": "UNVERIFIED", "integrations": "NOT_CONFIGURED", "production": "NOT_READY"}
}
```

`changedFiles`, `summary`, `checks` and meaningful evidence are required. All requiredChecks IDs in the active manifest must appear with PASS. FAILED/SKIPPED/BLOCKED mandatory checks cannot be disguised as PASS. Optional unavailable external checks belong in limitations/readiness, clearly distinguished from mandatory gate failures. If a required visual reference is unavailable, that gate remains blocked.

Before complete, commit this report with the actual work. Runner reads the JSON from the supplied Git commit (which must be current HEAD), not merely from the working tree. It checks a new commit since prepare, ancestry, ID in commit message, dependency order and that declared files exist in that commit. It cannot prove semantic correctness or that a reported test really ran; Claude remains responsible for truthful evidence. Do not manufacture reports to advance.

The work commit cannot contain its own hash. Runner puts the verified work hash into PROJECT_STATUS.md and ignored history; Claude then creates a separate progress commit. Interrupted state after work commit can be resumed by complete; interrupted progress commit is completed before the next step. Reopen requires an explanation in DECISIONS/IMPLEMENTATION_STATUS and must not erase Git history.
