## Why

当前 fork（ccg-workflow）是 Codex + Gemini + Claude 三模型协作系统，围绕"前端模型/后端模型双分派 + 交叉审查"设计。实际使用者的工作流只需两个角色：Claude Code 自己完成聊天、分析、规划、实施全流程（不做多模型分派），Codex 仅在方案确认后、代码完成后两个节点介入做审查。继续维护一套用不上的多模型引擎、三套无用的模型 prompts、三个闲置的 wrapper backend，只会增加认知负担和维护成本。此外希望最大化复用 OpenSpec 原生工作流（explore/propose/apply/archive），而不是重复自研一套等价的 spec 包装命令。

## What Changes

- 项目改名：`ccg-workflow` → `ly-workflow`，CLI 命令与 slash command 前缀 `ccg` → `ly`（**BREAKING**）
- 新增 7 个 `/ly:*` 命令，替代原有的多模型工作流命令：
  - `init` — 串联原生 `init` 技能（生成 CLAUDE.md）与 `openspec init`（初始化 OpenSpec 目录结构）
  - `explore` / `propose` / `apply` / `archive` — 薄壳命令，直接调用对应的 `opsx:*` 技能，不附加自定义逻辑
  - `review-plan` — 读取当前 OpenSpec change 的 proposal/design/tasks，调用 codeagent-wrapper（`--backend codex`）审查方案合理性与风险点
  - `review-code` — 读取 git diff（无未提交变更则查最近一次 commit），调用 codeagent-wrapper（`--backend codex`）输出 Critical/Warning/Info 分级审查结果
- 删除多模型协作引擎与相关命令（**BREAKING**）：
  - `templates/engine/` 整个目录（model-router.md、phase-guide.md、9 个 strategy 文件）
  - 命令：`spec-init` `spec-research` `spec-plan` `spec-impl` `spec-review` `go`
  - agents：`planner` `ui-ux-designer` `team-architect` `team-qa` `team-reviewer` `init-architect` `get-current-datetime`（均已确认无引用，或被新 `init` 命令取代）
  - `templates/prompts/gemini/` `templates/prompts/grok/` `templates/prompts/antigravity/` 三个目录（仅保留 `claude/` 和 `codex/`）
- Go wrapper（codeagent-wrapper）瘦身（**BREAKING**）：删除 `GeminiBackend` / `GrokBackend` / `AntigravityBackend` 三个 backend 实现及相关配置字段（`GeminiModel` `GrokModel` 等），仅保留 `CodexBackend` 与 `ClaudeBackend`；执行引擎（并发调度、日志、进程管理、SSE Web UI）不变
- 类型与配置简化：`ModelType` 收窄为 `'codex' | 'claude'`，`ModelRouting` 去掉 `frontend` 概念，安装向导去掉模型路由选择步骤
- 文档整体重写（二次开发型 fork 惯例，非增量更新）：README.md、CONTRIBUTING.md、CHANGELOG.md、SECURITY.md、CODE_OF_CONDUCT.md、issue 模板等旧文档重写为反映新架构与新项目名的版本
  - **底线不动**：`LICENSE` 文件保留原样（含原作者版权声明，协议要求不可删改）；git commit 历史不重写/不 squash，保留可追溯性
  - CHANGELOG.md 另起新记录，首条注明 "Forked from ccg-workflow" 作为分界，此后按新项目节奏正常追加，不搬运旧的三模型协作历史条目
  - README.md 底部保留一行 credit（"Based on ccg-workflow"），其余内容按新项目结构重写，不保留旧叙事

## Capabilities

### New Capabilities
- `ly-lifecycle-commands`：`/ly:init` `/ly:explore` `/ly:propose` `/ly:apply` `/ly:archive` 五个命令的行为契约（各自委托给哪个原生能力、参数如何传递）
- `ly-review-gates`：`/ly:review-plan` `/ly:review-code` 两个审查关卡的行为契约（输入来源、调用方式、输出格式与分级规则）

### Modified Capabilities
（无——本仓库此前未对旧多模型引擎建立过 spec，删除行为记录在 tasks/design 中，不涉及既有 spec 的行为变更）

## Impact

- **受影响代码**：`templates/commands/*`、`templates/commands/agents/*`、`templates/engine/*`、`templates/prompts/{gemini,grok,antigravity}/*`、`codeagent-wrapper/*.go`、`src/types/index.ts`、`src/commands/init.ts`、`src/utils/installer-template.ts`、`package.json`、各级 `CLAUDE.md`、`README.md`、`CHANGELOG.md`、`CONTRIBUTING.md` 等文档
- **受影响依赖**：无新增第三方依赖；Go wrapper 版本号需同步 bump（`main.go` + `src/utils/installer.ts` 双处一致）
- **不受影响**：`clean-branches` `commit` `context` `rollback` `worktree` 命令；质量关卡技能（verify-*、gen-docs）；域知识秘典；impeccable 工具集；codeagent-wrapper 底层执行引擎（executor/parser/logger/server）
