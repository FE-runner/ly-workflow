# 审查暂存区化 + 提交时机改造

## Why

v1.4.3 起 review-plan/review-code 审查范围走 `git diff HEAD`（暂存区+工作区），主路径是"审未提交变更"。但 propose/apply 仍是**无条件立即 commit**：方案生成后马上提交、实施完成后马上提交，工作区被提前清空，review 主路径空转、被迫退到 `HEAD~1` 兜底分支——与"审未提交变更"的设计初衷背离，并导致两条连带问题：

1. **review-plan 的"循环前已脏隔离"逻辑自相矛盾**：手动模式下 propose 产物不再提前 commit，产物以"未提交改动"形式存在；而 review-plan 会把"循环开始前就有未提交改动"的文件当无关脏文件跳过、不自动提交——产物因此永远不会被提交，悬在工作区。
2. **review-code 的 `HEAD~1`/`git show HEAD` 兜底是旧设计残留**：当初无条件 commit 保证工作区干净，兜底才有意义；原则改为"审未提交变更"后，工作区干净就应直接报告"无变更"，兜底反而审查了无关的历史 commit。

本次改动统一提交原则：**有后续审查环节的阶段（propose/apply）默认不 commit，产物放入暂存区；审查结束后才 commit。自动模式免询问、清零后自动统一提交；手动模式在"跳过审查"或"非清零终止"时才询问用户是否提交。**

## What Changes

- **propose/apply 从"无条件立即 commit"改为"暂存区持有"**：产物/实施改动 `git add` 进暂存区，不再立即 commit。
- **review-plan/review-code 审查范围维持 `git diff HEAD`**（暂存区+工作区，含未跟踪清单），修复改动留在工作区不 add；非清零终止时 `git commit` 天然只提交暂存区中的产物（修复未 add 自动被排除），"只提交产物"零成本实现。
- **删除 review-code 的 `HEAD~1`/`git show HEAD` 兜底分支**：工作区+暂存区干净即报告"无变更"。
- **删除 review-plan 的"循环前已脏隔离"逻辑**（步骤 1.5 及其全部引用）：产物就是合法审查对象，不再需要隔离。
- **清零统一提交改造**：`git add` 审查对象全部文件后 commit，而非仅收集"循环期间改动文件清单"。
- **手动模式下新增"跳过审查"与"非清零终止"两处询问是否提交**；**自动模式免询问**——清零自动统一提交（走 review 的既有机制），非清零不提交、改动留工作区。
- **init/archive 无条件 commit 不变**（无后续审查环节）。
- **同步更新 templates/CLAUDE.md 命令表与变更记录、CHANGELOG.md、相关 src/ 实现（如有）。**

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `ly-review-gates`：审查范围删除 `HEAD~1`/`git show HEAD` 兜底分支（工作区干净即报"无变更"）；删除 review-plan 的"循环前已脏隔离"逻辑；清零统一提交改为 `git add` 审查对象全部文件后 commit。
- `ly-propose-flow`：产物从"无条件立即 commit"改为"暂存区持有"；自动模式免询问（清零后由 review-plan 统一提交）；手动模式新增"跳过审查时询问是否提交"与"非清零终止时询问是否提交"两处提交询问；`--auto` worktree 续接文案去掉"自动 commit"字样（apply 不再自动 commit）。
- `ly-lifecycle-commands`：apply 从"实施后自动提交"改为"改动暂存区持有 + 手动模式询问"；propose 编排段同步（无条件 commit → 暂存区持有 + 按模式询问）；archive/init 无条件 commit 不变。

## Impact

- `templates/commands/propose.md`：步骤 4 → 暂存区持有；步骤 6a/6b → 清零/非清零/跳过审查三种提交路径重新编排。
- `templates/commands/apply.md`：步骤 5 提交逻辑 → 暂存区持有 + 手动询问。
- `templates/commands/review-plan.md`：删步骤 1.5 隔离；清零统一提交改 `git add` 全部；报告模板提交行更新。
- `templates/commands/review-code.md`：删兜底分支；清零统一提交改 `git add` 全部；报告模板提交行更新。
- `templates/CLAUDE.md`：命令表 + 变更记录。
- `CHANGELOG.md`：新版本条目。
- `src/commands/`：若存在与 commit 时机相关的实现逻辑（如 propose/apply 命令的自动 commit 调用），同步更新。