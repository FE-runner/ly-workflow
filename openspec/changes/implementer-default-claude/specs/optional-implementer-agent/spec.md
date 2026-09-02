## ADDED Requirements

### Requirement: claude 实施模式下 /ly:apply 由编排者本人实施
当 `routing.implementer` 为 `claude` 时，`/ly:apply` 必须（SHALL）由当前会话的 Claude 本人直接实施：阅读目标 change 的 `tasks.md`，逐任务实施、按任务指定的验证方式验证、将已完成任务的 checkbox 勾选，随后沿用现有暂存与提交步骤（`git add` 本次实际改动文件后 `git commit -m "apply: <change-name>"`）。该模式下 MUST NOT 发起 `codeagent-wrapper` 调用，MUST NOT 产生或解析 `OVERALL: PASS/FAIL` Execution Report，MUST NOT 应用"FAIL 不重试不切回"或"半成品转人工"等外部委托失败处理分支。

#### Scenario: claude 模式下 apply 本人实施并提交
- **WHEN** 用户运行 `/ly:apply`，`routing.implementer` 为 `claude`
- **THEN** 当前会话的 Claude 直接读取 tasks.md 并逐任务实施、验证、勾选 checkbox，完成后暂存改动并提交 `apply: <change-name>`，全程不调用 codeagent-wrapper

#### Scenario: claude 模式下实施中断不产生委托失败语义
- **WHEN** claude 模式下实施过程因外部原因（如用户中断）未完成全部任务
- **THEN** 命令如实报告已完成/未完成的任务清单，不执行 commit，不存在"委托失败转人工"的报告形态

## RENAMED Requirements

### Requirement: init 可选择实施后端（codex/hermes/openclaw，必选）
- **FROM**: init 可选择实施后端（codex/hermes/openclaw，必选）
- **TO**: init 可选择实施后端（claude 默认，四选一）

## MODIFIED Requirements

### Requirement: init 可选择实施后端（claude 默认，四选一）
`npx ly-workflow init` 的交互式向导必须（SHALL）在"选择审查模型"步骤之后新增"选择实施后端"步骤，提供 `claude`（默认）/`codex`/`hermes`/`openclaw` 四个选项供用户选择；选择结果持久化为 `routing.implementer`（有效值为这四个之一）。该配置项必选，不提供"不配置"的选项。后续 `/ly:apply` 必须（SHALL）按该值路由实施方式：`claude` 为编排者本人实施，其余三个为委托外部 agent 实施。

#### Scenario: 默认后端为 claude
- **WHEN** 用户运行 `npx ly-workflow init` 且不修改"选择实施后端"步骤
- **THEN** `routing.implementer` 保持默认值 `claude`，后续 `/ly:apply` 由编排者本人实施

#### Scenario: 用户选择 codex 作为实施后端
- **WHEN** 用户在 init 的"选择实施后端"步骤选择 `codex`
- **THEN** `routing.implementer` 为 `codex`，后续 `/ly:apply` 以 `--backend codex` 委托实施

#### Scenario: 用户选择 hermes 作为实施后端
- **WHEN** 用户在 init 的"选择实施后端"步骤选择 `hermes`
- **THEN** `routing.implementer` 为 `hermes`，后续 `/ly:apply` 以 `--backend hermes` 委托实施

#### Scenario: 用户选择 openclaw 作为实施后端
- **WHEN** 用户在 init 的"选择实施后端"步骤选择 `openclaw`
- **THEN** `routing.implementer` 为 `openclaw`，后续 `/ly:apply` 以 `--backend openclaw` 委托实施

### Requirement: 非交互升级路径静默补齐 routing.implementer
`npx ly-workflow update`（内部以 `init --force --skip-mcp --skip-prompt` 执行）检测到既有配置缺失 `routing.implementer` 时，必须（SHALL）静默写入默认值 `claude`，不得中断升级流程、不得要求交互输入。已存在合法 `routing.implementer` 值（含历史遗留的 `hermes`）的存量配置 MUST NOT 被改写。

#### Scenario: 老项目升级时静默补齐
- **WHEN** 用户在未配置过 `routing.implementer` 的老项目运行 `npx ly-workflow update`
- **THEN** 升级流程不报错、不等待交互输入，自动写入 `routing.implementer: claude`

#### Scenario: 存量配置不被改写
- **WHEN** 用户在已配置 `routing.implementer: hermes` 的项目运行 `npx ly-workflow update`
- **THEN** 该值保持 `hermes` 不变，不被静默替换为 `claude`

### Requirement: /ly:apply 委托 Implementer agent 单次 agentic 实施
当 `routing.implementer` 为 `codex`/`hermes`/`openclaw` 之一时，`/ly:apply` 必须（SHALL）在确定目标 change 名后，读取 `routing.implementer`，通过 `codeagent-wrapper --backend <routing.implementer>` 发起一次 agentic 调用（`ROLE_FILE` 指向该 backend 的 `builder.md`），委托其自主阅读 `tasks.md` 并实施全部未完成任务。SHALL NOT 逐任务拆分调用，SHALL NOT 在委托路径中改由 Claude 自己实施。

#### Scenario: apply 委托实施后单次调用获取 Execution Report
- **WHEN** 用户运行 `/ly:apply`，`routing.implementer` 为 `codex`
- **THEN** 命令以 `--backend codex` 发起单次调用，等待其自主完成 `tasks.md` 中全部任务后返回 Execution Report，不在过程中拆分成多次调用

### Requirement: Execution Report 判定 PASS 后沿用现有 commit 步骤
当 `routing.implementer` 非 `claude` 且 Implementer agent 返回的 Execution Report 中 `OVERALL: PASS` 时，`/ly:apply` 必须（SHALL）沿用现有的暂存与提交步骤（`git add` 本次实际改动的文件后 `git commit -m "apply: <change-name>"`），行为与 Claude 本人实施时的提交步骤一致。

#### Scenario: PASS 后正常提交
- **WHEN** Implementer agent 返回的 Execution Report 显示 `OVERALL: PASS`
- **THEN** 命令暂存本次实施产生的文件变动并提交 `apply: <change-name>`，作为 `/ly:review-code` 的审查对象

### Requirement: Execution Report 判定 FAIL 或调用失败时原样呈报，不重试不兜底
当 `routing.implementer` 为 `codex`/`hermes`/`openclaw` 之一，且 Implementer agent 返回的 Execution Report 中 `OVERALL: FAIL`，或 wrapper 调用本身超时/非零退出/返回空响应时，`/ly:apply` 必须（SHALL）原样呈报失败详情给用户，SHALL NOT 自动重试同一次调用，SHALL NOT 自动切换到其他外部后端，SHALL NOT 执行任何提交。`routing.implementer` 为 `claude` 时本条不适用（不存在 wrapper 调用与 Execution Report 语义，见"claude 实施模式下 /ly:apply 由编排者本人实施"）。

#### Scenario: 实施失败时原样呈报并停止
- **WHEN** `routing.implementer` 为 `codex` 时 Implementer agent 返回的 Execution Report 显示 `OVERALL: FAIL`
- **THEN** 命令展示该报告的失败详情，不进行第二次调用，不切换到其他后端，不执行 git commit，等待用户决定后续处理

#### Scenario: wrapper 调用超时视为失败
- **WHEN** 委托 Implementer agent 的 wrapper 调用超时
- **THEN** 命令按上一条件处理：报告超时详情，不重试不兜底，不执行 commit

#### Scenario: claude 模式不适用 FAIL 处理
- **WHEN** `routing.implementer` 为 `claude`
- **THEN** 本条的 FAIL 呈报/不重试语义不参与 `/ly:apply` 流程，实施中断按"编排者本人实施"条目的中断语义处理

### Requirement: 实施后端二进制缺失时如实报错
当 `routing.implementer` 为 `codex`/`hermes`/`openclaw` 之一且对应 CLI 二进制不存在于 PATH 时，`/ly:apply` 必须（SHALL）明确报告该后端缺失并结束，不得静默切换到其他后端。`routing.implementer` 为 `claude` 时不涉及外部 CLI 二进制，本条不适用。

#### Scenario: 实施后端二进制缺失
- **WHEN** `routing.implementer` 为 `openclaw` 但执行环境中不存在 `openclaw` 命令
- **THEN** `/ly:apply` 报告"实施后端 openclaw 二进制缺失"并结束，不静默改用其他后端

#### Scenario: claude 模式不涉及二进制检查
- **WHEN** `routing.implementer` 为 `claude`
- **THEN** `/ly:apply` 不做外部 CLI 二进制存在性检查，直接由编排者本人实施
