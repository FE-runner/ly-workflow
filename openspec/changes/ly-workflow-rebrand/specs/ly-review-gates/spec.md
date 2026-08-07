## Purpose

Provides two Codex-backed review gates — one for reviewing an OpenSpec change's plan before implementation, one for reviewing code changes after implementation — using the existing `codeagent-wrapper` binary with `--backend codex`, replacing the old dual-model (Codex + Gemini) cross-review mechanism.

## ADDED Requirements

### Requirement: Plan review reads the active OpenSpec change artifacts
`/ly:review-plan` SHALL resolve the target change in this priority order: (1) an explicit change name passed via `$ARGUMENTS`, (2) if omitted, the single change directory under `openspec/changes/` when exactly one exists, (3) if multiple change directories exist and none was specified, ask the user which one to review. Once resolved, it SHALL read the change's `proposal.md`, `design.md`, and `tasks.md` (whichever exist) and pass their combined content as review context to `codeagent-wrapper --backend codex` invoked with the `codex/reviewer.md` role prompt. The review SHALL focus on plan soundness — missing edge cases, unclear scope, risk — not line-level code style.

#### Scenario: Change has proposal and tasks but no design
- **WHEN** user runs `/ly:review-plan` on a change with `proposal.md` and `tasks.md` but no `design.md`
- **THEN** the command reviews the available artifacts and does not error on the missing `design.md`

#### Scenario: No active change exists
- **WHEN** user runs `/ly:review-plan` and no change directory can be resolved
- **THEN** the command asks the user which change to review instead of guessing

#### Scenario: Multiple changes exist without an explicit argument
- **WHEN** user runs `/ly:review-plan` with no argument and `openspec/changes/` contains more than one change directory
- **THEN** the command asks the user which change to review instead of picking one arbitrarily

#### Scenario: Explicit change name provided
- **WHEN** user runs `/ly:review-plan <change-name>`
- **THEN** the command reviews that specific change directory without asking for disambiguation

### Requirement: Code review reads git diff and grades findings
`/ly:review-code` SHALL determine the review scope as: uncommitted changes (`git diff HEAD`) if any exist, otherwise the most recent commit's diff. It SHALL invoke `codeagent-wrapper --backend codex` with the `codex/reviewer.md` role prompt and present findings grouped into exactly three severity tiers: Critical, Warning, Info.

#### Scenario: Uncommitted changes present
- **WHEN** user runs `/ly:review-code` with uncommitted working-tree changes
- **THEN** the review scope is `git diff HEAD` and findings are reported as Critical/Warning/Info

#### Scenario: Clean working tree with prior commits
- **WHEN** user runs `/ly:review-code` with no uncommitted changes and at least one prior commit
- **THEN** the review scope falls back to `git diff HEAD~1`

#### Scenario: Repository has only one commit (no HEAD~1)
- **WHEN** user runs `/ly:review-code` with no uncommitted changes and the repository has exactly one commit
- **THEN** the command reviews that single commit's full content (e.g. `git show HEAD`) instead of erroring on a missing `HEAD~1`

#### Scenario: No findings
- **WHEN** the codex reviewer returns no issues
- **THEN** the command explicitly states no issues were found rather than staying silent
