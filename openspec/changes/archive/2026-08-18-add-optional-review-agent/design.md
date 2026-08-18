## Context

审查后端写死 Codex 的现状与断线问题见 proposal.md（`--backend codex` 硬编码、`{{REVIEWER_MODEL}}` 占位符未进命令模板、循环不传 session）。本 design 只解决"审查后端可配置 + wrapper 支持外部 CLI + 循环轮间续聊"的落地方式，不涉及 propose/apply/archive/worktree 的流程编排。

技术基础：

- `codeagent-wrapper`（Go）的 `Backend` 接口 = `Name()/Command()/BuildArgs()`；`config.go` 的 `backendRegistry` map 注册；`main.go` 的 `--backend` 解析 + `resume <session_id> <task>` 模式已存在。
- `parseJSONStreamInternal`（parser.go）按"字段探测"自动识别 codex/claude 事件（`thread_id`/`turn.*`/`item` → codex；`subtype`/`result` → claude），其余行静默忽略。
- `src/utils/installer-template.ts` 的 `{{REVIEWER_MODEL}}`/`{{LITE_MODE_FLAG}}` 注入在安装时发生于 `src/utils/installer.ts`（202 行 / 236 行 / 557 行等），数据来自 `routing.reviewer`。
- review-code/review-plan 模板的 wrapper 调用行硬编码 `--backend codex`；循环由 Claude 会话驱动（命令文件是 .md 指令而非编译程序），"每轮"即 Claude 重新读取命令文件执行指令。
- init 向导的"选择模型"步骤在 `src/commands/init.ts` 的 `runModelStep`（choices 数组 382-384 行）。

## Goals / Non-Goals

**Goals:**
- 审查后端可配置为 codex/claude/hermes/openclaw，init 选择真正生效（修断线）。
- wrapper 以最小改动支持 hermes/openclaw 两个外部 CLI backend + "非 JSON 行收集为 message" 的通用兜底，不再静默丢弃未知格式输出。
- review 循环第 2 轮起以 resume 复用首轮 session_id，同一流程内轮间续聊。

**Non-Goals:**
- 不实现跨流程/跨命令/跨项目复用会话（仅同一命令运行期间多轮复用）。
- 不做 wrapper 的通用"任意 executable 后端"声明式扩展（Bench 改为"每后端一个 struct"，不引入配置化 registry 抽象）。
- 不修改 Critical/终止/提交语义本身；不改 propose/apply/archive/worktree 编排。
- 不做 hermes/openclaw 的流式事件解析（其 CLI 本身不输出 codex/claude 式 JSON 流，纯文本/单次 JSON 足够审查用途）。

## Decisions

### D1. 后端枚举: `codex | claude | hermes | openclaw`
`ModelType` 从 `'codex' | 'claude'` 扩为四值联合；init 向导 choices 加两项。`claude` 即现有的 ClaudeBackend（本就走 `-p --reasoning-effort high` 无头模式），不做额外结构；`hermes`/`openclaw` 走新 struct。

- **备选（否决）**：给 hermes/openclaw 做"通用 extern 后端声明"（executable+args 模板的配置条目）——灵活性高但引入新抽象层，与"两个明确后端"的需求不符，且 wrapper 的 CLI 形态（`--backend <name>`）天然是枚举而非配置。

### D2. HermesBackend: `hermes -z`（one-shot，纯文本 stdout）
`Command()` = `hermes`；`BuildArgs` 生成 `-z <task>`（one-shot：单条 prompt，输出仅最终文本到 stdout，无 banner/spinner）。工作目录经 `cmd.Dir` 注入（复用 claude 路径）。续聊用 `-r <session_id>`（resume by ID）。

- **备选（否决）**：`hermes chat --input` 交互通道——无头审查不需要交互，`-z` 更契合 wrapper 的"一次调用一次结果"。

### D3. OpenClawBackend: `openclaw agent --local -m <task>`
`Command()` = `openclaw`；`BuildArgs` 生成 `agent --local -m <task> --json`（embedded 本地运行、stdout JSON 结构化、不需要 gateway）。续聊用 `--session-id <id>`。`--local` 要求 shell 内有 provider API key（openclaw 官方语义：embedded 本地 agent）。

- **备选（否决）**：走 gateway（不带 `--local`）——依赖常驻 gateway 进程，审查 CLI 不该要求后台服务；`--local` 单进程即可。

### D4. parser 加"原生文本兜底"分支
在"未知格式 → continue"之前，按行判断：若该行不是合法 JSON（`json.Unmarshal` 失败），且当前 backend 是"原生文本类"（hermes）或行内容非空，则 append 进 message。同时修一个现存 bug：当前未知格式静默丢弃 → 调用方拿空 message 不报错。实现上不破坏 codex/claude 分支（它们仍是 JSON 流优先）。

- **备选（否决）**：为 hermes 单独写"整段 stdout 截取"——本质上就是兜底分支，不需要单独解析器。
- **风险**：hermes stdout 里可能混有非审查内容（如 stderr 被合并、日志行）。缓解：优先收集"引用审查格式且非空"的文本块，报告里如实展示原始输出片段，由 Claude 判断。

### D5. 循环轮间续聊: 命令层记录 session_id 并 resume
命令文件（.md）本身是 Claude 的指令，wrapper 返回 `(message, session_id)`。review-code/review-plan 的命令指令改为：
- 首轮：normal 调用（`new`）；wrapper 输出的 session_id 由 Claude 记录进本轮报告/工作目录的临时状态。
- 第 2 轮起：`codeagent-wrapper resume <session_id> <task>`（wrapper 已支持 resume 模式，四后端各自 `BuildArgs` 在该模式下产生对应续聊标志）。
- 未取得 session_id → 退化为独立调用，报告如实说明。
- session_id 的来源：codex（`thread_id`）、claude（`session_id` 字段）、hermes（`-z` 输出/`-r` 目标）、openclaw（`--json` 里的 session 标识）——wrapper 的 resume 语义对每后端解析一次即可。

- **备选（否决）**：在 wrapper 内做"自动 resume"状态机（wrapper 自己跟踪 session 并续接）——wrapper 是无状态 CLI，会话生命周期应由调用方（命令层）持有；且无法处理"用户中断/重启 wrapper 进程"的情况。

### D6. 命令模板接线: `--backend {{REVIEWER_MODEL}}`
review-code.md/review-plan.md 的 wrapper 调用行 `--backend codex` 改为 `--backend {{REVIEWER_MODEL}}`（注入机制与 `{{LITE_MODE_FLAG}}` 相同，`injectConfigVariables` 已有 reviewer 注入）。即"修断线"的真正落点——模板变量注入在安装时决定实际 backend。

- **备选（否决）**：命令模板运行时读配置文件——命令 .md 是静态指令，注入变量是现有唯一机制，不引入新的运行时文件读取协议。

## Risks / Trade-offs

- **[外部 CLI 行为不可控(hermes/openclaw 格式/退出行为可能随版本变化)] → 后端缺失时 wrapper 明确报错转人工，不静默降级；报告展示原始输出片段便于定位；wrapper 冒烟测试覆盖基本调用形态。**
- **[hermes `-z` 的 stdout 可能混入非审查日志 → parser 兜底分支优先收集引用审查格式的文本块，报告如实展示原始输出，由 Claude 判定哪些是有效审查结论。]**
- **[openclaw `--session-id` 过期可能静默降级为新会话 → 循环报告展示实际使用的 session_id，若某轮结果异常（比如空结果）按"审查调用失败"终止条件处理。]**
- **[格式契约依赖后端配合(session_id 来源每个后端不同) → wrapper 解析层按后端各自提取；提取不到则不启用续聊，报告如实说明。]**
- **[命令 .md 是静态模板,新后端的行为细节难在模板内做分支 → 与后端相关的调用形态(flag、resume)收敛进 wrapper 的 BuildArgs,模板只写 `--backend {{REVIEWER_MODEL}}`,后端差异不进命令模板。]**
- **[既有用户升级后,`{{REVIEWER_MODEL}}` 注入的默认值是 codex,命令模板若已按旧版安装(写死 codex)会继续用 codex——安装/更新覆盖模板时注入生效;不强制全量重装。]**

## Migration Plan

1. **wrapper 侧先行**（可独立验证）：registry 注册 hermes/openclaw → `--backend <name>` 可解析；parser 加文本兜底；go test 全绿。
2. **命令模板接线**：review-*.md 的调用行改为 `{{REVIEWER_MODEL}}`；`templates/CLAUDE.md` 的占位符说明同步更新。
3. **init 向导**：`runModelStep` choices 加两项；`ModelType` 扩四个值；持久化不变（`routing.reviewer`）。
4. **循环续聊接入命令指令**：review-*.md 增加"首轮记录 session_id → 第 2 轮 resume"指令段。
5. **回滚**：若某后端在真实使用中不可靠，单点回退为 `routing.reviewer = codex`（或改回 `--backend codex`），不影响其他流程。

## Open Questions

无（specs/design 已冻结，任务分解见 tasks.md）。