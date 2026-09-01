## 1. worktree 命令改造（移除 switch）

- [ ] 1.1 `templates/commands/worktree.md`：删除 `switch <change-name> [--auto]` 子命令定义（使用方式表格、Switch 工作流节、示例中的 switch 行、注意事项中 switch 相关限制）
- [ ] 1.2 同步删除 `--auto`（仅 switch 用）选项行、`switch` 结果判定规则相关引用；确认 `add`/`list`/`remove`/`prune`/`migrate` 命令树完好
- [ ] 1.3 目录结构示例改为单层平铺（`~/.ly/worktrees/<项目名>/<开发分支名>`），去掉"来源前缀"相关表述

## 2. worktree-create-before-propose 落地（创建方案前前置切换）

- [ ] 2.1 `templates/commands/propose.md`：在委托 `opsx:propose` 之前插入 worktree 询问步骤——检测是否已在 worktree 内（`git rev-parse --git-dir != --git-common-dir` 且排除子模块），在则跳过；不在则 `AskUserQuestion` "是否切到隔离 worktree？"（全局唯一一次）
- [ ] 2.2 选"是"时执行 `git worktree add -b <开发分支名> ~/.ly/worktrees/<项目名>/<开发分支名> <当前分支HEAD>`；自动复制 `.env` 等环境文件；跑 baseline 验证；打印续接命令 `cd <绝对路径> && claude "继续 在隔离 worktree 中 /ly:propose <同一需求>"`；本次会话结束，不调用 `opsx:propose`
- [ ] 2.3 baseline 失败时默认不打印续接命令，报告失败摘要并询问是否继续；选"否"结束，选"是"打印携带失败摘要的续接命令
- [ ] 2.4 选"否"（或已在 worktree 内）时留当前工作区继续，不创建 worktree

## 3. propose 编排重构（workspace 询问 + 每步 commit + 流水线）

- [ ] 3.1 `templates/commands/propose.md`：全自动/手动询问保持创建方案前单点；明确"已在 worktree 内 → 跳过 worktree 询问、全自动/手动照问"
- [ ] 3.2 快照比对（快照 A/B）确定真实 change 名逻辑不变（现状已有）
- [ ] 3.3 生成产物后：index 干净检查 → `git add -- openspec/changes/<change-name>/` → **立即 commit** `propose: <change-name>` → `git show --name-only` 校验文件集合属于该 change 目录；删除"暂存区持有不提交"、删除"清零/跳过审查询问提交"分支
- [ ] 3.4 删除 6a/6b 的全部 worktree 询问（"方案提交后问 worktree"、"审查循环终止后问 worktree"、"手动路径暂存后问 worktree"）与 switch 调用、switch 结果统一判定规则
- [ ] 3.5 手动路径改为：commit 完成后问一次"要不要跑 review-plan 审查"，选"否"则结束，选"是"则调用 `/ly:review-plan`（审查对象为 `propose:` commit，清零由循环统一提交）；选"是"且清零后不再有 worktree 询问
- [ ] 3.6 全自动路径改为流水线：直接调 `/ly:review-plan`（清零继续）→ 自动 `/ly:apply` → 自动 `/ly:review-code`；任一环节非清零终止 → 停止流水线，复用循环终止报告报告原因；全程无 worktree 询问/switch 调用；不自动 archive
- [ ] 3.7 `templates/commands/explore.md` 转向提示文案同步（去掉"worktree 询问"提及，如涉及）

## 4. apply 命令改造（移除隔离检测 + 立即 commit）

- [ ] 4.1 `templates/commands/apply.md`：删除固定目标路径 + 分支双重匹配的隔离检测（change 名解析保留三步优先级：显式 → worktree 反查唯一 → 唯一未归档 → 询问），不再出现"是否先切换到隔离 worktree"询问
- [ ] 4.2 删除会话尾部"如需隔离环境可用 `/ly:worktree switch ...`"提示；删除"暂存区持有、跳过审查才询问提交"逻辑
- [ ] 4.3 实施完成后 `git add` 本次实际改动 → **立即 commit** `apply: <change-name>` → 无变动跳过；commit 失败如实报告

## 5. review 命令审查对象改为最近一次相关 commit

- [ ] 5.1 `templates/commands/review-plan.md`：审查范围 = 目标 change 的 `propose:` commit（`git show <commit>` 差异）+ `git diff HEAD` + 未跟踪清单（修复未提交不丢失）；无该 commit 时退化为 `git diff HEAD` + 未跟踪清单
- [ ] 5.2 `templates/commands/review-code.md`：审查范围 = 最近 `apply:` commit 差异 + `git diff HEAD` + 未跟踪清单；无该 commit 时退化同等处理
- [ ] 5.3 两命令"零 commit 仓库"三条固定命令组合兜底保持；确认不在循环内新增 commit（结束时统一提交不变）

## 6. docs 同步

- [ ] 6.1 `CLAUDE.md`：变更记录新增 v1.6.x 条目（worktree 询问前置单点、switch 退役、全自动流水线、每步 commit、审查对象=最近 commit）；Slash Commands 表、关键设计决策同步
- [ ] 6.2 `workflow.md`：/ly:propose 与 /ly:apply 两张 mermaid 图按新流程重绘（创建方案前 worktree 询问单点、无 switch、全自动流水线、propose/apply 每步 commit）
- [ ] 6.3 `templates/CLAUDE.md`：commands 表与已删除命令说明同步（worktree 描述、apply/propose 说明）
- [ ] 6.4 CHANGELOG.md 顶部加条目（发版规则要求）
- [ ] 6.5 grep 全仓库残留 `switch --auto` / `worktree switch` / 隔离检测相关引用，逐一清理；`src/` 下如有引用一并处理

## 7. 验证

- [ ] 7.1 `openspec validate` 通过（新增/移除 delta 合法、scenario 四井号格式正确）
- [ ] 7.2 `pnpm typecheck && pnpm build && pnpm test` 全绿
- [ ] 7.3 通读三份改动命令模板与 spec delta，确认 16 条决策逐条有落点（对照 todo.md）