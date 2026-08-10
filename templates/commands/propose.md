---
description: '委托 opsx:propose 生成方案，随后按选择编排：commit → （全自动/手动两条路径）审查循环 → worktree 询问'
---

# Propose

生成方案后的收尾流程：先问一次"本次走全自动，还是手动逐步确认"，两条路径下 commit 都无条件执行；区别只在于审查循环和 worktree 询问的时机、次数。

## 步骤

### 1. 询问全自动/手动（在委托 opsx:propose 之前，只问这一次）

```
AskUserQuestion: "本次收尾走全自动（自动审查+清零后问一次worktree+隔离后自动续接实施与审查），还是手动逐步确认（每一步都问）？"
```

这是整条收尾编排链路里唯一决定"自动/手动"路径的询问，不代表"要不要 commit"（commit 始终执行）或"要不要走 worktree/review-plan"（两条路径下都有机会走，只是询问的时机和次数不同）。后续步骤不再重复问"要不要继续自动"。

### 2. 委托 opsx:propose 生成方案

```
Skill({ skill: "opsx:propose", args: "$ARGUMENTS" })
```

### 3. 确定真实 change 名（前后快照比对）

调用前记录一次 `openspec list --json` 的候选 change 名集合（快照 A，若步骤 2 之前尚未记录则在委托前先记录）；委托完成后再查询一次（快照 B）。取快照 B 相对快照 A 新增的那一条作为本次实际生成的 change 名。**不依赖 `$ARGUMENTS`、不单纯依赖全局 `lastModified` 最新一条**——`opsx:propose` 会把用户输入的原始描述转成 kebab-case slug，两者不保证一致；单纯取 `lastModified` 存在竞态（并行会话可能更新了别的 change）。

若新增条目不唯一，或没有新增条目，**不猜测**，直接询问用户本次生成的 change 名，待确认后再继续。

### 4. 提交 artifact（无条件执行，不受第 1 步选择影响）

1. 检查整个 Git index（`git diff --cached --name-only`）：若存在该 change 目录之外的已暂存内容，**停止**，报告"检测到该 change 目录外的已暂存内容，请先处理（unstage 或另行提交）后重试"，不执行 commit。
2. index 干净后：`git add -- openspec/changes/<change-name>/`（只暂存该 change 目录，不用 `git add -A`），再 `git commit`，提交信息形如 `propose: <change-name>`。
3. 提交完成后用 `git show --name-only --format=` 校验该次 commit 的实际文件集合严格属于 `openspec/changes/<change-name>/` 目录。
4. 若该目录下无可提交内容、`git commit` 本身失败，或校验发现文件集合超出该目录范围，**停止后续自动化步骤**（不进入步骤 5），报告具体原因。

### 5. 按第 1 步选择分支

- **选"全自动"**：跳到步骤 6a。
- **选"手动"**：跳到步骤 6b。

### 6a. 全自动路径

1. 调用 `/ly:review-plan <change-name>`（默认逐轮自动 commit，`/ly:propose` 不从外部拦截或观察循环的中间轮次状态来触发提交；该 commit 本身失败也由循环自己作为独立终止条件处理，见 `/ly:review-plan` 的规则）。
2. 循环终止（无论何种原因）后询问是否切换隔离 worktree：
   - 终止原因为**Critical 清零**：
     ```
     AskUserQuestion: "是否为此次改动新建隔离 worktree？"
     ```
     选"是" → 调用 `/ly:worktree switch <change-name> --auto`；选"否" → 留在当前工作区，流程结束。
   - 终止原因为**其余任一种**（熔断、分歧未决、无法安全修复、验证失败、审查调用失败、提交失败、达到全局轮数上限）：复用该循环已产出的终止报告（不重新生成或重复一份），再询问：
     ```
     AskUserQuestion: "审查未通过（<终止原因>），是否新建隔离 worktree 去处理？"
     ```
     选"是" → 调用 `/ly:worktree switch <change-name>`（**不带** `--auto`——问题尚未收敛，不应自动续跑审查，视为自动模式失效、退回人工确认）；选"否" → 留在当前工作区，流程结束。
3. 调用 `/ly:worktree switch` 后，按下方"switch 结果统一判定规则"处理结果。

### 6b. 手动路径

1. commit 完成（步骤 4）后，立即询问：
   ```
   AskUserQuestion: "方案已生成并提交，是否现在切换到隔离 worktree？"
   ```
   - **是** → 调用 `/ly:worktree switch <change-name>`（不带 `--auto`），按下方"switch 结果统一判定规则"处理；切换成功则**编排到此结束**，不再继续下面的步骤（后续要不要审查由用户在新 worktree 里自行决定）。
   - **否** → 继续步骤 2。
2. 询问：
   ```
   AskUserQuestion: "要不要现在跑一次 review-plan 审查循环？"
   ```
   - **否** → 编排结束（等价于"只生成方案 + 提交"的最小行为）。
   - **是** → 继续步骤 3。
3. 调用 `/ly:review-plan <change-name>`（默认逐轮自动 commit，规则同 6a.1）。
4. 循环终止（无论何种原因）后再问一次是否要新建隔离 worktree，调用时**均不带** `--auto`（手动路径下不要求新会话自动续跑审查）：
   - 终止原因为**Critical 清零**：直接问"审查已通过，是否为此次改动新建隔离 worktree？"。
   - 终止原因为**其余任一种**：复用该循环已产出的终止报告，再问"审查未通过（<终止原因>），是否新建隔离 worktree 去处理？"。
   - 选"是" → 调用 `/ly:worktree switch <change-name>`（不带 `--auto`），按下方规则处理；选"否" → 留在当前工作区，流程结束。

### switch 结果统一判定规则（6a/6b 共用）

`/ly:worktree switch` 是否算"切换成功"，以其**是否最终输出续接命令**为唯一判定依据，不按"前置校验/baseline"分类处理：

- **输出了续接命令**：视为目标 worktree 已就位，直接结束当前编排。续接提示按以下组合确定，不拆成并列的多条提示：
  - 不带 `--auto`、无 baseline 失败摘要：追加"运行 `/ly:apply` 继续"。
  - 不带 `--auto`、有 baseline 失败摘要：改为"处理完 baseline 失败问题后运行 `/ly:apply` 继续"。
  - 带 `--auto`、无 baseline 失败摘要：改写为一条连贯说明"运行 `/ly:apply` 继续实施（自动 commit），完成后自动依次调用 `/ly:review-code`"。
  - 带 `--auto`、有 baseline 失败摘要：两个约束都保留，改写为"处理完 baseline 失败问题后，运行 `/ly:apply` 继续实施（自动 commit）；完成后自动依次调用 `/ly:review-code`"。
- **未输出续接命令**，覆盖以下三种情况，均如实转述/报告对应原因并结束，不输出上述续接提示，不自动回退到"继续留在当前工作区实施"：
  1. 分支拓扑校验等前置校验拒绝——转述 `switch` 返回的原始错误（以"验证失败"/"提交失败"终止后因该 change 目录本身有未提交改动导致的拒绝也属于此类，转述"请先处理未提交内容后重试"即可，不需要额外的预检测逻辑）；
  2. baseline 失败且用户在 `switch` 内部询问中选择不继续——报告 baseline 失败摘要；
  3. `switch` 自身隔离检测触发的"是否仍要新建独立 worktree"询问被用户选择不创建——如实说明仍留在原 worktree、未发生切换。
