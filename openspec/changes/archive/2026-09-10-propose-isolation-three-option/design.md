## Context

`/ly:propose` 是纯编排逻辑（`templates/commands/propose.md` markdown 模板，安装时复制为 `~/.claude/commands/ly/propose.md`），无 TypeScript/Go 代码参与——本次变更只动模板与文档。隔离询问的 spec 归属 `worktree-create-before-propose` capability（探索阶段曾误记为 `ly-propose-flow`，经核对基线 spec 已纠正）。

现有步骤 1 结构：检测 worktree → 二选一询问 → worktree 子分支（含脏改动提示、分支名询问、baseline、cd 续跑、兜底命令）/ "否"分支（原地继续）。

## Goals / Non-Goals

**Goals:**
- 隔离询问升级为三选一，新增"本项目切新分支"分支级隔离档位
- 脏改动处置机制（WIP commit / Stash / 原样保留）作用于两条原地路径
- worktree 路径行为零改动（v1.8.0 刚落地，保持稳定）

**Non-Goals:**
- 不改 `src/` 安装器/CLI 代码（模板是数据不是逻辑，安装机制原样复制）
- 不做"当前分支非默认分支即跳过询问"的检测
- 不为"留在当前分支"路径补 baseline/cd/兜底等重型机制
- 不触碰 review-plan/review-code/apply 的模板（污染审查对象的问题由"原样保留"选项文案告知风险，不在审查侧做豁免逻辑）

## Decisions

### 决策 1：一次三选一询问，而非两段式
在原二选一的位置直接放三选项（worktree / 切新分支 / 留在当前分支），而不是"切 worktree 吗？→ 否 → 再问分支"。

- 理由：原"否（留在当前工作区）"实际混装了"不想动目录"和"不在乎分支"两种意图，三选一让语义显式化；两段式的第二个问题有意外感。
- 备选（否决）：两段式——多一次交互，且第一问的"否"语义仍含混。

### 决策 2：脏改动处置三选项而非二选一（保留 Stash）
Stash 对 `checkout -b` 而言终态与"原样保留"完全相同（新分支 HEAD 即当前 HEAD，pop 回来改动仍在工作区），实质价值只有 stash 日志留底。

- 理由：用户明确要求保留三选项；代价只是文案如实写明"pop 回来仍在工作区、仅留底"，用户知情自选。
- 关键事实：`checkout -b` 不做工作区树变更，不存在脏文件冲突失败——其唯二失败原因是分支名已存在/非法，对应"报错转人工"分支。
- 备选（否决）：二选一（commit / 保留）——用户决策保留 Stash。

### 决策 3：WIP commit 落点 = 切分支之前
`git add -A && git commit` 在 `checkout -b` 之前执行，WIP commit 落在旧分支顶端，新分支从含 WIP 的 HEAD 切出。

- 理由：改动随新分支走且已固化为 commit；两分支共享该 commit，日后收尾 merge 不丢失；review-code 的 `git diff HEAD` 干净。
- 备选（否决）：切完再提交——终态等价但过程多一步，无收益。

### 决策 4："留在当前分支"路径的 Stash 不自动 pop
该路径无切换动作，stash 后 pop 无意义（改动原地不动）；不 pop 让 stash 成为真实收容，用户日后 `git stash pop` 自取。

- 理由：执行时如实说明即可，不做隐式恢复。
- 备选（否决）：照搬切分支路径的"push → pop"——pop 回来与"原样保留"无异，反而抹掉了用户的 stash 意图。

### 决策 5：切新分支路径不跑 baseline、无 cd、无兜底命令
baseline 验证的对象是"全新 worktree 的环境可用性"（env 复制、依赖安装）；切分支路径同目录同 env 同 node_modules，前提不成立。无目录切换即无会话断链，cd 校验与兜底续接命令（v1.8.0 为 worktree 路径引入）整段不适用。

- 理由：保持路径行为与其实际风险面一致，不为一致性引入空转步骤。
- 备选（否决）：三条路径统一跑 baseline——纯耗时，无验证价值。

### 决策 6：脏改动询问触发条件 = 两条原地路径 + porcelain 非空
worktree 选项不触发（改动天然留在原地，已有专属提示）；"留在当前分支"与"本项目切新分支"都在 `git status --porcelain` 非空时触发——污染 review-code 审查范围（`git diff HEAD`）的问题与切不切分支无关。

- 备选（否决）：仅切新分支路径触发——会漏掉"留在当前分支"路径的同类污染风险。

### 决策 7：spec 归属修正为 `worktree-create-before-propose`
隔离询问 Requirement 的基线在该 capability；`ly-propose-flow` 只约束"全自动/手动"询问与 worktree 询问的正交关系，三选一不改变该正交性，无需 delta。

## Risks / Trade-offs

- [脏改动 WIP commit 把无关草稿固化进分支历史] → 文案明示提交范围是整个工作区（`git add -A`）；用户对"原样保留/Stash"有退路；commit message 用 `wip:` 前缀可识别可 revert。
- [三选项文案过长导致询问卡片臃肿] → 选项 label 短句，后果说明放 description 一行内；完整规则在 propose.md 正文。
- [已安装用户模板不自动更新] → 需重跑 `npx ly-workflow update`；属既有安装机制约定，不额外处理。
- [切新分支后用户忘了自己在开发分支，后续在原地做无关操作] → 分支级隔离的固有代价（无目录提示），接受；收尾回 main 由用户手动 checkout + merge，与 worktree 路径的收尾负担相当。

## Migration Plan

纯模板/文档变更，无运行时迁移。发版后用户重跑 `npx ly-workflow update` 获得新 propose.md 即可。回滚 = revert 该 commit，模板回到二选一版本，无数据/状态残留。

## Open Questions

（无——探索阶段已收敛全部设计分歧：三选一形态、脏改动三选项、WIP 落点、无 baseline、spec 归属。）
