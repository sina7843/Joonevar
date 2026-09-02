#!/usr/bin/env bash
set -euo pipefail
runner_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$runner_root"
runner_command="${1:-help}"
if [[ $# -gt 0 ]]; then shift; fi
case "$runner_command" in
 start)
  node tools/runner.mjs setup
  command -v claude >/dev/null 2>&1 || { echo 'Claude Code is not installed/in PATH.' >&2; exit 1; }
  exec claude "Read START_CLAUDE.md in this repository and execute the complete authorized Hamzist Phase 1 plan. Follow CLAUDE.md."
  ;;
 start-step)
  node tools/runner.mjs setup
  node tools/runner.mjs prepare "$@"
  [[ -f .runner/current-prompt.txt ]] || exit 0
  command -v claude >/dev/null 2>&1 || { echo 'Claude Code is not installed/in PATH.' >&2; exit 1; }
  exec claude "Read .runner/current-prompt.txt and execute only that prepared step according to CLAUDE.md. Do not start another numbered step in this session."
  ;;
 check)
  node --test tools/tests/runner.test.mjs .claude/tests/guardrails.test.mjs
  node tools/runner.mjs check
  ;;
 *) node tools/runner.mjs "$runner_command" "$@" ;;
esac
