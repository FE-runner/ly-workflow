## ADDED Requirements

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

## MODIFIED Requirements

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
