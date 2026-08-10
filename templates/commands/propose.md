---
description: '委托 opsx:propose 生成方案，随后按总开关编排：commit → 审查循环 → 询问隔离 worktree'
---

# Propose

生成方案后的收尾流程：先问一次总开关，决定要不要走自动化收尾（审查循环 + worktree 询问 + 隔离后自动续接实施与审查）；commit 不受这个开关影响，永远执行。

## 步骤

### 1. 询问总开关（在委托 opsx:propose 之前，只问这一次）

```
AskUserQuestion: "本次要不要走自动化收尾流程（审查循环 + worktree 询问 + 隔离后自动续接实施与审查）？"
```

这是整条编排链路唯一的开关询问，后续步骤不再重复问"要不要继续自动"。

### 2. 委托 opsx:propose 生成方案

```
Skill({ skill: "opsx:propose", args: "$ARGUMENTS" })
```

### 3. 确定真实 change 名（前后快照比对）

调用前记录一次 `openspec list --json` 的候选 change 名集合（快照 A，若步骤 2 之前尚未记录则在委托前先记录）；委托完成后再查询一次（快照 B）。取快照 B 相对快照 A 新增的那一条作为本次实际生成的 change 名。**不依赖 `$ARGUMENTS`、不单纯依赖全局 `lastModified` 最新一条**——`opsx:propose` 会把用户输入的原始描述转成 kebab-case slug，两者不保证一致；单纯取 `lastModified` 存在竞态（并行会话可能更新了别的 change）。

若新增条目不唯一，或没有新增条目，**不猜测**，直接询问用户本次生成的 change 名，待确认后再继续。

### 4. 提交 artifact（无条件执行，不受总开关影响）

1. 检查整个 Git index（`git diff --cached --name-only`）：若存在该 change 目录之外的已暂存内容，**停止**，报告"检测到该 change 目录外的已暂存内容，请先处理（unstage 或另行提交）后重试"，不执行 commit。
2. index 干净后：`git add -- openspec/changes/<change-name>/`（只暂存该 change 目录，不用 `git add -A`），再 `git commit`，提交信息形如 `propose: <change-name>`。
3. 提交完成后用 `git show --name-only --format=` 校验该次 commit 的实际文件集合严格属于 `openspec/changes/<change-name>/` 目录。
4. 若该目录下无可提交内容、`git commit` 本身失败，或校验发现文件集合超出该目录范围，**停止后续自动化步骤**（不进入步骤 5），报告具体原因。

### 5. 总开关分支

- **选"否"**：commit 完成后**直接结束**——不调用 `/ly:review-plan`，不询问 worktree。等价于"只生成方案 + 提交"的最小行为。
- **选"是"**：继续步骤 6。

### 6. 调用 review-plan 审查循环

```
/ly:review-plan <change-name>
```

审查循环默认在每轮修复且验证（`openspec validate`）通过后自动 commit，`/ly:propose` 不从外部拦截或观察循环的中间轮次状态来触发提交（该 commit 本身失败也由循环自己作为独立终止条件处理，见 `/ly:review-plan` 的规则）。

### 7. 询问是否切换隔离 worktree（仅当循环终止原因为"Critical 清零"）

**只有**审查循环以"Critical 清零"结束时，才询问：

```
AskUserQuestion: "是否为此次改动新建隔离 worktree？"
```

- **是** → 调用 `/ly:worktree switch <change-name> --auto`（总开关已经是"是"，切换后自然延续自动化——新 worktree 里实施完自动跑 `/ly:review-code` 循环，不再为此单独询问）
- **否** → 留在当前工作区，流程结束

**其余全部终止原因**——熔断、分歧未决、无法安全修复、验证失败、审查调用失败、达到全局轮数上限——都**不询问、不调用 switch**，直接输出对应的终止报告并结束编排。方案本身尚未收敛，不适合急着进隔离环境。
