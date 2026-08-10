## Purpose

提供五个统一前缀的 `/ly:*` 命令：`explore` 是纯委托（不附加自定义编排逻辑）；`init`/`apply`/`archive` 各自委托对应的 Claude Code 原生 `init` 技能或 OpenSpec 原生 `apply`/`archive` 技能，并在完成后自动提交本步骤产生的文件变动；`propose` 是收尾编排的入口——委托 `opsx:propose` 生成方案之外，还负责总开关询问、commit、审查循环调用与隔离 worktree 询问。

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

### Requirement: Explore 命令是纯委托；Apply/Archive 委托对应技能并自动提交；Propose 是编排入口
`/ly:explore` 必须（SHALL）只调用 `opsx:explore`，原样转发 `$ARGUMENTS`，不得包含自定义的多模型分派、环境校验，或超出底层技能本身的输出后处理逻辑。

`/ly:apply` 必须（SHALL）调用 `opsx:apply` 并原样转发 `$ARGUMENTS`；实施完成后若存在实际文件变动，SHALL 提交本次实施产生的改动（提交信息形如 `apply: <change-name>`）；无变动则跳过, SHALL NOT 创建空 commit。提交后允许追加一句**不含具体 change 名**的通用提示（"如需隔离环境可用 `/ly:worktree switch <change-name>` 或先 `/ly:worktree list` 查看"），除此之外不得包含额外编排逻辑或状态查询。

`/ly:archive` 必须（SHALL）调用 `opsx:archive` 并原样转发 `$ARGUMENTS`；归档完成后若 `openspec/` 下存在实际文件变动（change 目录移动、`specs/` 同步更新等），SHALL 提交（提交信息形如 `archive: <change-name>`）；无变动或提交本身失败则跳过并如实报告, SHALL NOT 视为归档失败。

`/ly:propose` SHALL NOT 是纯委托——它是本能力集里唯一的编排入口：在调用 `opsx:propose` **之前** SHALL 先询问一次自动化总开关（是否走审查循环 + worktree 询问 + 隔离后自动续接实施与审查，只问一次）；委托 `opsx:propose` 完成后 SHALL 无条件对生成的 artifact 执行 commit（不受总开关影响）；当总开关为"是"时 SHALL 依次调用 `/ly:review-plan <change-name>`（复用其默认逐轮自动提交行为），并在该循环以"Critical 清零"结束时询问是否调用 `/ly:worktree switch <change-name> --auto`。

#### Scenario: explore 命令原样转发参数
- **WHEN** 用户运行 `/ly:explore "real-time collaboration"`
- **THEN** 命令以未经改动的参数调用 `opsx:explore` 技能，不附加任何额外步骤

#### Scenario: archive 命令归档后自动提交
- **WHEN** 用户运行 `/ly:archive`，归档移动了 `openspec/changes/<change-name>/` 到 `archive/` 目录
- **THEN** 命令调用 `opsx:archive` 技能完成归档后, 提交 `openspec/` 下的文件移动, 提交信息形如 `archive: <change-name>`

#### Scenario: apply 命令实施后自动提交并追加通用提示
- **WHEN** 用户运行 `/ly:apply`, 实施产生了文件改动
- **THEN** 命令调用 `opsx:apply` 技能完成实施后，提交本次实施改动（`apply: <change-name>`），再追加一句不含具体 change 名的通用 worktree 切换提示，不查询真实 change 名，不新增其他编排逻辑

#### Scenario: apply 命令无变动时不创建空提交
- **WHEN** 用户运行 `/ly:apply`, 但 tasks 本身无实际产出（或已被上一轮审查循环提交）
- **THEN** 命令跳过 commit 步骤, 不创建空提交, 仍追加通用 worktree 提示

#### Scenario: propose 命令在委托前先问总开关
- **WHEN** 用户运行 `/ly:propose "add dark mode"`
- **THEN** 命令先询问是否启用自动化收尾流程，再以未经改动的参数 `"add dark mode"` 调用 `opsx:propose` 技能；委托完成后无论总开关选择如何都会提交生成的 artifact

#### Scenario: propose 命令总开关开启时的编排
- **WHEN** 用户运行 `/ly:propose`，总开关选择"是"
- **THEN** 委托并提交后，命令自动调用 `/ly:review-plan`（默认逐轮自动提交）；该审查-修复循环以 Critical 清零结束时，命令询问是否切换隔离 worktree，选"是"则调用 `/ly:worktree switch --auto`
