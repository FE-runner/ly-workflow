## MODIFIED Requirements

### Requirement: /ly:apply 委托 Implementer agent 单次 agentic 实施
当 `routing.implementer` 为 `codex`/`hermes`/`openclaw` 之一时，`/ly:apply` 必须（SHALL）在确定目标 change 名后，读取 `routing.implementer`，通过 `ly-wrapper --backend <routing.implementer>` 发起一次 agentic 调用（`ROLE_FILE` 指向该 backend 的 `builder.md`），委托其自主阅读 `tasks.md` 并实施全部未完成任务。SHALL NOT 逐任务拆分调用，SHALL NOT 在委托路径中改由 Claude 自己实施。

#### Scenario: apply 委托实施后单次调用获取 Execution Report
- **WHEN** 用户运行 `/ly:apply`，`routing.implementer` 为 `codex`
- **THEN** 命令以 `--backend codex` 发起单次调用，等待其自主完成 `tasks.md` 中全部任务后返回 Execution Report，不在过程中拆分成多次调用

### Requirement: claude 实施模式下 /ly:apply 由编排者本人实施
当 `routing.implementer` 为 `claude` 时，`/ly:apply` 必须（SHALL）由当前会话的 Claude 本人直接实施：阅读目标 change 的 `tasks.md`，逐任务实施、按任务指定的验证方式验证、将已完成任务的 checkbox 勾选，随后沿用现有暂存与提交步骤（`git add` 本次实际改动文件后 `git commit -m "apply: <change-name>"`）。该模式下 MUST NOT 发起 `ly-wrapper` 调用，MUST NOT 产生或解析 `OVERALL: PASS/FAIL` Execution Report，MUST NOT 应用"FAIL 不重试不切回"或"半成品转人工"等外部委托失败处理分支。

#### Scenario: claude 模式下 apply 本人实施并提交
- **WHEN** 用户运行 `/ly:apply`，`routing.implementer` 为 `claude`
- **THEN** 当前会话的 Claude 直接读取 tasks.md 并逐任务实施、验证、勾选 checkbox，完成后暂存改动并提交 `apply: <change-name>`，全程不调用 ly-wrapper

#### Scenario: claude 模式下实施中断不产生委托失败语义
- **WHEN** claude 模式下实施过程因外部原因（如用户中断）未完成全部任务
- **THEN** 命令如实报告已完成/未完成的任务清单，不执行 commit，不存在"委托失败转人工"的报告形态
