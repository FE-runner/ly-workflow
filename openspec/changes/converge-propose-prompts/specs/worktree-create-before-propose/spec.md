## Purpose

让 `/ly:propose`（以及任何需要隔离的方案创建流程）在创建方案之前、从当前分支 HEAD 直接切出隔离 worktree，作为方案与后续实施的开发环境，且询问只在流程开始时出现一次。

## ADDED Requirements

### Requirement: propose 在创建方案前询问一次是否切隔离 worktree，从当前分支切入
`/ly:propose` SHALL 在委托 `opsx:propose` 之前，先检测当前是否已处于某个 worktree 内（比较 `git rev-parse --git-dir` 与 `--git-common-dir`，并排除子模块误判）。若已在 worktree 内，SHALL 跳过 worktree 询问（隔离已存在，切换无意义），直接进入"全自动/手动"询问。若不在任何 worktree 内，SHALL 询问用户一次"是否切到隔离 worktree"；该询问 SHALL 只在流程开始时出现一次，整个 propose 收尾流程中 SHALL NOT 再出现任何 worktree 询问或切换动作。

用户选择切换时，SHALL 执行 `git worktree add -b <开发分支名> <路径> <当前分支HEAD>` 从**当前分支 HEAD** 切出新 worktree——不是从默认分支、不做分支拓扑校验。worktree 目录 SHALL 为 `~/.ly/worktrees/<项目名>/<开发分支名>`（单层平铺，无来源前缀；`<项目名>` 以 `git rev-parse --git-common-dir` 反推主仓库目录名）。`<开发分支名>` SHALL 由用户/流程在切换时确定（约定为本次开发的开发分支名），可含 `/`（如 `feature/xxx`）。worktree 目录与分支 SHALL 锁定为 `<开发分支名>`，SHALL NOT 因后续 change 名与开发分支名不同而对 worktree/分支重命名（change 在 worktree 内生成，是 worktree 的产物而非命名依据）。

切换后 SHALL 复用 `/ly:worktree add` 的后续流程：自动复制环境文件、运行一次项目 baseline 验证（复用 worktree.md 的 baseline 规则）。baseline 失败时默认不打印续接命令，报告失败摘要并询问用户是否仍要继续；仅当用户明确选择继续才打印续接命令。切换成功后 SHALL 打印续接命令（`cd <绝对路径> && claude ...`，绝对路径 + shell 安全转义），提示在新 worktree 中调用 `/ly:propose` 继续生成方案；当前会话 SHALL NOT 自动切换目录或启动新会话，SHALL NOT 继续执行本次 `opsx:propose`（change 尚未生成，等下一次在 worktree 内的调用）。

若用户在询问中选择"否"，留在当前工作区继续，SHALL 不创建 worktree，直接进入"全自动/手动"询问。

#### Scenario: 裸工作区发起 propose，选择切换
- **WHEN** 用户在主工作区（非 worktree）执行 `/ly:propose "fix-login"`，询问 worktree 后选择"是"
- **THEN** 命令以 `git worktree add -b fix-login ~/.ly/worktrees/<项目名>/fix-login <当前分支HEAD>` 切出 worktree，跑 baseline 验证，打印续接命令 `cd ~/.ly/worktrees/<项目名>/fix-login && claude "继续 ..."`，当前会话结束；`opsx:propose` 未被调用，change 尚未生成

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