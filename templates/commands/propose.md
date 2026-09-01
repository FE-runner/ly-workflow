---
description: '委托 opsx:propose 生成方案；创建方案前先问 isolation worktree 与全自动/手动（各只一次）；产物每步 commit；全自动 = 自动流水线到审完代码，手动 = 逐步确认'
---

# Propose

收尾编排入口。创建方案前先问两件事（各只一次）：是否切到隔离 worktree（不在 worktree 内才问）、本次走全自动还是手动。产物生成后立即 commit（`propose: <change-name>`）；全自动路径在同一会话内自动跑 review-plan → apply → review-code 直到审完代码，手动路径逐步确认。

## 步骤

### 1. 是否已在 worktree 内 + worktree 询问（创建方案前，全局只问一次）

先检测当前是否已处于某个 worktree 内：比较 `git rev-parse --git-dir` 与 `--git-common-dir`（路径先 realpath 归一化再比较），并排除子模块误判（`git rev-parse --show-superproject-working-tree`）。

- **已在 worktree 内** → 跳过 worktree 询问，直接进入步骤 2。
- **不在任何 worktree 内** → 询问一次：
  ```
  AskUserQuestion: "是否切到隔离 worktree（从当前分支切出，目录 ~/.ly/worktrees/<项目名>/<开发分支名>）？"
  ```
  - **是（切到隔离 worktree）**：
    1. 先检查当前工作区未提交改动（`git status --porcelain`）：存在未提交草稿时提示"当前工作区的未提交改动将留在原 worktree、不会带入新 worktree"，待用户确认后再切换。
    2. 询问/确认本次开发的开发分支名 `<开发分支名>`（可含 `/`，如 `feature/xxx`）。
    3. 执行（从**当前分支 HEAD** 切出，不是默认分支、不做分支拓扑校验）：
       ```
       git worktree add -b <开发分支名> ~/.ly/worktrees/<项目名>/<开发分支名> <当前分支HEAD>
       ```
       （`<项目名>` 以 `git rev-parse --git-common-dir` 反推主仓库目录名；多级分支名按 `/` 展开路径，仍保持无来源前缀的单层语义。）
    4. 自动复制环境文件（`.env` 等，复用 `/ly:worktree add` 规则），跑一次项目 baseline 验证。
    5. **baseline 失败** → 默认不打印续接命令，报告失败摘要并询问是否仍继续；仅当用户明确选择继续才打印携带失败摘要的续接命令。
    6. 打印续接命令（绝对路径 + shell 安全转义），提示在新 worktree 中再次调用 `/ly:propose`（同一需求）以生成方案：
       ```
       cd ~/.ly/worktrees/<项目名>/<开发分支名> && claude "继续 在隔离 worktree 中 /ly:propose <同一需求>"
       ```
    7. **本次会话结束**——不调用 `opsx:propose`，change 尚未生成（worktree 先于 change 创建）。worktree 目录/分支锁定为 `<开发分支名>`，后续不因 change 名不同而对 worktree/分支重命名。
  - **否（留在当前工作区）** → 不创建 worktree，进入步骤 2。

### 2. 询问全自动/手动（创建方案前，全局只问一次）

```
AskUserQuestion: "本次收尾走全自动（自动审查 + 自动实施 + 审完代码才停，非清零即停），还是手动逐步确认（每一步都问）？"
```

这是唯一决定"自动/手动"路径的开关询问。自动化程度与隔离正交：选全自动不隐含必须切 worktree，切了 worktree 也不隐含必须全自动。后续步骤不再重复问"要不要继续自动"。本轮若已在 worktree 内（跳过步骤 1 的询问），此询问照常进行。

### 3. 委托 opsx:propose 生成方案

```
Skill({ skill: "opsx:propose", args: "$ARGUMENTS" })
```

### 4. 确定真实 change 名（前后快照比对）

调用前记录一次 `openspec list --json` 的候选 change 名集合（快照 A，若步骤 3 之前尚未记录则在委托前先记录）；委托完成后再查询一次（快照 B）。取快照 B 相对快照 A 新增的那一条作为本次实际生成的 change 名。**不依赖 `$ARGUMENTS`、不单纯依赖全局 `lastModified` 最新一条**——`opsx:propose` 会把用户输入的原始描述转成 kebab-case slug，两者不保证一致。若新增条目不唯一，或没有新增条目，**不猜测**，直接询问用户本次生成的 change 名，待确认后再继续。

### 5. 暂存并立即 commit（每步 commit）

1. 检查整个 Git index（`git diff --cached --name-only`）：若存在该 change 目录之外的已暂存内容，**停止**，报告"检测到该 change 目录外的已暂存内容，请先处理（unstage 或另行提交）后重试"，不执行 `git add` 也不 commit。
2. index 干净后：`git add -- openspec/changes/<change-name>/`（该目录含 `.openspec.yaml` 元数据、proposal/design/tasks 与全部 delta spec，集群暂存，不用 `git add -A`）。
3. **立即 commit**：
   ```
   git commit -m "propose: <change-name>"
   ```
4. 用 `git show --name-only --format=` 校验这次 commit 的实际文件集合严格属于 `openspec/changes/<change-name>/` 目录（含 `.openspec.yaml`）。
5. 若该目录下无可提交内容、`git commit` 失败，或校验发现文件集合超出该目录范围，**停止后续自动化步骤**，报告具体原因。

`propose: <change-name>` commit 即 `/ly:review-plan` 的审查对象（见 `/ly:review-plan` 的审查范围判定：`git log --grep="^propose: <change-name>"` 取 HEAD 侧最近一期，`git show <commit>` + `git diff HEAD` + 未跟踪清单）。

### 6. 按第 2 步选择分支

- **选"全自动"** → 进入步骤 7（自动流水线）。
- **选"手动"** → 进入步骤 8（逐步确认）。

### 7. 全自动：自动流水线直到审完代码

**全程无 worktree 询问、无 `/ly:worktree switch` 调用、不自动 archive。**

1. 自动调用 `/ly:review-plan <change-name>`（审查对象为 `propose:` commit，清零时由循环统一提交修复）。
   - Critical 清零 → 进入步骤 2。
   - 其余任一种终止（熔断、分歧未决、无法安全修复、验证失败、审查调用失败、达到轮数上限）→ **停止流水线**，复用该循环已产出的终止报告（不重新生成或重复一份）报告终止原因，结束，不执行后续步骤。
2. 自动调用 `/ly:apply <change-name>`（实施，产物立即 commit `apply: <change-name>`）。
3. 自动调用 `/ly:review-code <change-name>`（审查对象为 `apply:` commit，清零时由循环统一提交修复）。
   - Critical 清零 → 流水线结束，提示可手动 `/ly:archive` 归档。
   - 其余任一种终止 → **停止流水线**，复用该循环已产出的终止报告报告终止原因，结束。
4. 流水线执行过程中任一环节 `git commit` 失败：如实报告 Git 原始错误，停止流水线。

### 8. 手动：逐步确认

1. `propose: <change-name>` commit 完成后，询问：
   ```
   AskUserQuestion: "要不要现在跑一次 review-plan 审查循环？"
   ```
   - **否** → 编排结束。方案已 commit；日后由用户自行 `/ly:apply` 实施、`/ly:review-code` 审查。
   - **是** → 继续步骤 2。
2. 调用 `/ly:review-plan <change-name>`（审查对象为 `propose:` commit，清零时由循环统一提交修复）。
3. 循环终止（无论何种原因）后编排结束，**不再询问 worktree、不再询问提交、不自动衔接 apply**——日后的实施与代码审查由用户另行 `/ly:apply`、`/ly:review-code` 触发。

---

全程 **不再** 出现任何基于 `/ly:worktree switch` 的询问、调用或续接文案（`switch` 子命令已移除）；worktree 询问只发生在步骤 1（创建方案前，全局一次），且仅当当前不在任何 worktree 内时触发。