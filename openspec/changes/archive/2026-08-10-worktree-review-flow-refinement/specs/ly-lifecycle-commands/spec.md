## MODIFIED Requirements

### Requirement: Explore 命令是纯委托；Apply/Archive 委托对应技能并自动提交；Propose 是编排入口
`/ly:explore` 必须（SHALL）只调用 `opsx:explore`，原样转发 `$ARGUMENTS`，不得包含自定义的多模型分派、环境校验，或超出底层技能本身的输出后处理逻辑。

`/ly:apply` 在调用 `opsx:apply` **之前** 必须（SHALL）先做一次隔离检测（复用 `/ly:worktree` Add 步骤的隔离检测逻辑）。

**该 change 的固定目标路径**：`<主仓库上级目录>/.ly/<主仓库目录名>/<change-name>`——即 `/ly:worktree switch <change-name>`（不带 `--auto`/`--local` 等选项时）创建/挂载该 change 的 worktree 所使用的默认路径。"主仓库"SHALL 以 `git rev-parse --git-common-dir` 解析出的公共 Git 目录反推其所在的主工作树位置为准，SHALL NOT 依据当前调用发生时所处 worktree 的相对路径推导——保证从任意 worktree 调用 `/ly:apply` 或 `/ly:worktree switch` 时，对同一个 change 算出的固定目标路径始终一致。本次不承认 `--local` 项目内路径为受控目标路径（`switch` 目前未定义 `--local` 用法，若未来扩展再单独处理）。判断某个 worktree "是否为该 change 的受控目标 worktree"，SHALL 同时满足：（1）该 worktree 根路径（`git rev-parse --show-toplevel`）严格等于上述固定目标路径；（2）`git worktree list --porcelain` 中该固定路径下注册的分支名严格等于 `<change-name>`。`/ly:apply` SHALL 每次独立读取当前 canonical 路径与 `git worktree list --porcelain` 完成这两个条件的判定，不依赖、不假设本次会话之前是否调用过 `/ly:worktree switch`（`switch` 自身也会在定位阶段做同款分支校验，见"switch 定位已注册路径时必须校验分支"Requirement，`worktree-switch` 能力，两处校验各自独立执行，互不依赖）。仅凭"当前分支名等于 change 名"或"当前路径等于某个已注册 worktree 的路径"任一条件成立，SHALL NOT 视为匹配——必须是"固定目标路径"与"该路径下注册的分支"同时对得上，防止用户在任意非固定路径手工检出同名分支后被误判为已匹配。本条判定的目标是**防误操作，不是防故意绕过**：不校验目标分支 `HEAD` 是否真的包含该 change 当前的 artifact——用户手工把分支 reset 到无关提交这类故意破坏本地 git 状态的操作，不在本次防护范围内（见 design.md Decision 11）。

目标 `<change-name>` 的解析 SHALL 按固定优先级：`$ARGUMENTS` 中显式且合法的 change 名 → 当前 worktree 反查出的受控 change（枚举 `openspec/changes/` 下未归档的 change 名，对每个候选按上述固定目标路径规则计算，检查当前 worktree 根路径是否等于其中之一；恰好一个匹配则采用该 change 名，零个或多个匹配则视为反查失败，进入下一优先级）→ `openspec/changes/` 下唯一未归档的 change → 无法唯一确定时直接询问用户；任何一步无法唯一确定都 SHALL NOT 继续调用 `switch` 或执行 `opsx:apply`，直到用户给出明确答案。

若当前已在某个 worktree 内，"匹配目标 change" SHALL 就是"当前 worktree 是否为该 change 的受控目标 worktree"（定义见上）；不匹配（含反查失败、detached HEAD 无法读取分支名、或分支名相等但不在固定目标路径下这类假阳性），SHALL 询问用户"当前不在该 change 对应的 worktree 中，是否仍在此继续实施，还是先切换"（SHALL NOT 在无法判断时默认跳过询问）；选"先切换"时的处理与"当前不在任何 worktree 内、选择切换"完全一致（见下）；选"仍在此继续实施"时按已匹配处理，直接进入实施。匹配时直接跳过、不询问。若当前不在任何 worktree 内，SHALL 询问用户一次是否要先切换到隔离 worktree——选"是"则调用 `/ly:worktree switch <change-name>`，其结果 SHALL 按"switch 结果统一判定规则"（见下）处理。选"否"则继续。确认继续（或已在匹配的 worktree 内）后，`/ly:apply` 必须（SHALL）调用 `opsx:apply` 并原样转发 `$ARGUMENTS`；实施完成后若存在实际文件变动，SHALL 提交本次实施产生的改动（提交信息形如 `apply: <change-name>`）；无变动则跳过, SHALL NOT 创建空 commit。提交后允许追加一句**不含具体 change 名**的通用提示（"如需隔离环境可用 `/ly:worktree switch <change-name>` 或先 `/ly:worktree list` 查看"），除此之外不得包含额外编排逻辑或状态查询。

**switch 结果统一判定规则**（`/ly:apply` 与 `/ly:propose` 共用）：`/ly:worktree switch` 是否算"切换成功"，SHALL 以其**是否最终输出续接命令**为唯一判定依据，不按"前置校验/baseline"分类处理：
- 输出了续接命令：SHALL 视为目标 worktree 已就位，直接结束当前编排。续接提示按以下组合规则确定，SHALL NOT 把多条适用说明拆成并列、互相独立的提示：
  - 不带 `--auto`、无 baseline 失败摘要：追加"运行 `/ly:apply` 继续"。
  - 不带 `--auto`、有 baseline 失败摘要：追加"处理完 baseline 失败问题后运行 `/ly:apply` 继续"。
  - 带 `--auto`（承诺"实施完成后自动依次调用 `/ly:review-code`"）、无 baseline 失败摘要：改写为一条连贯说明"运行 `/ly:apply` 继续实施（自动 commit），完成后自动依次调用 `/ly:review-code`"。
  - 带 `--auto`、有 baseline 失败摘要：两个约束都要保留，改写为"处理完 baseline 失败问题后，运行 `/ly:apply` 继续实施（自动 commit）；完成后自动依次调用 `/ly:review-code`"，SHALL NOT 因为合并 `--auto` 说明而丢失"先处理 baseline 问题"这个前置约束。
- 未输出续接命令，覆盖以下三种情况，均 SHALL 如实转述/报告对应原因并结束，SHALL NOT 输出上述续接提示，SHALL NOT 自动回退到"继续在当前工作区实施"：
  1. 分支拓扑校验等前置校验拒绝——转述 `switch` 返回的原始错误；
  2. baseline 失败且用户在 `switch` 内部询问中选择不继续——报告 baseline 失败摘要；
  3. `switch` 自身隔离检测触发的"是否仍要新建独立 worktree"询问被用户选择不创建——如实说明仍留在原 worktree、未发生切换。

`/ly:archive` 必须（SHALL）调用 `opsx:archive` 并原样转发 `$ARGUMENTS`；归档完成后若 `openspec/` 下存在实际文件变动（change 目录移动、`specs/` 同步更新等），SHALL 提交（提交信息形如 `archive: <change-name>`）；无变动或提交本身失败则跳过并如实报告, SHALL NOT 视为归档失败。

`/ly:propose` SHALL NOT 是纯委托——它是本能力集里唯一的编排入口：在调用 `opsx:propose` **之前** SHALL 先询问一次"本次收尾走全自动还是手动逐步确认"（不再是"要不要启用自动化收尾"的开关，而是选择两种不同的编排路径，只问一次）；委托 `opsx:propose` 完成后 SHALL 无条件对生成的 artifact 执行 commit（不受该选择影响）。全自动路径下 SHALL 依次调用 `/ly:review-plan <change-name>`（复用其默认逐轮自动提交行为），并在该循环以"Critical 清零"结束时询问是否调用 `/ly:worktree switch <change-name> --auto`；以其余任一原因终止时，SHALL 复用该循环已产出的终止报告（SHALL NOT 重新生成或重复一份），再询问是否新建隔离 worktree（调用时不带 `--auto`）。手动路径下 SHALL 在 commit 完成后先询问是否切换隔离 worktree（不带 `--auto`，选是则直接结束）；选否则询问是否要跑一次 `/ly:review-plan` 审查，选否则编排结束；选是则执行审查循环，循环以"Critical 清零"结束时再问一次 worktree（不带 `--auto`），以其余原因终止时同样复用循环已产出的终止报告再问一次 worktree（不带 `--auto`）。无论哪条路径，调用 `/ly:worktree switch` 的结果 SHALL 按上一条 Requirement 定义的"switch 结果统一判定规则"处理。以"验证失败"或"提交失败"终止且用户选择切换 worktree 时，若该 change 目录本身存在未提交改动导致 `switch` 的前置校验拒绝，属于该规则里的"前置校验拒绝"分支，转述其"请先处理未提交内容后重试"的原始报错即可，不需要额外的预检测逻辑。具体分支细节见 `ly-propose-flow` 能力。

#### Scenario: explore 命令原样转发参数
- **WHEN** 用户运行 `/ly:explore "real-time collaboration"`
- **THEN** 命令以未经改动的参数调用 `opsx:explore` 技能，不附加任何额外步骤

#### Scenario: archive 命令归档后自动提交
- **WHEN** 用户运行 `/ly:archive`，归档移动了 `openspec/changes/<change-name>/` 到 `archive/` 目录
- **THEN** 命令调用 `opsx:archive` 技能完成归档后, 提交 `openspec/` 下的文件移动, 提交信息形如 `archive: <change-name>`

#### Scenario: apply 命令不在 worktree 内时先问是否切换
- **WHEN** 用户在主工作区（非 worktree）运行 `/ly:apply`
- **THEN** 命令先询问是否要切换到隔离 worktree；选"是"则调用 `/ly:worktree switch <change-name>`，结果按"switch 结果统一判定规则"处理：输出续接命令则追加"运行 `/ly:apply` 继续"提示并结束，不执行本次 `opsx:apply`；选"否"则继续正常实施

#### Scenario: apply 命令已在匹配的 worktree 内时跳过询问
- **WHEN** 用户在 change X 的固定目标路径上运行的 worktree 内（该路径注册的分支严格等于 `X`）运行 `/ly:apply`
- **THEN** 命令跳过 worktree 询问，直接调用 `opsx:apply` 技能实施

#### Scenario: apply 命令已在不匹配的 worktree 内时询问是否继续
- **WHEN** 用户在 change A 的固定目标路径 worktree 内运行 `/ly:apply B`（当前路径不是 change B 的固定目标路径）
- **THEN** 命令询问"当前不在该 change 对应的 worktree 中，是否仍在此继续实施，还是先切换"，不直接静默在错误的 worktree 里实施

#### Scenario: 分支名相等但不在固定目标路径下时仍视为不匹配
- **WHEN** 用户手工在任意非固定目标路径（例如自己用 `git worktree add` 创建的路径）检出了与 `<change-name>` 同名的分支，运行 `/ly:apply`——当前路径不等于该 change 的固定目标路径
- **THEN** 命令视为不匹配，触发询问，SHALL NOT 仅因分支名相等，或仅因当前路径是某个已注册 worktree 的路径，就静默跳过（防止绕开隔离保护）

#### Scenario: detached HEAD 时视为不匹配
- **WHEN** 用户在某个 worktree 内处于 detached HEAD 状态运行 `/ly:apply B`，无法读取当前分支名
- **THEN** 命令视为不匹配，触发同上的询问，SHALL NOT 因为"无法判断"而默认跳过询问直接实施

#### Scenario: apply 命令在不匹配的 worktree 内选择先切换
- **WHEN** 上一 Scenario 中用户选择"先切换"
- **THEN** 命令调用 `/ly:worktree switch B`，结果按"switch 结果统一判定规则"处理：输出续接命令则追加提示并结束，不执行本次 `opsx:apply`；未输出续接命令则按规则里的三种情况分别转述

#### Scenario: switch 前置校验拒绝时转述错误并结束
- **WHEN** `/ly:apply` 询问后用户选择切换，但 `/ly:worktree switch <change-name>` 因分支拓扑校验失败被前置拒绝（未输出续接命令）
- **THEN** 命令转述 `switch` 返回的原始错误并结束，SHALL NOT 回退到"继续在当前工作区实施"

#### Scenario: baseline 失败且用户选择不继续时不输出续接提示
- **WHEN** `/ly:worktree switch` 创建/挂载了 worktree，但 baseline 验证失败，用户在 `switch` 内部询问中选择不继续（因而 `switch` 未输出续接命令）
- **THEN** 命令报告 baseline 失败摘要并结束，SHALL NOT 输出"运行 `/ly:apply` 继续"这类续接提示

#### Scenario: baseline 失败但用户选择继续时仍视为已就位
- **WHEN** `/ly:worktree switch` 的 baseline 验证失败，用户在 `switch` 内部询问中明确选择继续，`switch` 输出了携带失败摘要的续接命令
- **THEN** 命令视为目标 worktree 已就位，追加"处理完 baseline 失败问题后运行 `/ly:apply` 继续"的提示并结束，不执行本次 `opsx:apply`

#### Scenario: switch 内层询问被拒绝创建时不当作切换成功
- **WHEN** `/ly:apply` 询问后用户选择切换，`/ly:worktree switch` 检测到当前已在另一个 worktree 内并触发其自身的"是否仍要新建独立 worktree"询问，用户对这一内层询问选择"否"（未输出续接命令）
- **THEN** 命令如实说明仍留在原 worktree、未发生切换，并结束，SHALL NOT 输出"运行 `/ly:apply` 继续"这类误导性的续接提示

#### Scenario: 带 --auto 切换成功时续接提示合并为一条连贯说明
- **WHEN** 全自动路径下审查循环清零，`/ly:propose` 调用 `/ly:worktree switch <change-name> --auto` 并成功输出续接命令，且 baseline 验证通过（无失败摘要）
- **THEN** 续接提示 SHALL 是"运行 `/ly:apply` 继续实施（自动 commit），完成后自动依次调用 `/ly:review-code`"这一条连贯说明，SHALL NOT 把"运行 `/ly:apply` 继续"和 `--auto` 原有的审查续接说明分成两条并列、互相独立的提示

#### Scenario: 带 --auto 且 baseline 失败但用户选择继续时，提示同时保留两个约束
- **WHEN** 全自动路径下 `switch <change-name> --auto` 创建的 worktree baseline 验证失败，用户在 `switch` 内部询问中选择继续，`switch` 输出了携带失败摘要的续接命令
- **THEN** 续接提示 SHALL 是"处理完 baseline 失败问题后，运行 `/ly:apply` 继续实施（自动 commit）；完成后自动依次调用 `/ly:review-code`"，SHALL NOT 因为合并 `--auto` 续接说明而丢失"先处理 baseline 问题"这一前置约束

#### Scenario: 未指定 change 名时从当前 worktree 反查成功
- **WHEN** 用户在某个 worktree 内运行 `/ly:apply`（未在 `$ARGUMENTS` 里指定 change 名），当前路径恰好等于唯一一个未归档 change 的固定目标路径，且该路径注册的分支严格等于该 change 名
- **THEN** 命令反查得到该 change 名并按其继续隔离检测流程，不询问用户

#### Scenario: 反查失败时进入下一优先级或询问用户
- **WHEN** 用户在某个 worktree 内运行 `/ly:apply`（未指定 change 名），当前路径不等于任何未归档 change 的固定目标路径
- **THEN** 反查视为失败，命令按解析优先级继续尝试"`openspec/changes/` 下唯一未归档 change"，仍无法唯一确定时直接询问用户，SHALL NOT 猜测

#### Scenario: apply 命令实施后自动提交并追加通用提示
- **WHEN** 用户运行 `/ly:apply`（已确认继续实施或已在匹配的 worktree 内）, 实施产生了文件改动
- **THEN** 命令调用 `opsx:apply` 技能完成实施后，提交本次实施改动（`apply: <change-name>`），再追加一句不含具体 change 名的通用 worktree 切换提示，不查询真实 change 名，不新增其他编排逻辑

#### Scenario: apply 命令无变动时不创建空提交
- **WHEN** 用户运行 `/ly:apply`, 但 tasks 本身无实际产出（或已被上一轮审查循环提交）
- **THEN** 命令跳过 commit 步骤, 不创建空提交, 仍追加通用 worktree 提示

#### Scenario: propose 命令在委托前先问全自动/手动
- **WHEN** 用户运行 `/ly:propose "add dark mode"`
- **THEN** 命令先询问本次走全自动还是手动逐步确认，再以未经改动的参数 `"add dark mode"` 调用 `opsx:propose` 技能；委托完成后无论选择哪种路径都会提交生成的 artifact

#### Scenario: propose 命令全自动路径下的编排
- **WHEN** 用户运行 `/ly:propose`，选择"全自动"
- **THEN** 委托并提交后，命令自动调用 `/ly:review-plan`（默认逐轮自动提交）；该审查-修复循环以 Critical 清零结束时，命令询问是否切换隔离 worktree，选"是"则调用 `/ly:worktree switch --auto`；以其余原因终止时，命令复用循环已产出的终止报告再询问是否新建隔离 worktree（不带 `--auto`）
