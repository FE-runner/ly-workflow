## 1. wrapper: 后端注册 + 解析兜底（Go）

- [x] 1.1 `codeagent-wrapper/backend.go` 新增 `HermesBackend`（`Command()` 返回 `hermes`；`BuildArgs` 在 new 模式生成 `-z <task>`、resume 模式生成 `-r <session_id> <task>`）
- [x] 1.2 `codeagent-wrapper/backend.go` 新增 `OpenClawBackend`（`Command()` 返回 `openclaw`；`BuildArgs` 在 new 模式生成 `agent --local -m <task> --json`、resume 模式生成 `agent --local --session-id <id> -m <task> --json`）
- [x] 1.3 `codeagent-wrapper/config.go` 的 `backendRegistry` 注册 `hermes`/`openclaw` 两个 backend
- [x] 1.4 `codeagent-wrapper/parser.go` 新增"非 JSON 行收集为 message"的文本兜底分支（unknown 格式不再静默丢弃；不影响 codex/claude 的 JSON 事件优先解析）
- [x] 1.5 新增/更新 backend 冒烟测试：`--backend hermes`/`--backend openclaw` 参数解析与 `BuildArgs` 输出、resume 模式标志生成、文本兜底分支（模拟纯文本 stdout 被收集为 message）
- [x] 1.6 运行 `cd codeagent-wrapper && go test -short ./...` 全绿；按仓库规则 bump `codeagent-wrapper/main.go` 的 `version` 与 `src/utils/installer.ts` 的 `EXPECTED_BINARY_VERSION`

## 2. 类型与配置: 四值联合

- [x] 2.1 `src/types/index.ts` 的 `ModelType` 扩为 `'codex' | 'claude' | 'hermes' | 'openclaw'`；`ModelRouting.reviewer` 注释同步
- [x] 2.2 `src/utils/installer-template.ts` 的 `injectConfigVariables` reviewer 默认值逻辑不变（仍默认 `codex`），确认 `{{REVIEWER_MODEL}}` 注入在四值下都能产出合法 backend 名

## 3. init 向导: 四个可选后端

- [x] 3.1 `src/commands/init.ts` 的 `runModelStep` choices 数组加 `Hermes`/`OpenClaw` 两项（保持 `Codex（推荐）` 默认与 `$ARGUMENTS` 传入透传）
- [x] 3.2 向导 `--reviewer` 透传分支（238 行附近）接受新值；`routing.reviewer` 持久化类型更新校验
- [x] 3.3 运行 `pnpm typecheck` 通过

## 4. 命令行审查 | 模板接线

- [x] 4.1 `templates/commands/review-code.md`、`review-plan.md` 的 `codeagent-wrapper` 调用行 `--backend codex` 改为 `--backend {{REVIEWER_MODEL}}`
- [x] 4.2 `templates/CLAUDE.md` 的 `{{REVIEWER_MODEL}}` 占位符说明更新为四个后端（codex 默认）

## 5. 审查循环轮间续聊

- [x] 5.1 `templates/commands/review-code.md` 加入"首轮记录 wrapper 返回的 session_id → 第 2 轮起以 `codeagent-wrapper resume <session_id> <task>` 调用（同一流程内复用）；未取得 session_id 则退化为独立调用并如实说明；最终报告展示 session_id"指令段
- [x] 5.2 `templates/commands/review-plan.md` 加入与 5.1 相同的轮间续聊指令段
- [x] 5.3 续聊指令与增量传递规则并存的说明（第 2 轮 TASK 仍只传上一轮 Critical 原文 + 路径清单，不因续聊而整段重传基线）

## 6. 测试与文档

- [x] 6.1 `pnpm typecheck && pnpm build && pnpm test` 全绿
- [x] 6.2 `CHANGELOG.md` 新增本次变更条目（顶部），根 `CLAUDE.md` 变更记录同步（Go 改动需按发版规则 bump 版本）
- [x] 6.3 端到端验证：以 `routing.reviewer = hermes`（或 openclaw）跑一次 `/ly:review-plan` 冒烟，确认 `--backend hermes` 被注入、wrapper 调用、第 2 轮 resume 续聊生效、报告含 session_id