## Context

- `/ly:propose` 现状在**方案提交后 / 审查循环终止后**共四处询问 worktree（全自动 6a 两处、手动 6b 两处），切换依赖 `/ly:worktree switch <change-name>`——它要求 change 已存在且 `proposal.md`/`tasks.md` 已提交，语义上只能用于"change 已生成之后"。
- 全自动路径复用 `switch --auto` 的续接文案承诺"实施后自动审查"，跨命令、跨会话，非真自动化。
- 产物暂存区持有（propose 不清零不提交、apply 跳过审查才询问提交），审查对象是未提交 diff（`git diff HEAD`）。v1.4.3 曾删除 `HEAD~1`/`git show HEAD` 历史兜底，因审查对象原则上是未提交变更。
- commands 层为纯提示词驱动（`templates/commands/*.md`），无独立执行逻辑；`worktree-switch` 的能力已固化在 `openspec/specs/worktree-switch/spec.md`。

## Goals / Non-Goals

**Goals:**
- worktree 询问只在**创建方案前**出现一次，从当前分支 HEAD 切入，之后 propose/apply/review 全程不再询问。
- 全自动 = 同会话连续流水线（review-plan → apply → review-code），非清零即停；`switch`/`--auto` 退役。
- propose 产物每步 commit（`propose: <change>`）；apply 实施完立即 commit（`apply: <change>`）。
- 审查对象 = 最近一次相关 commit，review-plan/review-code 一致处理。

**Non-Goals:**
- 不改变 review-修复循环本身的提交时机（`ly-review-gates` 的"结束时统一提交"不动）。
- 不自动 archive（仍手动）。
- 不引入新的 CLI 执行层（commands 仍是提示词驱动）。
- 不要求 worktree 名等于 change 名。

## Decisions

### D1: worktree 询问收敛到创建方案前单点，从当前分支 HEAD 切
- `propose.md` 在委托 `opsx:propose` 之前：`git rev-parse --git-dir != --git-common-dir`（排除子模块）→ 已在 worktree 内 → 跳过询问；不在 → 问一次"是否切到隔离 worktree"。
- 选"是"：`git worktree add -b <开发分支名> ~/.ly/worktrees/<项目名>/<开发分支名> <当前分支HEAD>`；批量复制 `.env` + 跑 baseline；打印续接命令 `cd <绝对路径> && claude "继续在隔离 worktree 中 /ly:propose <同一需求>"`；**本次会话结束**，不调用 `opsx:propose`。
- 选"否"：留在当前工作区继续。
- **替代方案**：复用 `switch <change-name>` 前置模式——但 change 尚不存在时其 tasks.md/拓扑校验失效，需造"前置 switch"，不如直接 `git worktree add`。选定直接 `git worktree add`。

### D2: 全自动/手动询问与 worktree 询问共点，各只一次，正交
- 两个询问都只在创建方案前；已在 worktree 内时跳过 worktree 询问、全自动/手动照问。
- 全自动绝不隐含"必须隔离"（选全自动可不切）；隔离绝不隐含"必须自动"（隔离后手动）。
- **替代方案**：合并为一次询问携带两个维度——被"各只一次、正交"否决：合并后无法独立表达"选隔离但手动"。

### D3: `switch`/`--auto` 退役；apply 侧隔离检测移除
- `worktree.md` 删除 `switch` 子命令定义；命令树只留 `add/list/remove/prune/migrate`。
- `apply.md` 删除固定目标路径 + 分支双重匹配 + "是否先切换"询问；apply 只解析 change 名并直接在当前工作区实施。
- `openspec/specs/worktree-switch/spec.md` 标记 REMOVED（Reason/Migration）；能力移至 `worktree-create-before-propose`。
- **替代方案**：保留 `switch` 无 `--auto` 作为"按 change 名定位"——被"切点前移"否决：无调用方，死重。

### D4: propose 每步 commit + apply 立即 commit
- propose：index 干净 → `git add -- openspec/changes/<change>` → `git commit -m "propose: <change>"` → `git show --name-only` 校验文件集合属于该 change 目录。
- apply：`git add` 本次实际改动 → `git commit -m "apply: <change>"` → 无变动跳过。
- **替代方案（现状）**：暂存区持有、清零/跳过审查才提交——被"每步 commit"否决：全程留档、审查对象清晰。

### D5: 全自动 = 同会话流水线，非清零即停
- review-plan 清零 → 自动 `apply`（立即 commit）→ 自动 `review-code`；任一环节非清零终止 → 停止流水线并报告。
- revise：`archive` 不自动。
- **替代方案**：沿用 `switch --auto` 续接（跨会话）——被真自动化否决。

### D6: 审查对象 = 最近一次相关 commit
- review-plan 审 `propose:` commit；review-code 审 `apply:` commit。
- 范围 = `git show <commit>` 差异 + 当前 `git diff HEAD` + 未跟踪清单（修复未提交不丢失）。
- **替代方案（现状）**：审未提交 diff——被"每步 commit"否决：工作区已干净，diff 为空。

## Risks / Trade-offs

- **worktree 创建前 change 名未知**：`<开发分支名>` 由用户在切换时定，change 名 propose 生成后可能不同——worktree/分支锁定为开发分支名不重命名，apply 以"当前在 worktree 内"为准（不要求 worktree 名等于 change 名）。
- **命令靠提示词驱动**：worktree 询问前置需要 propose.md 明确步骤 + 从当前分支 HEAD 切的具体命令；commands 层改动集中在模板。
- **审查基线的 commit 判定**：`git show` 定位最近相关 commit 的规约（有多个 change 时按目录 / HEAD 顺序）需在实现时明确——spec 已给出"审查范围=相关 commit + 未提交修复"的固定规约。
- **doc 漂移**：CLAUDE.md 变更记录、`workflow.md` 两张 mermaid 图、`templates/CLAUDE.md` 命令表需同步（task 覆盖）。