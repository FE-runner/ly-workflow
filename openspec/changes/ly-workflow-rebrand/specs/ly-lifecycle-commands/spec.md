## Purpose

Provides five thin `/ly:*` slash commands that delegate directly to Claude Code's native `init` skill and OpenSpec's native `explore`/`propose`/`apply`/`archive` skills, so users get a consistently-prefixed command set without any custom orchestration logic layered on top.

## ADDED Requirements

### Requirement: Init command bootstraps both CLAUDE.md and OpenSpec
`/ly:init` SHALL perform project bootstrap in two sequential steps: (1) invoke the native `init` skill to generate/update CLAUDE.md, then (2) ensure the `openspec` CLI is installed and run `openspec init` to scaffold the `openspec/` directory. Neither step SHALL be skipped silently; if `openspec` CLI is missing, the command SHALL install it before proceeding.

#### Scenario: Fresh project with no CLAUDE.md and no openspec/ directory
- **WHEN** user runs `/ly:init` in a project with neither CLAUDE.md nor an `openspec/` directory
- **THEN** the command generates CLAUDE.md via the native `init` skill AND initializes `openspec/` via `openspec init`

#### Scenario: openspec CLI not installed
- **WHEN** user runs `/ly:init` and the `openspec` command is not found on PATH
- **THEN** the command installs `@fission-ai/openspec` globally before running `openspec init`

### Requirement: Explore/Propose/Apply/Archive commands are pure delegators
`/ly:explore`, `/ly:propose`, `/ly:apply`, and `/ly:archive` SHALL each invoke exactly one corresponding native OpenSpec skill (`opsx:explore`, `opsx:propose`, `opsx:apply`, `opsx:archive` respectively), forwarding `$ARGUMENTS` unchanged. None of the four SHALL contain custom multi-model dispatch, environment validation, or output post-processing beyond what the underlying skill already does.

#### Scenario: Propose command forwards arguments verbatim
- **WHEN** user runs `/ly:propose "add dark mode"`
- **THEN** the command invokes the `opsx:propose` skill with the argument `"add dark mode"` unchanged

#### Scenario: Archive command takes no extra behavior
- **WHEN** user runs `/ly:archive`
- **THEN** the command invokes the `opsx:archive` skill with no additional steps before or after
