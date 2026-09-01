## Why

`/ly:apply` 目前只能由 Claude 自己实施代码，没有像审查关卡（`routing.reviewer`，支持 codex/claude/hermes/openclaw 四选一）那样的外部委托能力，实施与审查在架构上不对称。把实施也委托给独立的 Implementer agent，能进一步降低当前 Claude 会话的 token 消耗（写代码、跑验证、迭代修 bug 全部发生在外部 agent 自己的进程里），并让 Claude 更纯粹地承担"总指挥"角色（出方案、判断审查意见的接受/拒绝、亲自修复认可的 Critical、commit、终止判断）。`templates/prompts/codex/builder.md` 这个 Implementation Agent 角色提示词此前随老版多模型引擎一起遗留下来，从未被任何命令实际引用，正好可以复用。

## What Changes

- 新增 `routing.implementer` 配置项，三选一：`codex`/`hermes`（默认）/`openclaw`，必选、无"不委托"选项——`/ly:apply` 不再存在"Claude 自己实施"的路径。
- `npx ly-workflow init` 向导新增"选择实施后端"步骤（紧跟"选择审查模型"之后）；若用户选择的 `routing.implementer` 与 `routing.reviewer` 相同，向导提示"审查独立性会降低，建议选不同的 backend"（不阻断）。
- `npx ly-workflow update`（非交互 `--skip-prompt` 路径）在 `routing.implementer` 缺失时静默补齐默认值 `hermes`。
- **BREAKING**：`routing.reviewer` 的可选值从四选一（`codex`/`claude`/`hermes`/`openclaw`）收窄为三选一，移除 `claude`——Claude（当前交互会话）已经是总指挥，不应再被选为被调度的审查/实施 backend。已有配置值为 `claude` 的项目，下次运行 `/ly:init`（交互式向导）或 `npx ly-workflow update` 时须重新选择；`update` 的非交互路径检测到历史遗留值 `claude` 时静默改写为默认值 `codex`（reviewer）/`hermes`（implementer），并在汇总中提示"检测到已移除的 claude 选项，已重置为默认值"。
- `/ly:apply` 的实施步骤改为：读取 `routing.implementer` → 委托 `codeagent-wrapper --backend <implementer>`，`ROLE_FILE: builder.md`，单次 agentic 调用（不逐任务拆分、不做审查-修复循环）→ 读取返回的 Execution Report。
  - `OVERALL: PASS` → 沿用现有的暂存与 commit 步骤（`apply: <change-name>`）。
  - `OVERALL: FAIL`（或 wrapper 调用本身超时/非零退出/空响应）→ 原样呈报失败详情给用户，**不自动重试、不自动切回 Claude 自行实施**，转人工决定。
- `/ly:review-plan`、`/ly:review-code` 不变：审查者仍是 `routing.reviewer`，只挑毛病；认可的 Critical 仍由 Claude 亲自修复（现有审查-修复循环机制不动）。

## Capabilities

### New Capabilities
- `optional-implementer-agent`：`routing.implementer` 配置的选择、持久化、`/ly:apply` 按该配置委托外部实施 agent 的行为，及 PASS/FAIL 后续处理。

### Modified Capabilities
- `ly-lifecycle-commands`：`/ly:apply` 的实施步骤从固定调用 `opsx:apply`（Claude 自己实施）改为读取 `routing.implementer` 后委托外部 agent。
- `optional-review-agent`：`routing.reviewer` 的可选值从四选一收窄为三选一（移除 `claude`），并补充存量配置为 `claude` 时的迁移行为。

## Impact

- `templates/commands/apply.md`：实施步骤改写为按 `routing.implementer` 分支的委托逻辑。
- `src/commands/init.ts`：新增 `routing.implementer` 交互式选择步骤；`routing.reviewer` 的选项列表移除 `claude`；两者相同时的独立性提示。
- `src/commands/update.ts`（及其调用的 `init --skip-prompt` 路径）：`routing.implementer` 缺失时静默默认 `hermes`；历史遗留 `claude` 值静默重置。
- `src/utils/installer.ts` 的 `injectConfigVariables()`：新增 `{{IMPLEMENTER_MODEL}}` 占位符，供 `apply.md` 中 `ROLE_FILE: prompts/{{IMPLEMENTER_MODEL}}/builder.md` 使用。
- `templates/prompts/codex/builder.md`：从孤儿文件变为被实际引用；因安装器对 hermes/openclaw 走 codex 目录兜底复制，无需新增 hermes/openclaw 专属 builder.md 文件。
- 不涉及 `templates/commands/review-plan.md`、`templates/commands/review-code.md`。
