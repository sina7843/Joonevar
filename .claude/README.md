# Claude configuration

Settings allow routine local Git commits and Runner commands using ordinary Claude permissions; no bypassPermissions or enforcement override. Other legitimate tools can still be subject to user/managed environment permissions. Do not alter them to evade a denial.

Hooks are lightweight defense in depth for direct source/secret edits and obvious destructive/remote Git commands. They are not a full shell sandbox and cannot certify semantic safety of arbitrary scripts. Root CLAUDE.md and the environment's actual permissions remain authoritative.

Roles under agents/ are optional specialist descriptions with inherited model, not a mandatory multi-agent pipeline. Only main agent owns progress/commits. Hook uses the documented full command string, not an unsupported args array. Windows requires the shell environment supported by Claude Code; wrappers were not executed on Windows during packaging.
