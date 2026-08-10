## Purpose

让 `/ly:propose` 从"生成方案就结束"升级为"生成方案 → 提交 → （可选）审查收敛 → （可选）询问是否隔离实施"的收尾流程，且自动化程度由用户在流程最开始明确选择，不默默展开、不需要用户手动记住下一步该做什么。

## Requirements

### Requirement: 在委托 opsx:propose 之前询问一次"全自动 vs 手动"
`/ly:propose` SHALL 在调用 `Skill(opsx:propose)` **之前**询问用户一次："本次收尾走全自动（自动审查+清零后问一次worktree+隔离后自动续接实施与审查），还是手动逐步确认（每一步都问）？"。该询问 SHALL 是整条收尾编排链路里唯一决定"自动/手动"路径的开关询问，命令后续步骤 SHALL NOT 再重复询问"要不要继续自动"。该选择 SHALL NOT 影响是否 commit（commit 始终无条件执行），也 SHALL NOT 决定"要不要走 worktree/review-plan"——两种路径下都有机会走，只是询问的时机和次数不同（全自动路径仅在循环终止时问一次；手动路径在方案提交后、以及审查循环终止时各问一次，且额外多问一次"要不要跑审查"）。

#### Scenario: 询问只出现一次
- **WHEN** 用户执行 `/ly:propose "描述"`，选择"全自动"，审查循环经过 2 轮才清零
- **THEN** 命令只在最开始问过一次是全自动还是手动，循环期间的每一轮不再重复询问"要不要继续自动"

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

### Requirement: 全自动路径下自动调用 review-plan 审查循环，由循环自身逐轮提交
当且仅当用户在开始时选择"全自动"，`/ly:propose` SHALL 在完成首次 commit 后自动调用 `/ly:review-plan <change-name>`，该调用 SHALL 复用审查-修复循环规则（见 ly-review-gates 能力），并让循环自身（默认行为，除非显式传 `--no-commit`）在每轮修复且验证（`openspec validate`）通过后立即 commit，`/ly:propose` SHALL NOT 从外部拦截或观察循环的中间轮次状态来触发提交。

#### Scenario: 审查循环中的逐轮提交由 review-plan 自身完成
- **WHEN** 选择"全自动"，`/ly:propose` 调用 `/ly:review-plan <change-name>`，第一轮发现 1 个 Critical 并修改了 `design.md`，`openspec validate` 通过
- **THEN** `/ly:review-plan` 在进入第二轮审查前立即提交一次，提交信息形如 `fix: review-plan feedback (round 1) - <change-name>`；`/ly:propose` 不需要感知这次提交的具体时机

### Requirement: 全自动路径下审查循环结束后询问是否切换隔离 worktree，任一终止原因都问
`/ly:propose` 在"全自动"路径下，SHALL 在审查循环终止（无论何种原因）后询问用户是否要为该 change 切换到隔离 worktree：终止原因为"Critical 清零"时，SHALL 调用 `/ly:worktree switch <change-name> --auto`（因为问题已收敛，切换后自然延续自动化——新 worktree 里实施完自动跑 `/ly:review-code` 审查循环）；终止原因为其余任一种（熔断、分歧未决、无法安全修复、验证失败、审查调用失败、提交失败、达到全局轮数上限）时，SHALL 复用该审查循环已产出的终止报告（SHALL NOT 重新生成或重复一份），再询问是否新建隔离 worktree，用户选"是"时调用 `/ly:worktree switch <change-name>`（**不带** `--auto`——问题尚未收敛，不应自动续跑审查，视为自动模式失效、退回人工确认）。用户对任一询问选择"否"时，留在当前工作区，流程结束。

调用 `/ly:worktree switch` 的结果 SHALL 按以下**switch 结果统一判定规则**处理（与 `ly-lifecycle-commands` 能力中 `/ly:apply` 共用同一套规则）：以其**是否最终输出续接命令**为唯一判定依据——输出了续接命令即视为目标 worktree 已就位，直接结束当前编排。续接提示按以下组合规则确定，SHALL NOT 拆成并列、互相独立的多条提示：不带 `--auto`、无 baseline 失败摘要时追加"运行 `/ly:apply` 继续"；不带 `--auto`、有 baseline 失败摘要时改为"处理完 baseline 失败问题后运行 `/ly:apply` 继续"；带 `--auto`（承诺"实施完成后自动依次调用 `/ly:review-code`"）、无 baseline 失败摘要时改写为一条连贯说明"运行 `/ly:apply` 继续实施（自动 commit），完成后自动依次调用 `/ly:review-code`"；带 `--auto` 且有 baseline 失败摘要时，两个约束都要保留，改写为"处理完 baseline 失败问题后，运行 `/ly:apply` 继续实施（自动 commit）；完成后自动依次调用 `/ly:review-code`"，SHALL NOT 因合并 `--auto` 说明而丢失"先处理 baseline 问题"这一前置约束。未输出续接命令的以下三种情况，均 SHALL 如实转述/报告对应原因并结束，SHALL NOT 输出该续接提示，SHALL NOT 自动回退到"继续留在当前工作区"：（1）分支拓扑校验等前置校验拒绝——转述原始错误，其中以"验证失败"或"提交失败"终止后因该 change 目录本身存在未提交改动导致的前置校验拒绝也属于此类，转述"请先处理未提交内容后重试"的报错即可，不需要额外的预检测逻辑；（2）baseline 失败且用户在 `switch` 内部询问中选择不继续——报告 baseline 失败摘要；（3）`switch` 自身隔离检测触发的"是否仍要新建独立 worktree"询问被用户选择不创建——如实说明仍留在原 worktree、未发生切换。

#### Scenario: 审查通过后询问，选是时带 --auto
- **WHEN** `/ly:review-plan` 的审查-修复循环以 Critical 清零结束
- **THEN** `/ly:propose` 询问用户"是否为此次改动新建隔离 worktree？"，用户选择"是"时调用 `/ly:worktree switch <change-name> --auto`，选择"否"时结束流程，change 留在当前工作区

#### Scenario: 带 --auto 切换成功时续接提示合并为一条连贯说明
- **WHEN** 上一 Scenario 中 `switch --auto` 成功输出续接命令，baseline 验证通过
- **THEN** 续接提示 SHALL 是"运行 `/ly:apply` 继续实施（自动 commit），完成后自动依次调用 `/ly:review-code`"这一条连贯说明，SHALL NOT 拆成两条并列、互相独立的提示

#### Scenario: 带 --auto 且 baseline 失败但用户选择继续时，提示同时保留两个约束
- **WHEN** 上一 Scenario 中 `switch --auto` 创建的 worktree baseline 验证失败，用户在 `switch` 内部询问中选择继续，`switch` 输出了携带失败摘要的续接命令
- **THEN** 续接提示 SHALL 是"处理完 baseline 失败问题后，运行 `/ly:apply` 继续实施（自动 commit）；完成后自动依次调用 `/ly:review-code`"，SHALL NOT 丢失"先处理 baseline 问题"这一前置约束

#### Scenario: 熔断或分歧未决时也问，但不带 --auto
- **WHEN** `/ly:review-plan` 的审查-修复循环因"同一问题连续两轮未解决"触发熔断，或因"分歧未决"停止
- **THEN** `/ly:propose` 复用该循环已产出的终止报告，再询问是否新建隔离 worktree；用户选"是"时调用 `/ly:worktree switch <change-name>`（不带 `--auto`）去处理未决问题，选"否"时结束流程

#### Scenario: 无法安全修复/验证失败/审查调用失败/提交失败/达到轮数上限时同样问，但不带 --auto
- **WHEN** `/ly:review-plan` 的审查-修复循环因"无法安全自动修复""修复后验证失败""审查调用失败""提交失败"或"达到全局轮数上限"中任一原因停止
- **THEN** `/ly:propose` 复用该循环已产出的终止报告，再询问是否新建隔离 worktree；用户选"是"时调用 `/ly:worktree switch <change-name>`（不带 `--auto`），选"否"时结束流程

#### Scenario: switch 前置校验拒绝时转述错误并结束
- **WHEN** 用户对 worktree 询问选择"是"，但 `/ly:worktree switch <change-name>`（带或不带 `--auto`）因分支拓扑校验失败被前置拒绝（未输出续接命令）
- **THEN** `/ly:propose` 转述 `switch` 返回的原始错误并结束编排，SHALL NOT 回退到"继续留在当前工作区"

#### Scenario: switch 因目标 change 目录有未提交改动被拒绝
- **WHEN** 因"验证失败"或"提交失败"终止后用户选择切换，`/ly:review-plan` 该轮修改尚未提交，`switch` 的前置校验因该 change 目录有未提交内容而拒绝
- **THEN** `/ly:propose` 转述该报错并结束编排，不额外增加预检测步骤，也 SHALL NOT 静默回退到留在当前工作区继续处理

#### Scenario: baseline 失败且用户选择不继续时不输出续接提示
- **WHEN** 用户对 worktree 询问选择"是"，`/ly:worktree switch` 创建/挂载了 worktree 但 baseline 验证失败，用户在 `switch` 内部询问中选择不继续（未输出续接命令）
- **THEN** `/ly:propose` 报告 baseline 失败摘要并结束，SHALL NOT 输出"运行 `/ly:apply` 继续"这类续接提示

#### Scenario: baseline 失败但用户选择继续时仍视为已就位
- **WHEN** 用户对 worktree 询问选择"是"，`/ly:worktree switch` 的 baseline 验证失败，用户明确选择继续，`switch` 输出了携带失败摘要的续接命令
- **THEN** `/ly:propose` 视为目标 worktree 已就位，追加"处理完 baseline 失败问题后运行 `/ly:apply` 继续"的提示并结束

#### Scenario: switch 内层询问被拒绝创建时不当作切换成功
- **WHEN** 用户对 worktree 询问选择"是"，`/ly:worktree switch` 检测到当前已在另一个 worktree 内并触发其自身的"是否仍要新建独立 worktree"询问，用户对这一内层询问选择"否"
- **THEN** `/ly:propose` 如实说明仍留在原 worktree、未发生切换，并结束，SHALL NOT 输出"运行 `/ly:apply` 继续"这类误导性的续接提示

### Requirement: 手动路径下 commit 完成后先问是否切换 worktree
`/ly:propose` 在"手动"路径下，SHALL 在首次 commit 完成后立即询问用户是否要现在切换到隔离 worktree。用户选"是"时 SHALL 调用 `/ly:worktree switch <change-name>`（不带 `--auto`）；`switch` 结果的判定规则（何时算切换成功、何时是被拒绝、何时是内层询问被拒绝创建）与"全自动路径下审查循环结束后询问是否切换隔离 worktree"Requirement 一致。切换成功则**直接结束编排**，续接提示 SHALL 追加"运行 `/ly:apply` 继续"，不再继续询问是否跑审查（后续要不要审查由用户在新 worktree 里自行决定）；被拒绝或内层询问被拒绝创建时，按上述一致规则处理并结束/回到当前状态，SHALL NOT 继续询问是否跑审查。用户选"否"时继续询问是否要跑审查（见下一条 Requirement）。

#### Scenario: 手动路径下方案提交后选择切换 worktree
- **WHEN** 选择"手动"路径，`/ly:propose` 完成首次 commit
- **THEN** 命令询问"方案已生成并提交，是否现在切换到隔离 worktree？"；用户选"是"时调用 `/ly:worktree switch <change-name>`（不带 `--auto`），输出续接命令后编排结束

#### Scenario: 手动路径下方案提交后选择不切换
- **WHEN** 选择"手动"路径，`/ly:propose` 完成首次 commit，用户对是否切换 worktree 的询问选择"否"
- **THEN** 命令继续询问是否要跑 review-plan 审查循环

### Requirement: 手动路径下询问是否要跑 review-plan 审查
`/ly:propose` 在"手动"路径下，若用户在上一步选择不切换 worktree，SHALL 询问用户是否要现在跑一次 `/ly:review-plan <change-name>` 审查循环。用户选"否"时编排结束（等价于"只生成方案 + 提交"）。用户选"是"时 SHALL 调用 `/ly:review-plan <change-name>`（默认逐轮自动提交，规则与全自动路径下的调用一致）。

#### Scenario: 手动路径下选择不跑审查
- **WHEN** 手动路径下用户对"是否要跑 review-plan 审查"的询问选择"否"
- **THEN** 编排结束，change 保持"已生成 + 已提交"状态，不调用 `/ly:review-plan`

#### Scenario: 手动路径下选择跑审查
- **WHEN** 手动路径下用户对"是否要跑 review-plan 审查"的询问选择"是"
- **THEN** 命令调用 `/ly:review-plan <change-name>`，审查-修复循环默认逐轮自动提交

### Requirement: 手动路径下审查循环结束后再问一次 worktree，任一终止原因都问
`/ly:propose` 在"手动"路径下，若已进入审查循环，SHALL 在循环终止（无论何种原因）后再询问一次是否要新建隔离 worktree，调用时**均不带** `--auto`（手动路径下不要求新会话自动续跑审查）。终止原因为"Critical 清零"时直接问；终止原因为其余任一种时，SHALL 复用该循环已产出的终止报告（SHALL NOT 重新生成或重复一份），再询问。用户选"是"时调用 `/ly:worktree switch <change-name>`（不带 `--auto`），`switch` 结果的判定规则（切换成功/被拒绝/内层询问被拒绝创建、以及"因未提交改动被拒绝"这类场景的处理）与"全自动路径下审查循环结束后询问是否切换隔离 worktree"Requirement 一致；选"否"时留在当前工作区，流程结束。

#### Scenario: 手动路径下审查清零后询问
- **WHEN** 手动路径下 `/ly:review-plan` 的审查-修复循环以 Critical 清零结束
- **THEN** `/ly:propose` 询问"审查已通过，是否为此次改动新建隔离 worktree？"，用户选"是"时调用 `/ly:worktree switch <change-name>`（不带 `--auto`）

#### Scenario: 手动路径下审查以其余原因终止也询问
- **WHEN** 手动路径下 `/ly:review-plan` 的审查-修复循环因熔断、分歧未决、无法安全修复、验证失败、审查调用失败、提交失败或达到全局轮数上限中任一原因停止
- **THEN** `/ly:propose` 复用该循环已产出的终止报告，再询问是否新建隔离 worktree；用户选"是"时调用 `/ly:worktree switch <change-name>`（不带 `--auto`）
