## Purpose

提供五个统一前缀的 `/ly:*` 命令：`explore` 是纯委托（不附加自定义编排逻辑）；`init`/`archive` 各自委托对应的 Claude Code 原生 `init` 技能或 OpenSpec 原生 `fsaw`/`archive` 技能并在完成后自动提交本步骤产生的文件变动（`apply` 委托 `opsx:apply` 实施后将改动暂存、默认不自动提交，仅在用户明确跳过 review-code 审查时询问是否提交）；`propose` 是收尾编排的入口——委托 `opsx:propose` 生成方案之外，还负责总开关询问、暂存产物、审查循环调用与隔离 worktree 询问。

## Requirements

### Requirement: init 命令串联 CLAUDE.md 生成、OpenSpec 初始化与提交
`/ly:init` 必须（SHALL）按顺序执行三步：（1）调用原生 `init` 技能生成/更新 CLAUDE.md；（2）确保 `openspec` CLI 已安装，然后运行 `openspec init` 搭建 `openspec/` 目录结构；（3）若步骤 1-2 产生了实际文件变动，暂存 `CLAUDE.md`、`openspec/` 并执行一次 commit。前两步都不得静默跳过；如果 `openspec` CLI 未安装，命令必须先安装它再继续。第三步若无可提交内容或 `git commit` 本身失败，SHALL 跳过提交并在汇总中如实报告，SHALL NOT 因此中断或视为命令失败。

#### Scenario: 全新项目, 既无 CLAUDE.md 也无 openspec/ 目录
- **WHEN** 用户在既无 CLAUDE.md 也无 `openspec/` 目录的项目中运行 `/ly:init`
- **THEN** 命令通过原生 `init` 技能生成 CLAUDE.md, 同时通过 `openspec init` 初始化 `openspec/`, 并提交这两部分产物

#### Scenario: openspec CLI 未安装
- **WHEN** 用户运行 `/ly:init` 且 PATH 中找不到 `openspec` 命令
- **THEN** 命令先全局安装 `@fission-ai/openspec`, 再运行 `openspec init`, 完成后提交产物

#### Scenario: init 无新变动, 跳过提交
- **WHEN** 用户在 CLAUDE.md 与 `openspec/` 均已存在且未发生变化的项目中运行 `/ly:init`
- **THEN** 命令跳过 commit 步骤，在汇总中如实说明无变动可提交，不视为失败

### Requirement: Explore 命令是纯委托；Apply 暂存实施产物并在手动模式下询问提交；Propose 是编排入口
`/ly:explore` 必须（SHALL）只调用 `opsx:explore`，原样转发 `$ARGUMENTS`，不得包含自定义的多模型分派、环境校验，或超出底层技能本身的输出后处理逻辑。

`/ly:apply` 在调用 `opsx:apply` **之前** 必须（SHALL）先做一次隔离检测（复用 `/ly:worktree` Add 步骤的隔离检测逻辑）。

**该 change 的固定目标路径**：`<主仓库上级目录>/.ly/<主仓库目录名>/<change-name>`——即 `/ly:worktree switch <change-name>`（不带 `--auto`/`--local` 等选项时）创建/挂载该 change 的 worktree 所使用的默认路径。"主仓库"SHALL 以 `git rev-parse --git-common-dir` 解析出的公共 Git 目录反推其所在的主工作树位置为准，SHALL NOT 依据当前调用发生时所处 worktree 的相对路径推导——保证从任意 worktree 调用 `/ly:apply` 或 `/ly:worktree switch` 时，对同一个 change 算出的固定目标路径始终一致。本次不承认 `--local` 项目内路径为受控目标路径。判断某个 worktree "是否为该 change 的受控目标 worktree"，SHALL 同时满足：（1）该 worktree 根路径（`git rev-parse --show-toplevel`）严格等于上述固定目标路径；（2）`git worktree list --porcelain` 中该固定路径下注册的分支名严格等于 `<change-name>`。`/ly:apply` SHALL 每次独立读取当前 canonical 路径与 `git worktree list --porcelain` 完成这两个条件的判定，不依赖、不假设本次会话之前是否调用过 `/ly:worktree switch`。仅凭"当前分支名等于 change 名"或"当前路径等于某个已注册 worktree 的路径"任一条件成立，SHALL NOT 视为匹配——必须是"固定目标路径"与"该路径下注册的分支"同时对得上，防止用户在任意非固定路径手工检出同名分支后被误判为已匹配。本条判定的目标是**防误操作，不是防故意绕过**。

目标 `<change-name>` 的解析 SHALL 按固定优先级：`$ARGUMENTS` 中显式且合法的 change 名 → 当前 worktree 反查出的受控 change（枚举 `openspec/changes/` 下未归档的 change 名，对每个候选按上述固定目标路径规则计算，检查当前 worktree 根路径是否等于其中之一；恰好一个匹配则采用该 change 名，零个或多个匹配则视为反查失败，进入下一优先级）→ `openspec/changes/` 下唯一未归档的 change → 无法唯一确定时直接询问用户；任何一步无法唯一确定都 SHALL NOT 继续调用 `switch` 或执行 `opsx:apply`，直到用户给出明确答案。

若当前已在某个 worktree 内，"匹配目标 change" SHALL 就是"当前 worktree 是否为该 change 的受控目标 worktree"（定义见上）；不匹配（含反查失败、detached HEAD 无法读取分支名、或分支名相等但不在固定目标路径下这类假阳性），SHALL 询问用户"当前不在该 change 对应的 worktree 中，是否仍在此继续实施，还是先切换"（SHALL NOT 在无法判断时默认跳过询问）；选"先切换"时的处理与"当前不在任何 worktree 内、选择切换"完全一致（见下）；选"仍在此继续实施"时按已匹配处理，直接进入实施。匹配时直接跳过、不询问。若当前不在任何 worktree 内，SHALL 询问用户一次是否要先切换到隔离 worktree——选"是"则调用 `/ly:worktree switch <change-name>`，其结果 SHALL 按"switch 结果统一判定规则"（见下）处理。选"否"则继续。确认继续（或已在匹配的 worktree 内）后，`/ly:apply` 必须（SHALL）调用 `opsx:apply` 并原样转发 `$ARGUMENTS`。

**实施完成后的提交行为**（取代"实施后自动提交"）：实施完成后 SHALL 检查是否有实际文件变动（`git status --porcelain`）。有变动时，SHALL `git add` 本次实际改动的文件（暂存范围限于本次会话实际改动的文件，不做无关文件的批量暂存），**默认不立即 commit**——与自动/手动模式无关，apply 本身 SHALL NOT 无条件自动提交实施产物。产物以暂存区状态存在，供后续 `/ly:review-code` 审查。若 `/ly:apply` 由上层编排（`/ly:propose` 的 worktree 续接，带或不带 `--auto`）触发、预期后续衔接 review-code 审查，则应用到"暂存区持有"为止。**当用户明确表示跳过 review-code 审查**（例如直接回复不跑审查、或上层编排中确认不需要审查）时，`/ly:apply` SHALL 询问用户是否提交实施产物：选"是"则执行 commit（提交信息形如 `apply: <change-name>`）；选"否"则产物留在暂存区。无变动则跳过, SHALL NOT 创建空 commit。提交后允许追加一句**不含具体 change 名**的通用提示（"如需隔离环境可用 `/ly:worktree switch <change-name>` 或先 `/ly:worktree list` 查看"），除此之外不得包含额外编排逻辑或状态查询。

**switch 结果统一判定规则**（`/ly:apply` 与 `/ly:propose` 共用）：`/ly:worktree switch` 是否算"切换成功"，SHALL 以其**是否最终输出续接命令**为唯一判定依据，不按"前置校验/baseline"分类处理：
- 输出了续接命令：SHALL 视为目标 worktree 已就位，直接结束当前编排。续接提示按以下组合规则确定，SHALL NOT 把多条适用说明拆成并列、互相独立的提示：
  - 不带 `--auto`、无 baseline 失败摘要：追加"运行 `/ly:apply` 继续"。
  - 不带 `--auto`、有 baseline 失败摘要：追加"处理完 baseline 失败问题后运行 `/ly:apply` 继续"。
  - 带 `--auto`（承诺"实施完成后自动依次调用 `/ly:review-code`"）、无 baseline 失败摘要：改写为一条连贯说明"运行 `/ly:apply` 继续实施（完成后自动依次调用 `/ly:review-code`）"。
  - 带 `--auto`、有 baseline 失败摘要：两个约束都要保留，改写为"处理完 baseline 失败问题后，运行 `/ly:apply` 继续实施（完成后自动依次调用 `/ly:review-code`）"——`--auto` 续接文案中不再包含"自动 commit"字样（apply 已不再自动 commit）。
- 未输出续接命令，覆盖以下三种情况，均 SHALL 如实转述/报告对应原因并结束，SHALL NOT 输出上述续接提示，SHALL NOT 自动回退到"继续在当前工作区实施"：
  1. 分支拓扑校验等前置校验拒绝——转述 `switch` 返回的原始错误；
  2. baseline 失败且用户在 `switch` 内部询问中选择不继续——报告 baseline 失败摘要；
  3. `switch` 自身隔离检测触发的"是否仍要新建独立 worktree"询问被用户选择不创建——如实说明仍留在原 worktree、未发生切换。

`/ly:archive` 必须（SHALL）调用 `opsx:archive` 并原样转发 `$ARGUMENTS`；归档完成后若 `openspec/` 下存在实际文件变动（change 目录移动、`specs/` 同步更新等），SHALL 提交（提交信息形如 `archive: <change-name>`）；无变动或提交本身失败则跳过并如实报告, SHALL NOT 视为归档失败。

`/ly:propose` SHALL NOT 是纯委托——它是本能力集里唯一的编排入口：在调用 `opsx:propose` **之前** SHALL 先询问一次"本次收尾走全自动还是手动逐步确认"（只问一次）；委托 `opsx:propose` 完成后 SHALL 对生成的 artifact 执行 `git add` 暂存（SHALL NOT 无条件立即 commit，详见 `ly-propose-flow` 的"生成完 artifact 暂存到暂存区"Requirement），再按自动/手动两路径分支简要描述：全自动路径 SHALL 依次调用 `/ly:review-plan <change-name>`（清零时由循环统一提交），并在该循环以"Critical 清零"结束时询问是否调用 `/ly:worktree switch <change-name> --auto`；以其余任一原因终止时，SHALL 复用该循环已产出的终止报告，按 `ly-propose-flow` 的"手动路径下非清零终止时询问是否提交"处理提交后，再询问是否新建隔离 worktree（调用时不带 `--auto`）。手动路径下 SHALL 在暂存产物后先询问是否切换隔离 worktree（不带 `--auto`，选是则直接结束）；选否则询问是否要跑一次 `/ly:review-plan` 审查，选否则按"手动路径下跳过审查时询问是否提交"处理提交后结束；选是则执行审查循环，循环以"Critical 清零"结束时再问一次 worktree（不带 `--auto`），以其余原因终止时复用循环已产出的终止报告再问一次 worktree（不带 `--auto`）。无论哪条路径，调用 `/ly:worktree switch` 的结果 SHALL 按上一条 Requirement 定义的"switch 结果统一判定规则"处理。以"验证失败"或"提交失败"终止且用户选择切换 worktree 时，若该 change 目录本身存在未提交改动导致 `switch` 的前置校验拒绝，属于该规则里的"前置校验拒绝"分支，转述其"请先处理未提交内容后重试"的原始报错即可，不需要额外的预检测逻辑。具体分支细节见 `ly-propose-flow` 能力。

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

#### Scenario: 带 --auto 切换成功时续接提示合并为一条连贯说明, 且不含"自动 commit"
- **WHEN** 全自动路径下审查循环清零，`/ly:propose` 调用 `/ly:worktree switch <change-name> --auto` 并成功输出续接命令，且 baseline 验证通过（无失败摘要）
- **THEN** 续接提示 SHALL 是"运行 `/ly:apply` 继续实施（完成后自动依次调用 `/ly:review-code`）"这一条连贯说明，SHALL NOT 包含"自动 commit"字样，SHALL NOT 把"运行 `/ly:apply` 继续"和 `--auto` 原有的审查续接说明分成两条并列、互相独立的提示

#### Scenario: 带 --auto 且 baseline 失败但用户选择继续时，提示同时保留两个约束
- **WHEN** 全自动路径下 `switch <change-name> --auto` 创建的 worktree baseline 验证失败，用户在 `switch` 内部询问中选择继续，`switch` 输出了携带失败摘要的续接命令
- **THEN** 续接提示 SHALL 是"处理完 baseline 失败问题后，运行 `/ly:apply` 继续实施（完成后自动依次调用 `/ly:review-code`）"，SHALL NOT 因为合并 `--auto` 续接说明而丢失"先处理 baseline 问题"这一前置约束，SHALL NOT 包含"自动 commit"字样

#### Scenario: 未指定 change 名时从当前 worktree 反查成功
- **WHEN** 用户在某个 worktree 内运行 `/ly:apply`（未在 `$ARGUMENTS` 里指定 change 名），当前路径恰好等于唯一一个未归档 change 的固定目标路径，且该路径注册的分支严格等于该 change 名
- **THEN** 命令反查得到该 change 名并按其继续隔离检测流程，不询问用户

#### Scenario: 反查失败时进入下一优先级或询问用户
- **WHEN** 用户在某个 worktree 内运行 `/ly:apply`（未指定 change 名），当前路径不等于任何未归档 change 的固定目标路径
- **THEN** 反查视为失败，命令按解析优先级继续尝试"`openspec/changes/` 下唯一未归档 change"，仍无法唯一确定时直接询问用户，SHALL NOT 猜测

#### Scenario: apply 实施完成后改动入暂存区, 不自动提交
- **WHEN** 用户在主工作区运行 `/ly:apply`, 实施产生实际文件变动
- **THEN** 命令 `git add` 本次实际改动的文件后 SHALL NOT 立即 commit——产物以暂存区状态存在, 供后续 `/ly:review-code` 审查; 仅当用户明确表示跳过 review-code 审查时, 才询问是否提交实施产物

#### Scenario: apply 用户明确跳过 review-code 审查, 询问是否提交
- **WHEN** 实施完成后用户明确表示不跑 review-code 审查
- **THEN** `/ly:apply` 询问用户是否提交实施产物; 选"是"则 commit（`apply: <change-name>`）, 选"否"则产物留在暂存区——SHALL NOT 无条件自动提交

#### Scenario: apply 无实际文件变动, 跳过提交
- **WHEN** 用户运行 `/ly:apply` 实施完成后 `git status --porcelain` 无任何变动（tasks 无产出, 或产物已在上游步骤暂存）
- **THEN** 命令跳过提交, 不创建空 commit

#### Scenario: propose 命令在委托前先问全自动/手动
- **WHEN** 用户运行 `/ly:propose "add dark mode"`
- **THEN** 命令先询问本次走全自动还是手动逐步确认，再以未经改动的参数 `"add dark mode"` 调用 `opsx:propose` 技能；委托完成后将生成的 artifact 暂存，提交时机按所选路径分支决定（全自动由 review-plan 清零时统一提交，手动由 `/ly:propose` 在跳过审查或非清零终止时询问用户）

#### Scenario: propose 命令全自动路径下的编排
- **WHEN** 用户运行 `/ly:propose`，选择"全自动"
- **THEN** 暂存产物后，命令自动调用 `/ly:review-plan`（产物保持暂存区状态，清零时由循环统一提交）；该审查-修复循环以 Critical 清零结束时，命令询问是否切换隔离 worktree，选"是"则调用 `/ly:worktree switch --auto`；以其余原因终止时，命令按"手动路径下非清零终止时询问是否提交"处理提交后，复用循环已产出的终止报告再询问是否新建隔离 worktree（不带 `--auto`）
