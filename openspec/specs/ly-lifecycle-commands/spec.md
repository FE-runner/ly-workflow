## Purpose

提供五个统一前缀的 `/ly:*` 命令：`explore` 是纯委托（不附加自定义编排逻辑）；`init`/`archive` 各自委托对应的 Claude Code 原生 `init` 技能或 OpenSpec 原生 `fsaw`/`archive` 技能并在完成后自动提交本步骤产生的文件变动（`apply` 委托 `opsx:apply` 在**当前工作区**实施 tasks，实施完成后立即提交 `apply: <change-name>`——无隔离检测、不暂存区持有，隔离 worktree 由 `/ly:propose` 创建方案前决定）；`propose` 是收尾编排的入口——委托 `opsx:propose` 生成方案之外，还负责创建方案前的 worktree 询问（不在 worktree 内才问，从当前分支 HEAD 切出）、全自动/手动询问、每步 commit（`propose: <change-name>`）与全自动流水线（review-plan → apply → review-code）。

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

### Requirement: Explore 命令是纯委托；Apply 委托 Implementer agent 实施完成立即提交；Propose 是编排入口
`/ly:explore` 必须（SHALL）只调用 `opsx:explore`，原样转发 `$ARGUMENTS`，不得包含自定义的多模型分派、环境校验，或超出底层技能本身的输出后处理逻辑。

`/ly:apply` SHALL 在委托实施**之前**解析目标 change 名：按固定优先级 `$ARGUMENTS` 中显式且合法的 change 名 → `openspec/changes/` 下唯一未归档的 change → 无法唯一确定时直接询问用户。SHALL NOT 使用"当前 worktree 反查"或"固定目标路径匹配"（新模型下 worktree 目录/分支锁定为开发分支名、不等于 change 名，不存在可反查的固定路径映射）。`/ly:apply` SHALL NOT 再执行基于 `/ly:worktree switch` 的隔离检测——是否隔离由 `/ly:propose` 在创建方案前决定；apply 只负责在**当前工作区**（无论是否 worktree）实施 tasks。`/ly:apply` SHALL NOT 调用 `/ly:worktree switch`，其会话尾部 SHALL NOT 再提示"如需隔离环境可用 `/ly:worktree switch ...`"。

`/ly:apply` SHALL NOT 直接调用 `opsx:apply` 让 Claude 自己实施代码——实施步骤 SHALL 读取 `routing.implementer`，委托 `codeagent-wrapper --backend <routing.implementer>`（`ROLE_FILE` 指向 `builder.md`）以单次 agentic 调用完成全部 tasks（具体行为见 `optional-implementer-agent` 能力）。

Implementer agent 返回 `OVERALL: PASS` 后 SHALL 检查是否有实际文件变动（`git status --porcelain`）。有变动时 SHALL `git add` 本次实际改动的文件，然后**立即 commit**（提交信息 `apply: <change-name>`）；无变动则跳过，SHALL NOT 创建空 commit。该 commit 即为 `/ly:review-code` 的审查对象（见 `ly-propose-flow` 的"审查对象 = 最近一次相关 commit"）。若 `git commit` 失败，如实报告 Git 返回的原始错误。返回 `OVERALL: FAIL` 或调用本身失败时的处理见 `optional-implementer-agent` 能力，不执行提交。

若实施前工作区已存在该 change 目录之外的未提交改动（如审查修复残留），`/ly:apply` SHALL 先检查 `git status --porcelain`：存在与本次实施无关的预存改动时，`git add` 范围仅限本次 Implementer agent 实际改动的文件，SHALL NOT 将预存改动一并暂存/提交，并在报告中说明"预存改动未被提交"。

`/ly:archive` 必须（SHALL）调用 `opsx:archive` 并原样转发 `$ARGUMENTS`；归档完成后若 `openspec/` 下存在实际文件变动，SHALL 提交（提交信息形如 `archive: <change-name>`）；无变动或提交本身失败则跳过并如实报告。

`/ly:propose` SHALL NOT 是纯委托——它是本能力集里唯一的编排入口：在调用 `opsx:propose` **之前** SHALL 先执行一次 worktree 询问（见 `worktree-create-before-propose`，仅当不在任何 worktree 内时询问，全局仅一次，选择切换则打印续接命令结束本次会话），再询问一次"本次收尾走全自动还是手动逐步确认"（也仅一次）；委托 `opsx:propose` 完成后 SHALL 对生成的 artifact `git add` 并**立即 commit**（`propose: <change-name>`，见 `ly-propose-flow`），再按自动/手动两路径分支：全自动路径 SHALL 依次自动调用 `/ly:review-plan <change-name>` → `/ly:apply <change-name>` → `/ly:review-code <change-name>`（任一非清零终止即停，见 `ly-propose-flow`；全程无 worktree 询问/switch 调用）；手动路径 SHALL 询问一次"要不要跑 review-plan 审查"，选是则调用审查循环，选否则编排结束（方案已 commit）。具体分支细节见 `ly-propose-flow` 能力。

#### Scenario: explore 命令原样转发参数
- **WHEN** 用户运行 `/ly:explore "real-time collaboration"`
- **THEN** 命令以未经改动的参数调用 `opsx:explore` 技能，不附加任何额外步骤

#### Scenario: archive 命令归档后自动提交
- **WHEN** 用户运行 `/ly:archive`，归档移动了 `openspec/changes/<change-name>/` 到 `archive/` 目录
- **THEN** 命令调用 `opsx:archive` 技能完成归档后, 提交 `openspec/` 下的文件移动, 提交信息形如 `archive: <change-name>`

#### Scenario: apply 委托 Implementer agent，PASS 后立即提交，不再暂存区持有
- **WHEN** 用户运行 `/ly:apply`，`routing.implementer` 为某个后端，Implementer agent 实施后返回 `OVERALL: PASS` 且产生实际文件变动
- **THEN** 命令 `git add` 本次实际改动的文件后立即 `git commit -m "apply: <change-name>"`，作为 `/ly:review-code` 的审查对象；不再询问是否提交、不存在暂存区持有

#### Scenario: apply 实施前工作区已有与本次无关的预存改动
- **WHEN** 用户在某个 worktree 内运行 `/ly:apply`，实施前该 worktree 已存在未提交的预存改动（如 review 修复残留），Implementer agent 实施产生新的实际改动并返回 `OVERALL: PASS`
- **THEN** 命令 `git add` 仅限本次 Implementer agent 实际改动的文件，SHALL NOT 将预存改动一并暂存/提交，并说明"预存改动未被提交"

#### Scenario: apply 不在 worktree 内时直接在当前工作区实施
- **WHEN** 用户在主工作区（非 worktree）运行 `/ly:apply`
- **THEN** 命令不询问是否切换 worktree、不调用 `/ly:worktree switch`，直接在当前工作区委托 Implementer agent 实施 tasks

#### Scenario: apply 无实际文件变动, 跳过提交
- **WHEN** 用户运行 `/ly:apply`，Implementer agent 返回 `OVERALL: PASS` 后 `git status --porcelain` 无任何变动
- **THEN** 命令跳过提交, 不创建空 commit

#### Scenario: propose 命令在委托前先问 worktree 再问全自动/手动
- **WHEN** 用户在主工作区运行 `/ly:propose "add dark mode"`（未隔离）
- **THEN** 命令先询问是否切到隔离 worktree；选"是"则 `git worktree add` 切换到 worktree 并打印续接命令结束本次会话；选"否"则询问"全自动 or 手动"；已在 worktree 内则跳过 worktree 询问直接询问"全自动 or 手动"，再以原样参数调用 `opsx:propose`；委托完成后 `git add` 该 change 目录并立即 commit `propose: <change-name>`

#### Scenario: propose 命令全自动路径下的编排
- **WHEN** 用户运行 `/ly:propose`，选择"全自动"，`propose:` commit 完成
- **THEN** 命令自动调用 `/ly:review-plan`（审查对象为 `propose:` commit，清零时由循环统一提交修复）；清零后自动进入 `/ly:apply`（实施完立即 commit）→ 自动进入 `/ly:review-code`（审查对象为 `apply:` commit）；任一环节非清零终止则停止流水线并报告；全程无 worktree 询问、无 `/ly:worktree switch` 调用，不自动归档