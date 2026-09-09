## MODIFIED Requirements

### Requirement: propose 在创建方案前询问一次是否切隔离 worktree，从当前分支切入
`/ly:propose` SHALL 在委托 `opsx:propose` 之前，先检测当前是否已处于某个 worktree 内（比较 `git rev-parse --git-dir` 与 `--git-common-dir`，并排除子模块误判）。若已在 worktree 内，SHALL 跳过 worktree 询问（隔离已存在，切换无意义），直接进入"全自动/手动"询问。若不在任何 worktree 内，SHALL 询问用户一次"是否切到隔离 worktree"；该询问 SHALL 只在流程开始时出现一次，整个 propose 收尾流程中 SHALL NOT 再出现任何 worktree 询问或切换动作。

用户选择切换时，SHALL 执行 `git worktree add -b <开发分支名> <路径> <当前分支HEAD>` 从**当前分支 HEAD** 切出新 worktree——不是从默认分支、不做分支拓扑校验。切换前 SHALL 检查当前工作区的未提交改动（`git status --porcelain`）：存在未提交草稿时 SHALL 提示"当前工作区的未提交改动将留在原 worktree、不会带入新 worktree"，待用户确认后再切换。worktree 目录 SHALL 为 `~/.ly/worktrees/<项目名>/<开发分支名>`（单层平铺，无来源前缀；`<项目名>` 以 `git rev-parse --git-common-dir` 反推主仓库目录名）。`<开发分支名>` SHALL 由用户/流程在切换时确定（约定为本次开发的开发分支名），可含 `/`（如 `feature/xxx`，此时 worktree 路径按 `/` 展开为 `~/.ly/worktrees/<项目名>/feature/xxx`，同时保持无来源前缀的语义）。worktree 目录与分支 SHALL 锁定为 `<开发分支名>`，SHALL NOT 因后续 change 名与开发分支名不同而对 worktree/分支重命名（change 在 worktree 内生成，是 worktree 的产物而非命名依据）。

切换后 SHALL 复用 `/ly:worktree add` 的后续流程：自动复制环境文件、运行一次项目 baseline 验证（复用 worktree.md 的 baseline 规则）。

**baseline 验证通过后，当前会话 SHALL 立即以绝对路径 `cd` 进入新 worktree（Bash 工作目录在会话内持久生效），并在同一会话内继续执行 propose 编排的后续步骤（"全自动/手动"询问 → `opsx:propose` → 方案自审 → commit → 按所选路径收尾）。** 自 cd 进 worktree 之时起，本次 propose 编排的所有 Git 操作、openspec 命令与文件读写 SHALL 以 worktree 为工作目录（文件操作用 worktree 绝对路径），SHALL NOT 回到主仓库路径执行本次 change 的任何产物操作。SHALL 在进入 worktree 的同时打印一次续接命令（`cd <worktree绝对路径> && claude "继续 在隔离 worktree 中 /ly:propose <同一需求>"`，绝对路径 + shell 安全转义）——该命令 SHALL NOT 是正常路径的必经交接步骤，而是**会话异常死亡（崩溃、终端意外关闭等）时的降级兜底**：正常路径下当前会话直接续跑，用户无需使用该命令。

baseline 失败时，SHALL 报告失败摘要并询问用户：选择"仍继续"→ 同会话 cd 进 worktree 继续（失败摘要 SHALL 作为已知风险带入后续流程）；选择"放弃"→ SHALL 保留已创建的 worktree 与分支（SHALL NOT 自动清理），打印携带失败摘要的兜底续接命令，会话结束，change 尚未生成。

若用户在询问中选择"否"，留在当前工作区继续，SHALL 不创建 worktree，直接进入"全自动/手动"询问。

#### Scenario: 裸工作区发起 propose，选择切换后会话续跑
- **WHEN** 用户在主工作区（非 worktree）执行 `/ly:propose "fix-login"`，询问 worktree 后选择"是"，baseline 验证通过
- **THEN** 命令以 `git worktree add -b fix-login ~/.ly/worktrees/<项目名>/fix-login <当前分支HEAD>` 切出 worktree、复制环境文件、通过 baseline 后打印兜底续接命令，**当前会话 cd 进该 worktree 并在同一会话内继续**"全自动/手动"询问及后续编排；`opsx:propose` 在本次会话内被调用，change 生成并 commit 在 worktree 分支上

#### Scenario: 兜底续接命令仅在会话异常死亡时使用
- **WHEN** 切换 worktree 后当前会话因崩溃或终端关闭意外终止，用户重新打开终端
- **THEN** 用户可凭已打印的 `cd <worktree绝对路径> && claude "继续 /ly:propose <同一需求>"` 命令在新会话中恢复；若会话正常存活，该命令不被使用

#### Scenario: baseline 失败选择仍继续
- **WHEN** baseline 验证失败，用户在询问中选择"仍继续"
- **THEN** 当前会话 cd 进 worktree 继续编排，失败摘要作为已知风险带入后续流程，`propose:` commit 正常落 worktree 分支

#### Scenario: baseline 失败选择放弃
- **WHEN** baseline 验证失败，用户在询问中选择"放弃"
- **THEN** 已创建的 worktree 与分支被保留不自动清理，打印携带失败摘要的兜底续接命令，会话结束，change 尚未生成

#### Scenario: 会话内所有操作以 worktree 为工作目录
- **WHEN** 当前会话已 cd 进 worktree 并继续编排（生成 artifacts、commit、跑 review/apply 流水线）
- **THEN** 所有 `git`/`openspec` 命令作用于 worktree（`propose:`/`apply:` commit 落在 worktree 分支上），文件读写使用 worktree 绝对路径，主仓库工作区不产生本次 change 的任何变动

#### Scenario: 已在 worktree 内，跳过 worktree 询问
- **WHEN** 用户在某个隔离 worktree 内执行 `/ly:propose "fix-login"`
- **THEN** 命令跳过"是否切隔离 worktree"询问，直接进入"全自动/手动"询问并继续 generate/commit/review，全程不再出现任何 worktree 询问

#### Scenario: 裸工作区发起 propose，选择不切换
- **WHEN** 用户在主工作区执行 `/ly:propose`，询问 worktree 后选择"否"
- **THEN** 命令不创建 worktree，留在当前工作区，直接进入"全自动/手动"询问并继续后续流程

### Requirement: worktree 在 change 之后不对其重命名；change 名与开发分支名解耦
系统 SHALL NOT 在 `opsx:propose` 生成 change 后将 worktree 目录或分支从 `<开发分支名>` 重命名为 change 名。change 名 SHALL 由 `opsx:propose` 在 worktree 内生成（沿用快照比对确定真实 change 名），与 worktree 目录名/分支名 SHALL NOT 要求一致（例如 worktree 目录为 `feature/login`、change 名为 `add-user-auth`，两者并行存在）。`/ly:apply` 的目标 worktree 定位 SHALL 以"当前处于某个 worktree 内"为准，不要求 worktree 名等于 change 名。

#### Scenario: worktree 名与 change 名不同
- **WHEN** 用户在 `~/.ly/worktrees/<项目名>/feature/login`（分支 `feature/login`）内 `opsx:propose` 生成的 change 名是 `add-user-auth`
- **THEN** worktree 目录与分支保持 `feature/login` 不变，不因 change 名而重命名；change 产物 `openspec/changes/add-user-auth/` 落在该 worktree 内，apply/review 均在该 worktree 内完成
