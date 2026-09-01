## Purpose

允许用户为 apply 实施步骤指定独立的 AI 后端（Codex/Hermes/OpenClaw）作为 Implementer agent，让 Claude 只承担总指挥角色（判断、验收、提交），不再亲自实施代码。

## ADDED Requirements

### Requirement: init 可选择实施后端（codex/hermes/openclaw，必选）
`npx ly-workflow init` 的交互式向导必须（SHALL）在"选择审查模型"步骤之后新增"选择实施后端"步骤，提供 `codex`/`hermes`（默认）/`openclaw` 三个选项供用户选择；选择结果持久化为 `routing.implementer`（有效值为这三个之一）。该配置项必选，不提供"不委托/维持现状"的选项。后续 `/ly:apply` 必须（SHALL）使用该值作为实施后端。

#### Scenario: 默认后端为 hermes
- **WHEN** 用户运行 `npx ly-workflow init` 且不修改"选择实施后端"步骤
- **THEN** `routing.implementer` 保持默认值 `hermes`，`/ly:apply` 以 `--backend hermes` 委托实施

#### Scenario: 用户选择 codex 作为实施后端
- **WHEN** 用户在 init 的"选择实施后端"步骤选择 `codex`
- **THEN** `routing.implementer` 为 `codex`，后续 `/ly:apply` 以 `--backend codex` 委托实施

#### Scenario: 用户选择 openclaw 作为实施后端
- **WHEN** 用户在 init 的"选择实施后端"步骤选择 `openclaw`
- **THEN** `routing.implementer` 为 `openclaw`，后续 `/ly:apply` 以 `--backend openclaw` 委托实施

### Requirement: 非交互升级路径静默补齐 routing.implementer
`npx ly-workflow update`（内部以 `init --force --skip-mcp --skip-prompt` 执行）检测到既有配置缺失 `routing.implementer` 时，必须（SHALL）静默写入默认值 `hermes`，不得中断升级流程、不得要求交互输入。

#### Scenario: 老项目升级时静默补齐
- **WHEN** 用户在未配置过 `routing.implementer` 的老项目运行 `npx ly-workflow update`
- **THEN** 升级流程不报错、不等待交互输入，自动写入 `routing.implementer: hermes`

### Requirement: routing.implementer 与 routing.reviewer 相同时给出独立性提示
`npx ly-workflow init` 的交互式向导在用户完成"选择实施后端"步骤后，若发现 `routing.implementer` 与 `routing.reviewer` 取值相同，必须（SHALL）提示"审查独立性会降低，建议选不同的 backend"；该提示不得阻断流程，用户确认后继续。

#### Scenario: 两者选择相同 backend 时给出提示但不阻断
- **WHEN** 用户先选择 `routing.reviewer=codex`，随后在"选择实施后端"步骤也选择 `codex`
- **THEN** 向导展示独立性下降的提示，但仍允许流程继续、写入该配置

### Requirement: /ly:apply 委托 Implementer agent 单次 agentic 实施
`/ly:apply` 必须（SHALL）在确定目标 change 名后，读取 `routing.implementer`，通过 `codeagent-wrapper --backend <routing.implementer>` 发起一次 agentic 调用（`ROLE_FILE` 指向该 backend 的 `builder.md`），委托其自主阅读 `tasks.md` 并实施全部未完成任务。SHALL NOT 逐任务拆分调用，SHALL NOT 由 Claude 自己使用 Edit/Write 工具实施代码。

#### Scenario: apply 委托实施后单次调用获取 Execution Report
- **WHEN** 用户运行 `/ly:apply`，`routing.implementer` 为 `codex`
- **THEN** 命令以 `--backend codex` 发起单次调用，等待其自主完成 `tasks.md` 中全部任务后返回 Execution Report，不在过程中拆分成多次调用

### Requirement: Execution Report 判定 PASS 后沿用现有 commit 步骤
当 Implementer agent 返回的 Execution Report 中 `OVERALL: PASS` 时，`/ly:apply` 必须（SHALL）沿用现有的暂存与提交步骤（`git add` 本次实际改动的文件后 `git commit -m "apply: <change-name>"`），行为与此前 Claude 自行实施时一致。

#### Scenario: PASS 后正常提交
- **WHEN** Implementer agent 返回的 Execution Report 显示 `OVERALL: PASS`
- **THEN** 命令暂存本次实施产生的文件变动并提交 `apply: <change-name>`，作为 `/ly:review-code` 的审查对象

### Requirement: Execution Report 判定 FAIL 或调用失败时原样呈报，不重试不兜底
当 Implementer agent 返回的 Execution Report 中 `OVERALL: FAIL`，或 wrapper 调用本身超时/非零退出/返回空响应时，`/ly:apply` 必须（SHALL）原样呈报失败详情给用户，SHALL NOT 自动重试同一次调用，SHALL NOT 自动切回由 Claude 自己实施，SHALL NOT 执行任何提交。

#### Scenario: 实施失败时原样呈报并停止
- **WHEN** Implementer agent 返回的 Execution Report 显示 `OVERALL: FAIL`
- **THEN** 命令展示该报告的失败详情，不进行第二次调用，不切换到 Claude 自行实施，不执行 git commit，等待用户决定后续处理

#### Scenario: wrapper 调用超时视为失败
- **WHEN** 委托 Implementer agent 的 wrapper 调用超时
- **THEN** 命令按上一条件处理：报告超时详情，不重试不兜底，不执行 commit

### Requirement: 实施后端二进制缺失时如实报错
当 `routing.implementer` 对应的 CLI 二进制不存在于 PATH 时，`/ly:apply` 必须（SHALL）明确报告该后端缺失并结束，不得静默切换到其他后端，也不得静默切回 Claude 自行实施。

#### Scenario: 实施后端二进制缺失
- **WHEN** `routing.implementer` 为 `openclaw` 但执行环境中不存在 `openclaw` 命令
- **THEN** `/ly:apply` 报告"实施后端 openclaw 二进制缺失"并结束，不静默改用其他后端或退回 Claude 自行实施
