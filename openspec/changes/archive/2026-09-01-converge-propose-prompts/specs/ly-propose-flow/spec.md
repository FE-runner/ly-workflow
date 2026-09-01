## MODIFIED Requirements

### Requirement: 在委托 opsx:propose 之前询问一次"全自动 vs 手动"
`/ly:propose` SHALL 在调用 `Skill(opsx:propose)` **之前**询问用户一次："本次收尾走全自动（自动审查 + 自动实施 + 审完代码才停，非清零即停），还是手动逐步确认（每一步都问）？"。该询问 SHALL 是整条收尾编排链路里唯一决定"自动/手动"路径的开关询问，命令后续步骤 SHALL NOT 再重复询问"要不要继续自动"。该询问 SHALL 在 worktree 询问之后进行（若未隔离且用户选择切换 worktree，则本次会话在打印续接命令后结束，下一次会话在 worktree 内的 `/ly:propose` 调用再询问）。该选择 SHALL NOT 影响"是否走 worktree"（是否隔离在 worktree 询问中独立决定，两者正交），SHALL NOT 决定"要不要走 review-plan"（两条路径下都有机会走，只是询问的时机和次数不同——全自动自动进入，手动先问要不要跑）。

#### Scenario: 询问只出现一次
- **WHEN** 用户执行 `/ly:propose "描述"`，选择"全自动"，自动流水线执行到审完代码
- **THEN** 命令只在最开始问过一次是全自动还是手动，之后的 apply/review-code 阶段不再重复询问"要不要继续自动"

#### Scenario: 已隔离时先问自动还是手动，不出现 worktree 询问
- **WHEN** 用户已在某个 worktree 内执行 `/ly:propose "描述"`
- **THEN** 命令跳过 worktree 询问，直接询问"全自动 or 手动"，随后进入生成/审查/实施流水线

### Requirement: propose 产物每步 commit，不再暂存区持有
`/ly:propose` SHALL 在确定真实 change 名后，先检查整个 Git index（`git diff --cached --name-only`）；若存在该 change 目录之外的已暂存内容，SHALL 停止并要求用户先处理。确认 index 干净后，SHALL `git add -- openspec/changes/<change-name>/`（该目录含 `openspec new change` 生成的 `.openspec.yaml` 元数据文件、proposal/design/tasks 及 delta spec 全部文件，集群暂存，不使用 `git add -A`），然后**立即 commit**（提交信息 `propose: <change-name>`），SHALL NOT 把产物保留在暂存区等待清零/询问时统一提交。commit 完成后 SHALL 用 `git show --name-only --format=` 校验该次 commit 的实际文件集合严格属于 `openspec/changes/<change-name>/` 目录（含 `.openspec.yaml`）。若该目录下无可提交内容、`git commit` 本身失败，或校验发现文件集合超出该目录范围，SHALL 停止后续自动化步骤，报告具体原因。该 commit 即为 `review-plan` 的审查对象（见 Requirement"审查对象 = 最近一次相关 commit"）。

#### Scenario: 生成方案后立即 commit，产物不留暂存区
- **WHEN** 用户执行 `/ly:propose`，`opsx:propose` 刚生成完 `openspec/changes/<change-name>/` 下的 artifacts，且 index 中没有该目录之外的已暂存内容
- **THEN** 命令 `git add -- openspec/changes/<change-name>/` 后立即 `git commit -m "propose: <change-name>"`，产物不留暂存区；审查对象是这次 commit 而非未提交 diff

#### Scenario: index 中存在目录外的已暂存内容
- **WHEN** 确定真实 change 名后检查 index，发现存在 `openspec/changes/<change-name>/` 之外的已暂存文件
- **THEN** 命令停止，报告"检测到该 change 目录外的已暂存内容，请先处理（unstage 或另行提交）后重试"，不执行 `git add` 也不 commit

#### Scenario: commit 校验失败停止后续步骤
- **WHEN** `propose: <change>` commit 后 `git show --name-only --format=` 校验发现文件集合超出该 change 目录，或该目录下无可提交内容 / commit 失败
- **THEN** 命令停止后续自动化步骤并报告具体原因

### Requirement: 全自动路径 = 自动流水线直到审完代码
当且仅当用户在开始时选择"全自动"，`/ly:propose` SHALL 在 `propose:` commit 完成后自动按序执行：
1. 自动调用 `/ly:review-plan <change-name>`（审查对象为 `propose:` commit，见新增 Requirement）。以 Critical 清零结束时自动进入下一步；以其余任一种终止（熔断、分歧未决、无法安全修复、验证失败、审查调用失败、提交失败、达到全局轮数上限）时，SHALL 停止流水线，复用该循环已产出的终止报告（SHALL NOT 重新生成或重复一份）报告终止原因，SHALL NOT 继续执行 apply。
2. 自动进入 `/ly:apply <change-name>` 实施 tasks（`apply` 产物按 `ly-lifecycle-commands` 的实施完成立即 commit 规则落库），自动进入 `/ly:review-code <change-name>`（审查对象为 `apply:` commit）。以 Critical 清零结束；以其余任一种终止时，SHALL 停止流水线，报告终止原因。
流水线执行过程中 SHALL NOT 出现任何 worktree 询问或 `/ly:worktree switch` 调用；`/ly:archive` SHALL 仍由用户手动触发，propose 不自动归档。

#### Scenario: 全自动流水线走到审完代码
- **WHEN** 用户执行 `/ly:propose` 选择"全自动"，`propose:` 提交完成，review-plan 首轮清零，apply 实施完成并 commit，review-code 清零
- **THEN** 命令连续自动执行 review-plan → apply → review-code，中途无 worktree 询问、无 switch 调用、无"要不要继续"询问；审完代码后结束，未自动执行 archive

#### Scenario: 手动路径下选跑审查且清零后不再问 worktree
- **WHEN** 手动路径下用户对"是否跑 review-plan"选"是"，`/ly:review-plan` 清零（统一提交修复），随后 apply/review-code 也清零
- **THEN** 全程只在创建方案前问过 worktree，审查清零后不再出现任何 worktree 询问、不自动 archive

#### Scenario: 全自动路径下 review-plan 非清零终止即停
- **WHEN** 全自动路径下 `/ly:review-plan` 的审查-修复循环因熔断或分歧未决等任一原因停止
- **THEN** 命令停止流水线，复用该循环已产出的终止报告报告原因，SHALL NOT 自动进入 apply，不产生任何切换动作

#### Scenario: 全自动路径下 review-code 非清零终止即停
- **WHEN** 全自动路径下实施完成后 `/ly:review-code` 的审查-修复循环非清零终止
- **THEN** 命令停止，报告终止原因，不再继续；未自动归档

### Requirement: 手动路径下询问是否要跑 review-plan，且全程不再问 worktree
`/ly:propose` 在"手动"路径下，`propose:` commit 完成后，SHALL 询问用户是否要现在跑一次 `/ly:review-plan <change-name>` 审查循环。用户选"否"则编排到此结束（方案已 commit，apply/review-code 由用户日后另行 `/ly:apply`/`/ly:review-code` 触发）。用户选"是"则 SHALL 调用 `/ly:review-plan <change-name>`（审查对象为 `propose:` commit，清零时由循环统一提交修复，规则与全自动路径一致），循环清零或非清零终止后编排结束，SHALL NOT 自动衔接 apply（apply/review-code 由用户另行触发），全程 SHALL NOT 出现 worktree 询问或 `/ly:worktree switch` 调用。

#### Scenario: 手动路径下选择不跑审查
- **WHEN** 手动路径下用户对"是否要跑 review-plan 审查"选择"否"
- **THEN** 命令结束编排，方案已由 `propose:` commit 落库，不再询问提交或 worktree

#### Scenario: 手动路径下选择跑审查
- **WHEN** 手动路径下用户对"是否要跑 review-plan 审查"选择"是"
- **THEN** 命令调用 `/ly:review-plan <change-name>`，审查对象是 `propose:` commit；清零时循环统一提交修复，不出现在循环外的提交/worktree 询问

### Requirement: 审查对象 = 最近一次相关 commit（review-plan / review-code 一致处理）
`/ly:review-plan` SHALL 以目标 change 对应的最近一期 `propose:` commit 作为审查基线；`/ly:review-code` SHALL 以最近一期 `apply:` commit 作为审查基线。两者一致处理：审查范围 = 该相关 commit 的改动（`git show <commit>` 获取其差异），加上当前工作区/暂存区中尚未提交的修复改动（`git diff HEAD` + 未跟踪文件清单）——修复在审查-修复循环内保持"结束时统一提交"（见 `ly-review-gates`），因此审查期间新修复未提交时不丢失它们。若该相关 commit 不存在（如零 commit 仓库、审查时尚未产生 apply commit），SHALL 退化为现状 `git diff HEAD` + 未跟踪清单组合。

"最近一期相关 commit"的定位规约：优先按 commit message 前缀定位——`review-plan` 用 `git log --grep="^propose: <change-name>"`、`review-code` 用 `git log --grep="^apply: <change-name>"`，各自取 HEAD 侧最近一期匹配 commit；二者并列采用，针对 review-code 场景（apply 改动集中在 `templates/`/`src/` 等源码目录而非 change 目录），SHALL NOT 以"在 change 目录内枚举 commit"作为 review-code 的定位手段。多个 change 并存、中间穿插其他 commit（如其他 change 产物或修复）时，`git show <commit>` 展示该 commit 自身差异、`git diff HEAD` 覆盖工作区/暂存区的最新状态，不要求基线等于 HEAD。审查期间新产生的未提交修复（修复循环内）始终计入审查范围，不在中途产生新 commit（见 `ly-review-gates` 的"结束时统一提交"）。

#### Scenario: review-plan 审查 propose commit
- **WHEN** `/ly:propose` 已 commit `propose: <change>` 后调用 `/ly:review-plan <change>`
- **THEN** 审查范围取该 `propose:` commit 的差异并把未提交修复计入，修复循环结束统一提交

#### Scenario: review-code 审查 apply commit
- **WHEN** `/ly:apply` 已 commit `apply: <change>` 后调用 `/ly:review-code <change>`
- **THEN** 审查范围取该 `apply:` commit 的差异并把未提交修复计入，修复循环结束统一提交

#### Scenario: 该相关 commit 不存在时退化为未提交 diff
- **WHEN** 仓库零 commit，或审查时目标 change 最近一期相关 commit（`propose:`/`apply:`）尚不存在
- **THEN** 审查范围退化为 `git diff HEAD` + 未跟踪文件清单的现状组合

#### Scenario: 提交的相关 commit 存在但工作区干净，仍按相关 commit 审查
- **WHEN** `apply:`/`propose:` commit 已存在、当前工作区/暂存区完全干净（无未提交改动）
- **THEN** 审查对象仍是该相关 commit 的差异（`git show <commit>`），SHALL NOT 报"无变更可审查"