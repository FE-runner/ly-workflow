# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> Forked from [ccg-workflow](https://github.com/fengshao1227/ccg-workflow) at v3.2.3. History before this point lives in that project's own CHANGELOG.

---

## [1.4.2] - 2026-08-13

### Changed
- `/ly:worktree` 默认 worktree 目录从项目同级的 `../.ly/<项目名>/` 改为用户目录 `~/.ly/worktrees/<项目名>/`，跨项目集中管理；`add`/`switch` 路径计算与文档同步更新，`--local` 项目内 `.worktrees/` 选项不变
- 清理内部代码标识符、运行时文件名/marker 字符串（`.ccg-version`、`ccg-fast-context.md`、`ccg-grok-search.md`、`<!-- CCG:START -->` 等）及模板内容里残留的 `Ccg`/`CCG`/`ccg` 品牌名，统一改为 `Ly`/`LY`/`ly`；`src/utils/migration.ts` 按范围决策不动

### Fixed
- `templates/hooks/skill-router.js` 域知识自动注入功能因硬编码旧路径（`skills/ccg/`）静默失效，改名后随之修复
- `src/utils/installer.ts` 里 Codex mode 卸载数组的文件名与实际安装产物不一致的问题，随重命名一并修复

---

## [1.4.1] - 2026-08-10

### Added
- `/ly:review-plan` 新增独立角色提示词 `templates/prompts/codex/plan-reviewer.md`：明确禁止把"代码库尚未实现该方案条目""tasks.md 任务未勾选"作为 Critical 依据（这是方案审查阶段的正常状态），checklist 聚焦文档本身的逻辑缺陷；`/ly:review-code` 不受影响，继续使用原 `reviewer.md`
- `/ly:review-plan` 读取工件范围扩展到该 change 目录下的全部 delta spec 文件（`specs/**/*.md`），使 Codex 能判断"spec 是否覆盖 proposal 的 What Changes"；修复对象同步扩展到这些 spec 文件
- `/ly:review-code`/`/ly:review-plan` 共用的终止条件新增第 9 类"审查对象类型持续系统性误判"：连续 3 轮 Critical 均被判定为同一大类系统性误判（不要求锚点匹配）即停止转人工，解决之前"Codex 每轮换锚点重复报同一类误判，现有熔断/分歧未决因锚点不匹配收不住"导致循环空转到轮数上限的问题

---

## [1.4.0] - 2026-08-10

### Added
- `/ly:propose` 总开关改为"全自动 vs 手动逐步确认"两条路径：手动路径新增两处 worktree 询问点（方案提交后、审查循环终止后）与一处"要不要跑 review-plan 审查"询问
- 无论全自动还是手动路径，审查循环以"清零"之外的任一终止原因结束时都问一次 worktree（不带 `--auto`），非正常终止统一处理为"退出自动模式，回到人工确认"
- `/ly:apply` 执行前新增隔离检测：目标 change 名按固定优先级解析（显式参数 → 当前 worktree 反查 → 唯一未归档 change → 询问用户），已在该 change 的受控目标 worktree（固定路径 + 注册分支双重匹配）内跳过询问，不在或不匹配则先问一次要不要切换
- `/ly:worktree switch` 定位到"目标路径已注册"时新增校验该路径当前分支是否严格等于目标 change 名，不匹配则拒绝执行、不直接定位——堵住"固定路径被占用导致 `/ly:apply` 侧新增保护被绕过"这个口子
- `switch` 的续接命令统一按"是否带 `--auto`"和"是否有 baseline 失败摘要"组合出四种续接提示文案，确保"先处理 baseline"和"完成后自动审查"两个约束在交叉场景下都不丢失

### Changed
- `/ly:review-code`/`/ly:review-plan` 的全局轮数上限默认值从 20 轮降到 5 轮，并明确"清零优先于轮数上限"——第 N 轮（含第 5 轮）若结果本身是清零，按清零处理，不因命中轮数上限而误报
- `/ly:worktree switch` 的目标路径解析统一以 `git rev-parse --git-common-dir` 反推的主仓库位置为基准，不依赖调用发生时所处 worktree 的相对路径

### Known Limitations
- 本次隔离检测的目标是防误操作，不是防故意绕过：不校验目标分支 `HEAD` 是否真的包含该 change 当前的 artifact，也不强制 `/ly:worktree switch` 的续接命令必须经过 `/ly:apply`（续接提示仍是建议性引导）

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
