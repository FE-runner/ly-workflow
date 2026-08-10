# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> Forked from [ccg-workflow](https://github.com/fengshao1227/ccg-workflow) at v3.2.3. History before this point lives in that project's own CHANGELOG.

---

## [1.3.0] - 2026-08-10

### Added
- `/ly:init` 生成 CLAUDE.md + `openspec init` 后自动 commit（`CLAUDE.md`、`openspec/`）
- `/ly:apply` 委托 `opsx:apply` 实施 tasks 后自动 commit 本次实际改动的文件
- `/ly:archive` 委托 `opsx:archive` 归档后自动 commit `openspec/` 下的文件移动

### Changed
- `/ly:review-code`/`/ly:review-plan` 的每轮自动 commit 由"需显式传 `--commit-each-round`"改为默认行为，新增 `--no-commit` 用于关闭
- `/ly:propose` 调用 review-plan、`/ly:worktree switch --auto` 的续接提示同步去掉现已冗余的 `--commit-each-round` 标志

---



### Changed
- `/ly:explore` 加一句转向提示：`opsx:explore` 原生支持讨论中直接创建 proposal/design/spec，但这样会跳过 `/ly:propose` 的编排（总开关、commit、review-plan 审查循环、worktree 询问）；讨论收敛到"要落地方案"时改为提示用户切换 `/ly:propose`，explore 本身不接管 artifact 创建

---

## [1.2.0] - 2026-08-08

### Added
- `/ly:review-code`/`/ly:review-plan` 新增审查-修复循环：Critical 清零或触发终止条件（熔断/分歧未决/无法安全修复/验证失败/审查调用失败/达到全局轮数上限，默认 20 轮）才停止；Codex 报告的 Critical 不再是自动生效的裁决，Claude 先判断是否认可，不认可则不修复但要写反驳理由，同一问题连续两轮分歧则触发"分歧未决"转人工
- `/ly:review-plan` 补上 Critical/Warning/Info 三级分级输出（此前是不分级的问题清单）
- `/ly:review-code`/`/ly:review-plan` 新增 `--commit-each-round` 标志，由循环自身在每轮修复+验证通过后逐轮提交
- `/ly:worktree` 新增 `switch <change-name> [--auto]` 子命令：按 OpenSpec change 名一键定位或创建隔离 worktree，含分支拓扑祖先校验（已注册 worktree 直接定位跳过）、命名合法性校验、baseline 失败默认阻断续接命令；`--auto` 让续接命令要求新会话实施完自动跑审查循环
- 新 spec：`openspec/specs/worktree-switch/spec.md`、`openspec/specs/ly-propose-flow/spec.md`

### Changed
- `/ly:propose` 从零逻辑委托壳升级为编排入口：调用 `opsx:propose` 前先问一次总开关（是否走自动化收尾），commit 不受开关影响永远执行；开关开启时依次调用 `/ly:review-plan --commit-each-round`，审查循环以 Critical 清零结束后询问是否 `/ly:worktree switch --auto`
- `/ly:apply` 委托完成后追加一句不含具体 change 名的通用 worktree 切换提示
- 废止"薄壳不附加自定义逻辑"这条项目级原则——`propose` 已是编排入口，`apply`/`archive`/`explore` 仍是薄壳但不再受该原则约束
- `openspec/specs/ly-review-gates/spec.md`、`openspec/specs/ly-lifecycle-commands/spec.md` 同步合并本次 delta

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
