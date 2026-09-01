# optional-review-agent Specification

## Purpose
允许用户为审查关卡指定不同的 AI 后端（Codex/Claude/Hermes/OpenClaw）作为审查 agent，并让单个审查-修复循环的多个轮次复用同一 agent 会话，从而保留轮间记忆。
## Requirements
### Requirement: init 可选择审查后端（codex/hermes/openclaw，不含 claude）
`npx ly-workflow init` 的"选择审查模型"步骤必须（SHALL）提供 `codex`（默认）/`hermes`/`openclaw` 三个选项供用户选择；选择结果持久化为 `routing.reviewer`（有效值为这三个之一）。后续 `/ly:review-code`/`/ly:review-plan` 必须（SHALL）使用该值作为审查后端。若用户未显式修改, 默认必须是 `codex`（与现有行为一致）。`claude` 不再是合法的可选值——Claude（当前交互会话）已经是流程的总指挥，不应再被选为被调度的审查 backend。

#### Scenario: 默认后端为 codex
- **WHEN** 用户运行 `npx ly-workflow init` 且不修改"选择审查模型"步骤
- **THEN** `routing.reviewer` 保持默认值 `codex`, `/ly:review-code`/`/ly:review-plan` 以 `--backend codex` 运行

#### Scenario: 用户选择 hermes 作为审查后端
- **WHEN** 用户在 init 的"选择审查模型"步骤选择 `hermes`
- **THEN** `routing.reviewer` 为 `hermes`, 后续审查调用走 `--backend hermes`, wrapper 以 hermes 的 one-shot 模式执行

#### Scenario: 用户选择 openclaw 作为审查后端
- **WHEN** 用户在 init 的"选择审查模型"步骤选择 `openclaw`
- **THEN** `routing.reviewer` 为 `openclaw`, 后续审查调用走 `--backend openclaw`（embedded/local 模式）, 不要求启动 gateway

#### Scenario: 存量配置为 claude 时交互式向导要求重新选择
- **WHEN** 用户在 `routing.reviewer` 历史值为 `claude` 的项目中运行交互式 `npx ly-workflow init`
- **THEN** "选择审查模型"步骤不再展示 `claude` 选项，也不把它作为预选默认值，用户必须从 `codex`/`hermes`/`openclaw` 中重新选择

#### Scenario: 存量配置为 claude 时非交互升级路径静默重置
- **WHEN** 用户在 `routing.reviewer` 历史值为 `claude` 的项目中运行非交互 `npx ly-workflow update`
- **THEN** 升级流程静默将 `routing.reviewer` 重置为默认值 `codex`, 并在汇总中提示"检测到已移除的 claude 选项, 已重置为默认值", 不中断升级、不要求交互输入

### Requirement: 可选后端二进制缺失时如实报错
当审查后端对应的 CLI 二进制不存在于 PATH 时, `/ly:review-code`/`/ly:review-plan` 必须（SHALL）明确报告该后端缺失并结束, 不得静默降级到其他后端, 也不得产出空审查结论。

#### Scenario: 后端二进制缺失时如实报错
- **WHEN** `routing.reviewer` 为 `hermes` 但执行环境中不存在 `hermes` 命令
- **THEN** 审查调用失败, 命令如实报告"后端 hermes 二进制缺失", 不静默改回 codex, 不产出空审查结论

#### Scenario: 默认后端 codex 不受影响
- **WHEN** `routing.reviewer` 保持默认值 `codex` 且环境中存在 `codex` 命令
- **THEN** 审查正常以 `--backend codex` 执行, 不触发缺失/降级逻辑

### Requirement: 审查循环轮间续聊（同一流程内复用）
`/ly:review-code`/`/ly:review-plan` 的审查-修复循环必须（SHALL）复用同一 agent 会话：首轮调用 wrapper 后记录返回的 session_id, 第 2 轮及后续轮次必须（SHALL）以 resume 模式把该 session_id 传回, 使审查 agent 保留轮间记忆（上一轮给出的 Critical、已做的修改、当时的判断依据）。跨轮复用仅限**同一流程内**——单个 `/ly:review-code` 或 `/ly:review-plan` 命令运行期间的多轮属同一流程；`review-code` 与 `review-plan` 是两个不同命令（两个独立流程）, 不共享会话; 也不跨项目/跨命令复用。循环结束后, 最终报告中必须（SHALL）展示该流程使用的 session_id。若首轮未能取得 session_id（后端/解析未提供）, 后续轮次退化为独立调用（无续聊）, 报告中如实说明未取得 session_id。

#### Scenario: 循环第 2 轮续聊同一会话
- **WHEN** `/ly:review-code` 第一轮结束, wrapper 返回了 session_id, 而第一轮存在未清零的 Critical, 循环进入第二轮
- **THEN** 第二轮以 resume 模式传回该 session_id 调用 wrapper——同一 agent 会话能读到第一轮上下文, 而非作为全新会话开始

#### Scenario: 两种命令各自独立会话
- **WHEN** 用户对同一 change 先运行 `/ly:review-plan`（得到 session A）, 再运行 `/ly:review-code`（得到 session B）
- **THEN** session A 与 session B 互不关联；`review-code` 的循环不使用 `review-plan` 留下的会话, 反之亦然

#### Scenario: 未取得 session_id 时退化为独立调用
- **WHEN** 首轮 wrapper 返回结果中不包含可解析的 session_id（例如后端模式不返回会话标识）
- **THEN** 后续轮次以独立调用（非 resume）进行, 报告中如实说明"未取得 session_id, 未启用轮间续聊"

### Requirement: parser 对非 JSON 输出的纯文本兜底收集
当审查后端输出无法解析为 codex/claude 风格的逐行 JSON 事件时（例如 hermes `-z` 输出纯文本 stdout、或 openclaw `--json` 的多行 JSON blob 无法逐行映射到 backend 事件）, wrapper 的 parser 必须（SHALL）将非 JSON 行收集为 message, 而不是静默丢弃。仅当没有任何 JSON 事件产出 message **且**没有收集到任何非空文本行时, 结果才视为空（message 为空）。

#### Scenario: hermes 纯文本输出被收集为 message
- **WHEN** 审查后端为 hermes, wrapper 以 `-z <task>` 调用, stdout 输出多行纯文本（非 JSON）
- **THEN** parser 把全部非空行拼接为该轮 message, 审查结论可被命令层正常解析

#### Scenario: openclaw 多行 JSON blob 提取出 payload 文本
- **WHEN** 审查后端为 openclaw, `--json` 输出为缩进的多行 JSON blob（含 `payloads[].text` 与 `meta.agentMeta.sessionId`）
- **THEN** parser 从 blob 中提取 `payloads[].text` 拼接为 message, 并返回 sessionId 作为 session_id（供轮间续聊使用）, 而非把整段原始 JSON 当作 message 原样透传

#### Scenario: 合法 JSON 但非后端事件不误收为 message
- **WHEN** stdout 含 `{"item":null}` 或 `{}` 这类合法 JSON 但无法识别为 codex/claude/openclaw 事件的空行
- **THEN** 该行不进入 plainText 收集, 不作为 message 内容; 已有 codex/claude 事件的 message 提取逻辑不受影响

#### Scenario: 纯文本与 JSON 事件并存时 JSON 优先
- **WHEN** stdout 同时包含 codex 风格 JSON 事件与少量非 JSON 噪声行
- **THEN** message 取 JSON 事件的文本, 非 JSON 噪声行不被拼入（既有 codex/claude 分支行为不变）

