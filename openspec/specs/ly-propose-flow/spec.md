## Purpose

让 `/ly:propose` 的收尾流程在创建方案前收敛为两个单点询问（隔离 worktree + 全自动/手动），生成方案后每步 commit（`propose: <change-name>`），并按所选路径自动收尾：全自动路径在审方案清零后同会话自动进入 apply → 自动审代码的流水线，手动路径在方案提交后询问一次是否跑审查。自动化程度由用户在流程最开始明确选择，不默默展开、不需要用户手动记住下一步该做什么。

## Requirements

### Requirement: 在委托 opsx:propose 之前询问一次"全自动 vs 手动"
`/ly:propose` SHALL 在调用 `Skill(opsx:propose)` **之前**询问用户一次："本次收尾走全自动（自动审查 + 自动实施 + 审完代码才停，非清零即停），还是手动逐步确认（每一步都问）？"。该询问 SHALL 是整条收尾编排链路里唯一决定"自动/手动"路径的开关询问，命令后续步骤 SHALL NOT 再重复询问"要不要继续自动"。该询问 SHALL 在 worktree 询问之后进行（若未隔离且用户选择切换 worktree，则当前会话先 cd 进新 worktree，随后**在同一会话内**进行本询问——不存在"下一次会话再询问"的交接）。该选择 SHALL NOT 影响"是否走 worktree"（是否隔离在 worktree 询问中独立决定，两者正交），SHALL NOT 决定"要不要走 review-plan"（两条路径下都有机会走，只是询问的时机和次数不同——全自动自动进入，手动先问要不要跑）。

#### Scenario: 询问只出现一次
- **WHEN** 用户执行 `/ly:propose "描述"`，选择"全自动"，自动流水线执行到审完代码
- **THEN** 命令只在最开始问过一次是全自动还是手动，之后的 apply/review-code 阶段不再重复询问"要不要继续自动"

#### Scenario: 已隔离时先问自动还是手动，不出现 worktree 询问
- **WHEN** 用户已在某个 worktree 内执行 `/ly:propose "描述"`
- **THEN** 命令跳过 worktree 询问，直接询问"全自动 or 手动"，随后进入生成/审查/实施流水线

#### Scenario: 切换 worktree 后同一会话内询问自动还是手动
- **WHEN** 用户在主工作区执行 `/ly:propose "描述"`，worktree 询问选择"切换"，baseline 验证通过
- **THEN** 当前会话 cd 进新 worktree 后立即进行"全自动 or 手动"询问，不结束会话、不开新会话，询问结果直接决定同一会话内后续编排路径

### Requirement: propose 收尾时通过前后快照比对确定真实 change 名
`/ly:propose` SHALL 在调用 `Skill(opsx:propose)` 之前记录一次 `openspec list --json` 的候选 change 名集合（快照 A），委托完成后再查询一次（快照 B），取快照 B 相对快照 A 新增的那一条作为本次实际生成的 change 名，SHALL NOT 依赖 `$ARGUMENTS`、SHALL NOT 单纯依赖全局 `lastModified` 最新一条。若新增条目不唯一或没有新增条目，SHALL NOT 猜测，必须（SHALL）直接询问用户本次生成的 change 名。

#### Scenario: 用户输入的描述与最终 slug 不同
- **WHEN** 用户执行 `/ly:propose "给批量导出接口加限流"`，`opsx:propose` 内部生成的 change 名为 `add-export-rate-limit`
- **THEN** 后续 commit、（若自动化开启）调用 `/ly:review-plan`、询问 worktree 时使用的都是 `add-export-rate-limit`，不是用户输入的原始描述，且该名字来自快照比对而非 `lastModified` 猜测

#### Scenario: 快照比对无法唯一确定
- **WHEN** 委托完成后快照比对发现新增条目不唯一（或没有新增条目）
- **THEN** 命令 SHALL NOT 继续猜测，直接询问用户本次生成的 change 名，待用户确认后再继续后续步骤

### Requirement: 产物生成后、commit 前执行方案自审（四项检查 + 两类发现处理）
`/ly:propose` SHALL 在确定真实 change 名之后、执行 `propose: <change-name>` commit 之前，由方案提出者（当前会话 Claude 本人）对该 change 的全部 artifacts（proposal.md/design.md/tasks.md/全部 delta spec）执行一次**方案自审**。自审 SHALL 包含四项检查：

1. **正向闭环**：proposal 的每条 What Change 条目 SHALL 能对应到 design 的决策与 tasks 的任务；design.md 缺失时 SHALL 容错跳过该段（What Change 直接对接 tasks），缺失本身不报问题。
2. **反向闭环**：tasks 的每个任务 SHALL 能溯源到至少一条 What Change 条目；不可溯源的孤儿任务属于拆解时私自扩的范围，SHALL 处理（删除或补全对应的 What Change/设计依据）。
3. **基线波及**：对 proposal 声明的每个 Modified Capability，SHALL 逐条对照 `openspec/specs/<capability>/spec.md` 的现有 Requirements 检查本次改动是否波及；被波及但方案只字未提的即为遗漏，SHALL 处理。New Capabilities 无基线可查，跳过该项。
4. **通用业务维度过网**：权限、失败路径、并发、兼容/迁移等通用业务维度 SHALL 逐项过一遍；判定"不适用"的维度 MUST 写明理由，SHALL NOT 静默跳过。

自审发现的问题 SHALL 分两类处理：

- **机械断链**（漏任务、范围未同步、design 决策缺失等可直接修复的缺陷）：由方案提出者直接修改对应 artifact，SHALL NOT 就此类问题询问用户。
- **业务判断类**（"这个场景要不要支持"等需要用户决策的开放问题）：SHALL 列为开放问题用 AskUserQuestion 询问用户，SHALL NOT 由提出者自行猜测决定；**全自动模式下同样询问**（该询问是自动流水线的人工确认点，与"需要人工介入"同级），用户回答后 SHALL 按回答更新对应 artifact 再继续。

#### Scenario: 正向断链被自审修复
- **WHEN** proposal 的某条 What Change 在 tasks.md 中没有任何对应任务
- **THEN** 自审判定为机械断链，方案提出者直接在 tasks.md 补全对应任务（或与用户确认后从 What Changes 中移除该条），不就此询问用户"要不要修"

#### Scenario: 业务判断类问题在全自动模式下仍然询问
- **WHEN** 用户选择全自动路径，自审发现"权限边界场景要不要支持"属业务判断类问题
- **THEN** 命令用 AskUserQuestion 询问用户，流水线在该点暂停等待回答，按回答更新 artifact 后继续 commit 与后续流水线步骤

#### Scenario: design.md 缺失时容错
- **WHEN** 该 change 只有 proposal.md 与 tasks.md，无 design.md
- **THEN** 自审跳过"正向闭环"中 design 段的检查（What Change 直接对接 tasks），缺失本身不作为问题处理

#### Scenario: 用户拒绝回答开放问题时停止编排
- **WHEN** 自审列出业务判断类开放问题并用 AskUserQuestion 询问，用户拒绝/取消回答
- **THEN** 命令停止后续编排（不执行 index 检查、不 commit、全自动流水线不启动），方案 artifacts 留在工作区，报告已有结论清单与未决问题，转人工处理

### Requirement: 自审必须产出逐项结论清单，禁止一句带过
方案自审 SHALL 产出可见的**逐项结论清单**，对四项检查中的每一子项（每条 What Change 的闭环情况、每个 Modified Capability 的基线波及情况、每个通用维度）分别标注结论：通过 / 不适用（含理由）/ 已修复（含改动说明）/ 待用户决策（含问题）。SHALL NOT 以"自审通过，无问题"之类的一句总结代替逐项清单；存在"待用户决策"项时 SHALL 在清单中列出完整问题再询问。

#### Scenario: 全部通过时仍需逐项列出
- **WHEN** 自审四项检查全部通过、无需修复、无开放问题
- **THEN** 报告仍逐项列出每条 What Change/每个基线 Requirement/每个通用维度的"通过"结论，而非一句"自审通过"

#### Scenario: 不适用维度必须写明理由
- **WHEN** 某通用维度（如并发）判定为不适用
- **THEN** 逐项结论清单中该维度标注"不适用"+ 具体理由；未写理由的 silent skip 视为自审未执行该项

### Requirement: propose 产物每步 commit，不再暂存区持有
`/ly:propose` SHALL 在确定真实 change 名后，先执行方案自审（见"产物生成后、commit 前执行方案自审"Requirement，自审产生的 artifact 修复属于本次待提交内容），再检查整个 Git index（`git diff --cached --name-only`）；若存在该 change 目录之外的已暂存内容，SHALL 停止并要求用户先处理。确认 index 干净后，SHALL `git add -- openspec/changes/<change-name>/`（该目录含 `openspec new change` 生成的 `.openspec.yaml` 元数据文件、proposal/design/tasks 及 delta spec 全部文件，集群暂存，不使用 `git add -A`），然后**立即 commit**（提交信息 `propose: <change-name>`），SHALL NOT 把产物保留在暂存区等待清零/询问时统一提交。commit 完成后 SHALL 用 `git show --name-only --format=` 校验该次 commit 的实际文件集合严格属于 `openspec/changes/<change-name>/` 目录（含 `.openspec.yaml`）。若该目录下无可提交内容、`git commit` 本身失败，或校验发现文件集合超出该目录范围，SHALL 停止后续自动化步骤，报告具体原因。该 commit 即为 `review-plan` 的审查对象（见 Requirement"审查对象 = 最近一次相关 commit"），其中包含自审产生的全部修复（产物与自审修复是同一次干净提交，不产生"commit + 未提交自审修复"的混合状态）。

#### Scenario: 生成方案后立即 commit，产物不留暂存区
- **WHEN** 用户执行 `/ly:propose`，`opsx:propose` 刚生成完 `openspec/changes/<change-name>/` 下的 artifacts，自审完成，且 index 中没有该目录之外的已暂存内容
- **THEN** 命令 `git add -- openspec/changes/<change-name>/` 后立即 `git commit -m "propose: <change-name>"`，产物与自审修复一并落库不留暂存区；审查对象是这次 commit 而非未提交 diff

#### Scenario: index 中存在目录外的已暂存内容
- **WHEN** 确定真实 change 名并完成自审后检查 index，发现存在 `openspec/changes/<change-name>/` 之外的已暂存文件
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