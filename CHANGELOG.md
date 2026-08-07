# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> Forked from [ccg-workflow](https://github.com/fengshao1227/ccg-workflow) at v3.2.3. History before this point lives in that project's own CHANGELOG.

---

## [1.1.0] - 2026-08-07

### Fixed
- CLI 展示层残留旧品牌名 "CCG - Claude + Codex + Gemini" 及 `/ccg:` 前缀，统一改为反映当前两角色定位的文案；`showHelp()` 改为运行时读目录动态展示已装命令，不再手工枚举
- 跳过安装 impeccable skill 分类时的卸载/清理逻辑不完整：补上按分类过滤复制源、清理历史遗留目录、清理对应命令文件（用生成器指纹校验避免误删用户自定义同名文件），并在 `InstallResult` 中补充清理结果字段用于展示

### Added
- 新 spec：`openspec/specs/cli-skill-category-lifecycle/spec.md` — 描述可选 skill 分类的完整生命周期管理

## [1.0.0] - 2026-08-07

### Changed
- **BREAKING**: renamed project `ccg-workflow` → `ly-workflow`, CLI/slash-command prefix `ccg` → `ly`
- Simplified from a three-model collaboration system (Gemini frontend / Codex backend / Claude orchestrator) to a two-role workflow: Claude Code does chat/analysis/planning/implementation itself, Codex only reviews
- Command set now delegates lifecycle steps directly to native OpenSpec skills (`opsx:explore`/`propose`/`apply`/`archive`) instead of re-wrapping them
- `codeagent-wrapper` (Go binary) now only supports `codex` and `claude` backends

### Added
- `/ly:review-plan` — Codex reviews an OpenSpec change's plan (proposal/design/tasks) for soundness before implementation
- `/ly:review-code` — Codex reviews git diff (including untracked files), grades findings Critical/Warning/Info
- `/ly:init` — generates CLAUDE.md and initializes `openspec/` in one command
- `/ly:explore`, `/ly:propose`, `/ly:apply`, `/ly:archive` — thin delegators to native `opsx:*` skills

### Removed
- `templates/engine/` (model-router + 9 strategy files) and its dispatch logic
- `spec-init`/`spec-research`/`spec-plan`/`spec-impl`/`spec-review`/`go` commands
- `templates/commands-legacy/` (18 legacy multi-model commands) and its install mechanism (`LEGACY_CONFIGS`, `getLegacyCommandIds()`, init wizard's "legacy compatibility" option, update's auto-preserve logic)
- `GeminiBackend`/`GrokBackend`/`AntigravityBackend` from `codeagent-wrapper`
- `templates/prompts/{gemini,grok,antigravity}/`
- Model routing wizard steps (frontend/backend model selection); replaced with a single reviewer-model choice (codex/claude)
