## Why

`/ly:propose` 当前的隔离询问是二选一：切隔离 worktree 或留在当前工作区。拒绝 worktree 意味着接受"propose/apply 提交直接落在当前分支（通常是 main）上"——只有目录级隔离和零隔离两档，缺了中间的分支级隔离；这与 `/ly:release` GitFlow 假设的 feature 分支工作方式也不匹配。补上"本项目切新分支"第三档后，用户可以用零环境成本（不重装 node_modules、不复制 env、不跑 baseline）获得分支隔离。

## What Changes

- **`templates/commands/propose.md` 步骤 1 的隔离询问从二选一改为三选一**：
  - **隔离 worktree**：行为完全不变（从当前分支 HEAD 切出、env 复制、baseline、同会话 cd 续跑、兜底命令）。
  - **本项目切新分支（新增）**：留在当前工作目录，仅做分支隔离——
    1. 询问/确认开发分支名（复用现有规则：可含 `/`，worktree 路径的分支名询问规则同款）；
    2. 脏改动处置三选（触发条件：`git status --porcelain` 非空）：**WIP commit**（`git add -A && git commit -m "wip: 切分支前暂存工作区改动"` 后再切，新分支从含 WIP 的 HEAD 切出，review-code 审查对象干净）/ **Stash**（`git stash push -u` → 切分支 → `git stash pop`，文案如实说明 pop 回来改动仍在工作区，stash 仅留底）/ **原样保留**（文案明示会进入 review-code 审查范围 `git diff HEAD`、可能污染审查对象）；
    3. 执行 `git checkout -b <开发分支名>`（从当前 HEAD 建新分支并切换）。无 baseline 验证（同目录同 env 同 node_modules，baseline 验证的"全新 worktree 可用性"前提不成立）、无 cd 续跑、无兜底续接命令；
    4. 分支名已存在或非法导致 `checkout -b` 失败时，如实报错停止编排转人工，不做自动兜底（不自动改名、不自动 stash）。
  - **留在当前分支**：原"否（留在当前工作区）"分支拆出，仅触发脏改动处置三选（同样告知污染 review-code 审查范围的风险），其余照旧。
- **worktree 选项不触发脏改动处置询问**：worktree 路径的既有行为（提示"改动将留在原 worktree"）保持不变，脏改动天然留在原地。
- **"已在 worktree 内"检测不变**：切分支不改变 `--git-dir`/`--git-common-dir` 关系，检测逻辑无冲突；已在开发分支上时照常询问（不做"非默认分支即跳过"的检测——会误伤手动切分支的场景）。
- **文档同步**：根 `CLAUDE.md` 的 `/ly:propose` 命令表描述、`README.md` 对应描述同步三选一语义（模板变更属安装产物，安装器代码不涉及）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `worktree-create-before-propose`: "propose 在创建方案前询问一次是否切隔离 worktree" Requirement 改为三选一询问——新增"本项目切新分支"路径（分支名询问、脏改动处置三选、`git checkout -b`、无 baseline/无 cd 续跑/无兜底命令、失败转人工）与"留在当前分支"路径（仅触发脏改动处置三选）；worktree 路径行为不变。

## Impact

- **模板**：`templates/commands/propose.md`（步骤 1 重写：询问形态三选一 + 两条新路径；worktree 子分支原文保留）。
- **文档**：根 `CLAUDE.md`（`/ly:propose` 表格行）、`README.md`（`/ly:propose` 描述）。
- **不涉及**：`src/` 安装器/CLI 代码、`codeagent-wrapper`、其他 `/ly:*` 命令模板——本次是纯编排逻辑（markdown 模板）变更，无 npm 依赖、无 Go 改动。已安装用户需重跑安装/更新才能获得新模板。
