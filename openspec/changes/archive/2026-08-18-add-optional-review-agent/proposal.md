## Why

审查后端目前写死为 Codex：`/ly:review-code`/`/ly:review-plan` 的模板里硬编码 `--backend codex`，init 向导里 `{{REVIEWER_MODEL}}` 占位符选出的 Claude 根本没有被拼进命令模板——用户选 Claude 是失效的。同时两个审查循环每轮都裸调 wrapper `new` 模式，不传 session_id，即使 wrapper 支持 `resume` 也无法让审查 agent 记住轮间上下文（上一轮给的 Critical、改了什么、当时的判断）。这使得审查后端的灵活性、会话连续性与 agent 生态（Hermes/OpenClaw）完全不可用。

## What Changes

- **修复 REVIEWER_MODEL 断线**：让 init 时选择的审查后端真正生效——review-code/review-plan 命令模板里的 `--backend codex` 改为 `--backend {{REVIEWER_MODEL}}`（注入上下文由模板的 `injectConfigVariables` 驱动，与现有 `{{LITE_MODE_FLAG}}` 注入机制一致）。
- **init 向导扩展为四级可选**：`codex`（默认）/`claude`/`hermes`/`openclaw`——用户通过 `npx ly-workflow init` 的模型选择步骤指定审查后端，Claude（原生）与新增的 Hermes/OpenClaw 一起作为可选后端。
- **codeagent-wrapper 注册新后端**：新增 `HermesBackend` 与 `OpenClawBackend`，两者都接入现有 Backend 接口（`Name()/Command()/BuildArgs()`），`--backend hermes`/`--backend openclaw` 解析到对应命令（`hermes -z`/`openclaw agent --local`）。可选后端缺二进制时如实报错并转人工，不静默降级。
- **parser 纯文本兜底**：当前 parser 只识别 codex/claude 的 JSON 事件,其余格式（如 hermes `-z` 的纯文本 stdout）被静默丢弃,导致调用方拿到空 message 却不报错——新增"非 JSON 行收集为 message"的兜底分支,保证外部后端输出可达。
- **审查循环轮间续聊（同一流程内复用）**：`/ly:review-code`/`/ly:review-plan` 的审查-修复循环里,首轮 wrapper 返回的 session_id 记录在案,第 2 轮起以 `resume` 模式传回同一会话,让审查 agent 保留轮间记忆；循环结束后该 session_id 展示在报告中。一个流程（单次 review 命令运行期间）复用同一会话,不跨流程、不跨命令、不跨项目。
- **统一提交语义不变**：循环期间不提交,仅正常清零后统一提交一次（沿用现有行为）。

## Capabilities

### New Capabilities
- `optional-review-agent`: 审查后端可配置（codex/claude/hermes/openclaw），wrapper 支持外部 CLI agent，审查循环跨轮复用同一会话

### Modified Capabilities
- `ly-review-gates`: **BREAKING** 审查后端不再固定为 Codex，改为"init 选定的后端 + 轮间续聊"（命令调用方式从 `--backend codex` 变为 `--backend <选定的后端>`，循环第 2 轮起以 `resume` 延续会话）

## Impact

- **init 向导/配置**：`src/commands/init.ts` 的 `runModelStep` 选择项、`src/types/index.ts` 的 `ModelType` 类型、`src/utils/installer-template.ts` 的 `{{REVIEWER_MODEL}}` 注入
- **命令模板**：`templates/commands/review-code.md`/`review-plan.md` 的 wrapper 调用行
- **codeagent-wrapper**：`backend.go`（新增 backend struct）、`config.go`（registry 注册）、`parser.go`（纯文本兜底）、`main.go`（resume 语义/`--backend` 解析）——`version` bump（按仓库发版规则，Go 改动需同步 `EXPECTED_BINARY_VERSION`）
- **审查循环**：review-code/review-plan 的循环逻辑新增"记录首轮 session_id → 第 2 轮起 resume"行为，不改变 Critical/终止/提交语义
- **文档**：`templates/CLAUDE.md` 的 `{{REVIEWER_MODEL}}` 说明、`CHANGELOG.md`、根 `CLAUDE.md` 变更记录

**不涉及**：`/ly:propose`/`/ly:apply`/`/ly:archive`/`/ly:worktree` 的流程编排；`git` 工具命令；现有 spec 的 Critical/终止/提交规则本身（仅命令层行为变化）。