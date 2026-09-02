# Execution plan

20 ordered prompts, with direct predecessor dependencies. Every file has one complete copyable text block. The Runner prepares it in .runner/current-prompt.txt. No application code has been implemented by package generation.

START_CLAUDE.md starts the entire sequence. The active per-step prompt controls current scope. Resume by reading persisted PROJECT_STATUS.md, IMPLEMENTATION_STATUS.md, DECISIONS.md and the committed reports, not conversation memory.
