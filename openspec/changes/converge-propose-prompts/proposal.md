## Why

`/ly:propose` 的 worktree 询问现在散落在**方案提交后 / 审查循环终止后**（全自动路径 6a、手动路径 6b 共四处），用户在方案生成、审查、提交之后才被问"要不要切到隔离 worktree"。此时切换既太迟（change 已生成、审查已跑完，隔离的意义被削弱），又重复（每次 propose 都可能问多次）。同时全自动路径依赖已存在的 `/ly:worktree switch --auto` 的续接文案来承诺"实施后自动审查"，但这个 `switch` 子命令的存在价值就是"等 change 生成后再定位 worktree"——切点前移后它没有存在必要了。

本次把**worktree 询问与全自动/手动询问统一收敛到「探索完 → 准备创建方案」边界，各只问一次**：worktree 在创建方案前从当前分支 HEAD 切出，之后 propose/review/apply/review-code 全程在隔离区内完成，不再出现第二次 worktree 询问或 switch。全自动路径从"审方案清零后问 worktree 靠 switch 续接"改为"审方案清零后自动进入 apply → 自动审代码的流水线"。

## What Changes

- **worktree 询问前移到创建方案前，全局只问一次**：`/ly:propose` 在委托 `opsx:propose` 之前，若当前不在任何 worktree 内，询问一次"是否切到隔离 worktree"；用户选"是"则用 `git worktree add` 从**当前分支 HEAD** 切出（目录 `~/.ly/worktrees/<项目名>/<开发分支名>`，单层平铺），打印续接命令后结束当前会话，change 后续在隔离区内生成。**输入**不再出现"方案提交后 / 审查循环终止后"的 worktree 询问（移除 6a 两处、6b 两处）。
- **全自动/手动询问与 worktree 询问共点**：仍只在委托 `opsx:propose` 之前问一次；已在 worktree 内时跳过 worktree 询问、但全自动/手动照问（自动化程度与隔离正交）。
- **`/ly:worktree switch` 子命令整体删除（含 `--auto`）**：worktree 命令树只保留 `add`/`list`/`remove`/`prune`/`migrate`；连带退役 `/ly:apply` 侧基于 switch 的隔离检测（固定路径 + 分支匹配 + 不匹配问 switch 的逻辑一并移除，apply 直接在当前工作区实施）。
- **全自动 = 自动流水线直到审完代码**：`/ly:propose` 审方案清零后，不询问 worktree、不依赖 switch 续接，而是**在同一会话内自动进入 `/ly:apply` 实施 → 自动进入 `/ly:review-code` 审查**，清零/终止后结束；`/ly:archive` 仍手动。任一环节非清零终止 → 停止流水线，报告终止原因。
- **propose 产物每步 commit**：`opsx:propose` 生成方案后立即 `git commit -m "propose: <change-name>"`，不再"暂存区持有、清零/询问时统一提交"。
- **apply 产物每步 commit**：`opsx:apply` 实施完成立即 `git commit -m "apply: <change-name>"`，不再"暂存区持有、跳过审查时才询问提交"。
- **审查对象 = 最近一次相关 commit**：`review-plan` 审查对象是 `propose:` commit，`review-code` 审查对象是 `apply:` commit（都是最近一次相关 commit），不再从"未提交 diff"开始；修复在审查-修复循环内保持现状"结束时统一提交"（见 `ly-review-gates`）。

## Capabilities

### New Capabilities

- `worktree-create-before-propose`: `/ly:propose` 在创建方案前直接从当前分支 HEAD 用 `git worktree add` 切出隔离 worktree（单层平铺 `<项目名>/<开发分支名>`），询问仅一次；已在 worktree 内时跳过该询问。worktree 目录/分支锁定为开发分支名，不随 change 重命名。

### Modified Capabilities

- **`ly-propose-flow`**: worktree 询问时机从"方案提交后/审查循环终止后"前移到"创建方案前"，全局仅一次；全自动路径改为审方案清零后同会话自动 apply → 自动 review-code 的流水线；propose 产物改为生成后每步 commit `propose: <change>`。
- **`worktree-switch`**: 删除 `switch` 子命令（含 `--auto`），能力从"按 change 名定位/创建 worktree"改为"只保留 add/list/remove/prune/migrate"。
- **`ly-lifecycle-commands`**: apply 移除基于 switch 的隔离检测与"跳过审查时才询问提交"，实施完立即 commit `apply: <change>`。

## Impact

- `templates/commands/propose.md`：worktree 询问前移 + 全自动流水线 + 每步 commit，删除 6a/6b 的 worktree 询问与 switch 调用、switch 结果统一判定规则。
- `templates/commands/worktree.md`：删除 `switch` 子命令定义；目录结构改为单层平铺；新增"创建方案前从当前分支切"的 `add` 用法。
- `templates/commands/apply.md`：删除隔离检测（固定路径+分支匹配+问 switch）与会话尾部的 switch 提示；实施完成改为立即 commit `apply: <change>`。
- `templates/commands/review-plan.md` / `review-code.md`：审查对象基线改为"最近一次相关 commit"（`git show HEAD` + `git diff HEAD` 组合，保护未提交修复不丢失）。
- `openspec/specs/ly-propose-flow/`、`worktree-switch/`、`ly-lifecycle-commands/`：对应 delta spec。
- `workflow.md`：propose/apply mermaid 流程图同步（每步 commit、前置 worktree、无 switch、全自动流水线）。
- 待检查：`src/commands/` 下是否有源码头文件/技能引用 `worktree switch`、`--auto`、隔离检测等（若有则一并清理）。