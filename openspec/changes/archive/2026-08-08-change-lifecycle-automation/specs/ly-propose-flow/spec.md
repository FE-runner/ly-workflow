## Purpose

让 `/ly:propose` 从"生成方案就结束"升级为"生成方案 → 提交 → （可选）审查收敛 → （可选）询问是否隔离实施"的收尾流程，且自动化程度由用户在流程最开始明确选择，不默默展开、不需要用户手动记住下一步该做什么。

## ADDED Requirements

### Requirement: 在委托 opsx:propose 之前询问总开关
`/ly:propose` SHALL 在调用 `Skill(opsx:propose)` **之前**询问用户一次："本次要不要走自动化收尾流程（审查循环 + worktree 询问 + 隔离后自动续接实施与审查）？"。该询问 SHALL 是整条收尾编排链路里唯一的开关询问，命令后续步骤 SHALL NOT 再重复询问是否启用自动化。

#### Scenario: 询问只出现一次
- **WHEN** 用户执行 `/ly:propose "描述"`，选择开启自动化，审查循环经过 2 轮才清零
- **THEN** 命令只在最开始问过一次是否自动化，循环期间的每一轮不再重复询问"要不要继续自动"

### Requirement: propose 收尾时通过前后快照比对确定真实 change 名
`/ly:propose` SHALL 在调用 `Skill(opsx:propose)` 之前记录一次 `openspec list --json` 的候选 change 名集合（快照 A），委托完成后再查询一次（快照 B），取快照 B 相对快照 A 新增的那一条作为本次实际生成的 change 名，SHALL NOT 依赖 `$ARGUMENTS`、SHALL NOT 单纯依赖全局 `lastModified` 最新一条。若新增条目不唯一或没有新增条目，SHALL NOT 猜测，必须（SHALL）直接询问用户本次生成的 change 名。

#### Scenario: 用户输入的描述与最终 slug 不同
- **WHEN** 用户执行 `/ly:propose "给批量导出接口加限流"`，`opsx:propose` 内部生成的 change 名为 `add-export-rate-limit`
- **THEN** 后续 commit、（若自动化开启）调用 `/ly:review-plan`、询问 worktree 时使用的都是 `add-export-rate-limit`，不是用户输入的原始描述，且该名字来自快照比对而非 `lastModified` 猜测

#### Scenario: 快照比对无法唯一确定
- **WHEN** 委托完成后快照比对发现新增条目不唯一（或没有新增条目）
- **THEN** 命令 SHALL NOT 继续猜测，直接询问用户本次生成的 change 名，待用户确认后再继续后续步骤

### Requirement: 生成完 artifact 立即提交，不受总开关影响，暂存范围精确限定
`/ly:propose` SHALL 在确定真实 change 名后，先检查整个 Git index（`git diff --cached --name-only`）；若存在该 change 目录之外的已暂存内容，SHALL 停止并要求用户先处理这些改动（unstage 或另行提交），不得把它们一并提交。确认 index 干净后，执行 `git add -- openspec/changes/<change-name>/`（仅暂存该 change 目录，不使用 `git add -A` 等宽泛写法），再执行 commit（提交信息包含 `propose:` 前缀与 change 名），SHALL NOT 等待审查通过后再一次性提交，且该提交 SHALL 无条件发生——即使用户在总开关询问中选择不启用自动化。提交完成后 SHALL 用 `git show --name-only --format=` 校验该次 commit 实际包含的文件集合严格属于 `openspec/changes/<change-name>/` 目录。若该目录下无可提交内容、`git commit` 本身失败，或提交后校验发现文件集合超出该目录范围，`/ly:propose` SHALL 停止后续自动化步骤（不调用 `/ly:review-plan`、不询问 worktree），并报告具体原因。

#### Scenario: 首次提交
- **WHEN** `opsx:propose` 刚生成完 `openspec/changes/<change-name>/` 下的 proposal/design/tasks（及 specs，如适用），且 index 中没有该目录之外的已暂存内容
- **THEN** 命令先 `git add -- openspec/changes/<change-name>/`，再执行一次 commit，提交信息形如 `propose: <change-name>`，提交后用 `git show --name-only --format=` 校验文件集合只属于该目录

#### Scenario: index 中存在目录外的已暂存内容
- **WHEN** 确定真实 change 名后检查 index，发现存在 `openspec/changes/<change-name>/` 之外的已暂存文件
- **THEN** 命令停止，报告"检测到该 change 目录外的已暂存内容，请先处理（unstage 或另行提交）后重试"，不执行 commit

#### Scenario: 总开关选否时提交仍然执行
- **WHEN** 用户在总开关询问中选择不启用自动化
- **THEN** 命令仍然对生成的 artifact 执行一次精确范围的 commit，随后直接结束，不调用 `/ly:review-plan`，不询问 worktree

#### Scenario: 无可提交内容、提交失败, 或提交后校验发现范围超出
- **WHEN** 该 change 目录下没有实际文件变化，或 `git commit` 执行失败，或提交后 `git show --name-only` 显示的文件超出目标目录
- **THEN** 命令停止后续自动化步骤，报告具体原因，SHALL NOT 继续调用 `/ly:review-plan` 或询问 worktree

### Requirement: 总开关开启时自动调用 review-plan 审查循环，由循环自身逐轮提交
当且仅当总开关询问结果为"是"时，`/ly:propose` SHALL 在完成首次 commit 后自动调用 `/ly:review-plan <change-name> --commit-each-round`，该调用 SHALL 复用审查-修复循环规则（见 ly-review-gates 能力），并让循环自身在每轮修复且验证（`openspec validate`）通过后立即 commit，`/ly:propose` SHALL NOT 从外部拦截或观察循环的中间轮次状态来触发提交。

#### Scenario: 审查循环中的逐轮提交由 review-plan 自身完成
- **WHEN** 总开关开启，`/ly:propose` 调用 `/ly:review-plan <change-name> --commit-each-round`，第一轮发现 1 个 Critical 并修改了 `design.md`，`openspec validate` 通过
- **THEN** `/ly:review-plan` 在进入第二轮审查前立即提交一次，提交信息形如 `fix: review-plan feedback (round 1) - <change-name>`；`/ly:propose` 不需要感知这次提交的具体时机

### Requirement: 审查循环结束后询问是否切换隔离 worktree，选是时启用自动续接
`/ly:propose` SHALL 在审查循环终止原因为"Critical 清零"时，无论改动大小，SHALL 询问用户是否要为该 change 切换到隔离 worktree。循环以其余任一终止原因结束（熔断、分歧未决、无法安全修复、验证失败、审查调用失败、达到全局轮数上限）时，`/ly:propose` SHALL NOT 询问是否切换 worktree，SHALL NOT 调用 `/ly:worktree switch`，直接输出对应的终止报告并结束编排。用户对 worktree 询问选择"是"时，`/ly:propose` SHALL 调用 `/ly:worktree switch <change-name> --auto`（因为总开关已确认用户想要端到端自动化，切换后自动延续到"新 worktree 里实施完自动跑 `/ly:review-code --commit-each-round` 审查循环"，不再为此单独询问）。

#### Scenario: 审查通过后询问，选是时带 --auto
- **WHEN** `/ly:review-plan` 的审查-修复循环以 Critical 清零结束
- **THEN** `/ly:propose` 询问用户"是否为此次改动新建隔离 worktree？"，用户选择"是"时调用 `/ly:worktree switch <change-name> --auto`，选择"否"时结束流程，change 留在当前工作区

#### Scenario: 熔断或分歧未决时不询问
- **WHEN** `/ly:review-plan` 的审查-修复循环因"同一问题连续两轮未解决"触发熔断，或因"分歧未决"停止
- **THEN** `/ly:propose` 直接输出对应的终止报告，SHALL NOT 询问是否切换 worktree，也 SHALL NOT 调用 `/ly:worktree switch`

#### Scenario: 无法安全修复/验证失败/审查调用失败/达到轮数上限时同样不询问
- **WHEN** `/ly:review-plan` 的审查-修复循环因"无法安全自动修复""修复后验证失败（openspec validate 不通过）""审查调用失败"或"达到全局轮数上限"中任一原因停止
- **THEN** `/ly:propose` 直接输出对应的终止报告，SHALL NOT 询问是否切换 worktree，也 SHALL NOT 调用 `/ly:worktree switch`——只有"Critical 清零"这一种终止原因才进入 worktree 询问
