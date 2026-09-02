[CmdletBinding()]
param([Parameter(Position=0)][string]$Command='help', [Parameter(Position=1,ValueFromRemainingArguments=$true)][string[]]$Arguments)
$ErrorActionPreference='Stop'
$RunnerRoot=Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $RunnerRoot
function Invoke-Runner([string]$Name,[string[]]$RunnerArgs=@()) {
 & node (Join-Path $RunnerRoot 'tools/runner.mjs') $Name @RunnerArgs
 if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
switch ($Command.ToLowerInvariant()) {
 'start' {
  Invoke-Runner 'setup'
  if (-not (Get-Command claude -ErrorAction SilentlyContinue)) { throw 'Claude Code is not installed/in PATH.' }
  $TaskText='Read START_CLAUDE.md in this repository and execute the complete authorized Hamzist Phase 1 plan. Follow CLAUDE.md.'
  & claude $TaskText
  exit $LASTEXITCODE
 }
 'start-step' {
  Invoke-Runner 'setup'
  Invoke-Runner 'prepare' $Arguments
  $PromptPath=Join-Path $RunnerRoot '.runner/current-prompt.txt'
  if (-not (Test-Path -LiteralPath $PromptPath)) { exit 0 }
  if (-not (Get-Command claude -ErrorAction SilentlyContinue)) { throw 'Claude Code is not installed/in PATH.' }
  $TaskText='Read .runner/current-prompt.txt and execute only that prepared step according to CLAUDE.md. Do not start another numbered step in this session.'
  & claude $TaskText
  exit $LASTEXITCODE
 }
 'check' {
  & node --test tools/tests/runner.test.mjs .claude/tests/guardrails.test.mjs
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Invoke-Runner 'check'
 }
 default { Invoke-Runner $Command $Arguments }
}
