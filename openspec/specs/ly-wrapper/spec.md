## Purpose

提供 TS 版 wrapper（ly-wrapper）的行为契约：作为审查关卡（review-plan/review-code）与外部实施委托（apply 非 claude 模式）调用外部 AI CLI 后端（codex/claude/hermes/openclaw）的稳定封装。它将"调用一个外部 AI CLI"收敛为统一的单任务调用约定——stdin 传 prompt、流式输出转发、最终报告与 SESSION_ID 解析、resume 续聊、超时 kill——使上层命令模板只需约定调用方式，无需感知各后端 CLI 的参数与输出差异。替代原 Go 版 codeagent-wrapper（仅保留其单任务路径，抛弃并发调度/SSE server/logger 等上游多模型引擎遗产），随 npm 包以单文件脚本分发。

## Requirements

### Requirement: ly-wrapper 以单任务模式调用后端
ly-wrapper 必须（SHALL）支持与原 codeagent-wrapper 等价的单任务调用形态：`ly-wrapper [--progress] --backend <backend> - "<WORKDIR>"`，任务文本（含 `ROLE_FILE:` 行）从 stdin 读入；`-` 表示"任务来自 stdin"而非文件参数。ly-wrapper SHALL 以 agentic 方式让后端在 WORKDIR 下自主执行命令与读取文件。ly-wrapper SHALL NOT 支持多任务并发调度、任务拓扑排序等旧多模型引擎形态——调用面只有单任务。

#### Scenario: 单任务调用形态与原 wrapper 等价
- **WHEN** 命令模板以 `ly-wrapper --progress --backend codex - "$WORKDIR" <<'EOF' ... EOF` 的形态发起调用
- **THEN** ly-wrapper 从 stdin 读入完整任务文本（含 ROLE_FILE 行），以 codex 为后端在 WORKDIR 下发起单次 agentic 调用

#### Scenario: 不支持并发任务形态
- **WHEN** 调用方传入旧 Go wrapper 的多任务/并发调度类参数
- **THEN** ly-wrapper 报告该调用形态不受支持并以非零状态退出，不静默忽略

### Requirement: 四 backend 的参数构造与流式输出转发
ly-wrapper 必须（SHALL）为 codex、claude、hermes、openclaw 四个后端构造各自 CLI 的调用参数（codex exec、claude、hermes -z 一次性/`-r` 续聊、openclaw agent --local 等），并将后端进程的输出流式转发到自身 stdout（`--progress` 时同步呈现进度）。hermes 后端的一次性模式 SHALL 将 stdin 中的任务文本提升为 argv 参数（hermes 的 `-z` 不接受 stdin 标记）。

#### Scenario: codex 后端调用
- **WHEN** 以 `--backend codex` 发起调用
- **THEN** ly-wrapper 拼接 codex CLI 的 agentic/JSON 输出参数并启动进程，输出流式转发到 stdout

#### Scenario: hermes 后端任务文本提升为参数
- **WHEN** 以 `--backend hermes` 一次性模式调用且任务文本来自 stdin
- **THEN** 任务文本被提升为 hermes CLI 的 argv 参数（而非 stdin 标记），调用正常返回最终回复

#### Scenario: 后端输出流式转发
- **WHEN** 后端进程持续输出
- **THEN** ly-wrapper 将输出实时转发，调用方在长审查期间能看到进度而非长时间静默

### Requirement: 输出解析提取最终报告与 SESSION_ID
ly-wrapper 必须（SHALL）从后端输出中解析出：（1）最终报告正文（剔除 JSON 事件包装与非内容行）；（2）后端会话 SESSION_ID（供 resume 续聊）；（3）当任务为实施类委托时的 `OVERALL: PASS`/`OVERALL: FAIL` 判定。解析必须（SHALL）包含纯文本兜底：非 JSON 行收集为 message、openclaw 多行 JSON blob 提取 `payloads[].text`/`sessionId`、未知 JSON 事件（如 `{"item":null}`）不误收为 message。

#### Scenario: JSON 事件流中提取最终报告与 session_id
- **WHEN** codex 后端输出 JSON 事件流并最终给出报告文本
- **THEN** ly-wrapper 输出最终报告正文与 SESSION_ID 两个要素

#### Scenario: hermes 纯文本输出兜底
- **WHEN** hermes 后端输出纯文本（无 JSON 事件）
- **THEN** 纯文本被收集为 message 作为最终报告，调用不因解析失败而报错

#### Scenario: 未知 JSON 事件不误收
- **WHEN** 输出流中出现无法归类为后端事件的 JSON 行（如 `{"item":null}`）
- **THEN** 该行不被当作 message 收入最终报告

### Requirement: resume 续聊模式
ly-wrapper 必须（SHALL）支持 resume 调用形态：`ly-wrapper --backend <backend> resume <session_id> - "<WORKDIR>"`，以传入的 session_id 延续后端的既有会话上下文。未取得 session_id 时由调用方退化为独立调用，ly-wrapper 不做自动续聊兜底。

#### Scenario: 第 2 轮审查续聊同一会话
- **WHEN** 审查循环第 2 轮以 `ly-wrapper --backend codex resume <session_id> - "$WORKDIR"` 调用
- **THEN** 后端在同一会话上下文中继续复审，而非另起全新会话

#### Scenario: resume 参数缺失时如实报错
- **WHEN** 以 resume 形态调用但未提供 session_id
- **THEN** ly-wrapper 报告参数缺失并以非零状态退出，不静默降级为独立调用

### Requirement: 超时与非零退出的进程管理
ly-wrapper 必须（SHALL）对后端进程实施超时控制：超过配置的超时时间未结束时 kill 进程树并以明确的超时语义退出（非零状态）；后端进程以非零状态退出时 ly-wrapper 如实转发退出状态与已收集的输出，SHALL NOT 将失败伪装成空报告。

#### Scenario: 后端超时被 kill
- **WHEN** 后端进程超过配置的超时时间未返回
- **THEN** ly-wrapper kill 后端进程并退出，输出中明确体现超时

#### Scenario: 后端非零退出
- **WHEN** 后端进程以非零状态退出
- **THEN** ly-wrapper 以非零状态退出并保留已收集的输出，不产出看似正常的空报告

### Requirement: 后端二进制缺失时如实报错
指定的后端 CLI 不存在于 PATH 时，ly-wrapper 必须（SHALL）明确报告该后端缺失并以非零状态退出，SHALL NOT 静默切换到其他后端。

#### Scenario: hermes 未安装
- **WHEN** 以 `--backend hermes` 调用但 `hermes` 不在 PATH
- **THEN** ly-wrapper 报告"后端 hermes 二进制缺失"并以非零状态退出，不回退到 codex

### Requirement: ly-wrapper 随 npm 包分发安装
ly-wrapper 必须（SHALL）作为 npm 包构建产物（单文件 JS，node shebang 可直接执行）随包分发；安装时复制到 `~/.claude/bin/ly-wrapper`。SHALL NOT 存在 Go 二进制的 GitHub Release 下载、版本门禁（EXPECTED_BINARY_VERSION 比对）或多源 fallback——分发途径只有 npm 包本身。

#### Scenario: 安装后可直接执行
- **WHEN** 运行 `npx ly-workflow` 完成安装
- **THEN** `~/.claude/bin/ly-wrapper` 存在且可直接以 `~/.claude/bin/ly-wrapper --backend codex ...` 形态执行（无需额外编译或下载）

#### Scenario: 版本随 npm 包一致
- **WHEN** 用户升级 ly-workflow npm 包
- **THEN** 下一次安装/update 后 `~/.claude/bin/ly-wrapper` 的行为与新包版本一致，不存在 CDN/Release 滞留旧版本的问题
