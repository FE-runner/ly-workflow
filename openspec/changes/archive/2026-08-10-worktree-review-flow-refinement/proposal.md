## Why

`/ly:propose` 的总开关目前把"要不要 commit"和"要不要走 review/worktree"绑在一起，手动挡下用户完全没有机会走审查循环或切换隔离环境，只能"生成方案+提交"到此为止；同时无论全自动还是手动分支，审查循环一旦以非正常原因终止（熔断/分歧未决/无法安全修复/验证失败/审查调用失败/提交失败/达到轮数上限），命令都直接结束不问 worktree——但这恰恰是最需要人工介入、可能想先拉个隔离环境去处理的时刻。`/ly:apply` 也完全没有 worktree 询问入口。另外全局轮数上限默认 20 轮偏松，正常场景 2-3 轮就该收敛，20 轮的兜底价值不大，且拖长转人工前的等待。

## What Changes

- `/ly:propose` 总开关语义从"要不要走自动化收尾"改为"全自动 vs 手动逐步确认"：
  - 全自动分支：自动跑 `review-plan`，循环终止后无论清零还是其余任一原因都问一次 worktree（清零带 `--auto`，其余原因不带）。
  - 手动分支：commit 后先问一次是否切换 worktree（不带 `--auto`，选是则直接结束）；选否则问要不要跑 `review-plan` 审查；跑了审查后循环终止（无论清零还是其余原因）都再问一次 worktree（不带 `--auto`）。
- 无论全自动还是手动分支，审查循环以"清零"之外的任一终止原因结束时，**都**复用该循环已产出的终止报告（不重新生成或重复一份）、再问一次是否要新建隔离 worktree（不带 `--auto`，因为问题尚未收敛，不应自动续跑审查）——非正常终止等价于退出自动模式，回到人工确认。
- `/ly:apply` 执行 `opsx:apply` 前新增隔离检测：目标 change 名按固定优先级解析（`$ARGUMENTS` 显式合法值 → 当前 worktree 反查出的受控 change → 唯一未归档 change → 询问用户）。定义"该 change 的固定目标路径" = `../.ly/<项目名>/<change-name>`（`/ly:worktree switch` 的默认路径，本次不承认 `--local` 项目内路径为受控目标路径，`switch` 也未定义过 `--local` 用法）；已在某个 worktree 内时，需同时满足"当前根路径严格等于该固定目标路径"与"该路径下注册的分支严格等于目标 change 名"两个条件才算匹配——第二个条件由 `switch` 自身在定位阶段校验并保证（见下）。匹配则直接跳过，不匹配（含 detached HEAD、路径不对、或分支不对这类情形）则询问是否仍在此继续实施还是先切换；完全不在任何 worktree 内则问一次是否要切换隔离 worktree。`switch` 的结果统一按"是否最终输出续接命令"判定：输出了就是切换成功，续接提示按"是否带 `--auto`"和"是否有 baseline 失败摘要"两个维度组合出四种文案（分别覆盖"直接运行 apply""先处理 baseline 再运行 apply""运行 apply 后自动审查""先处理 baseline、运行 apply 后自动审查"），不拆成并列的多条提示；未输出续接命令的三种情况（前置校验拒绝 / baseline 失败且用户选择不继续 / 内层询问被拒绝创建）均转述实际原因，不当作切换成功。
- `/ly:worktree switch <change-name>`：定位到"目标路径已是已注册的 worktree"时，新增校验该路径当前注册的分支是否严格等于 `<change-name>`——不等于则拒绝执行、不直接定位、不输出续接命令。这是本次范围扩大后新增的修改：若不堵住这个口子，`/ly:apply` 侧新加的分支+路径双重匹配保护会被"目标固定路径已被别的分支占用"这种情况绕过（`switch` 照样会因"路径已注册"直接定位并输出续接命令，把用户引导到错误分支）。目标路径的解析统一以 `git rev-parse --git-common-dir` 反推的主仓库位置为基准，不依赖调用发生时所处 worktree 的相对路径，避免从其他 worktree 调用时算出不一致的路径。
- **范围边界（有意不做的事）**：本次全部隔离检测的目标是防误操作，不是防故意绕过——不校验目标分支 `HEAD` 是否真的包含该 change 当前的 artifact（用户可以手工把分支 reset 到无关提交），也不强制 `/ly:worktree switch` 的续接命令必须经过 `/ly:apply`（续接提示仍是建议性引导）。这两点在 Codex 审查的第七轮被提出，判定为超出本次范围，理由与取舍见 design.md Decision 11。
- `/ly:review-code`/`/ly:review-plan` 的全局轮数上限默认值从 20 轮降到 5 轮，且明确"清零优先于轮数上限"——第 N 轮（含第 5 轮）若结果本身是清零，按清零处理，不因命中轮数上限而误报。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `ly-lifecycle-commands`: `/ly:propose` 总开关语义变化（全自动/手动而非"自动化收尾开关"）；`/ly:apply` 新增执行前 worktree 询问。
- `ly-review-gates`: 全局轮数上限默认值从 20 轮降到 5 轮——这是该能力"全局轮数上限作为最后兜底" Requirement 里的具体数值，属于 Requirement 内容变化，需要 delta spec。
- `ly-propose-flow`: 手动分支新增两处 worktree 询问点与一处"要不要跑审查"询问；所有非清零终止原因统一先出报告再问 worktree。
- `worktree-switch`（原范围外，Codex 第六轮审查发现根本性缺口后扩入本次范围，见 design.md Decision 10）: `switch` 定位已注册路径时新增分支校验，不匹配则拒绝而不是直接定位。

## Impact

- `templates/commands/propose.md`：重写总开关分支逻辑。
- `templates/commands/apply.md`：新增执行前隔离检测与 worktree 询问。
- `templates/commands/worktree.md`：`switch` 子命令新增"定位已注册路径时校验分支"逻辑。
- `templates/commands/review-plan.md`、`templates/commands/review-code.md`：全局轮数上限 20→5（本次会话已提前手动应用，本 change 用于补齐对应 spec 与 tasks 记录，实施阶段核对一致性）。
- `openspec/specs/ly-lifecycle-commands/spec.md`、`openspec/specs/ly-propose-flow/spec.md`、`openspec/specs/ly-review-gates/spec.md`、`openspec/specs/worktree-switch/spec.md`：同步新增/调整 Requirement 与 Scenario。
- `workflow.md`（仓库根目录）：三张 mermaid 流程图已在会话中和用户逐步核对，作为本次改动的设计参照，不属于正式文档，不纳入 tasks 的产出物范围。
