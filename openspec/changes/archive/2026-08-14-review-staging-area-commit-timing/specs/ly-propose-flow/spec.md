## MODIFIED Requirements

### Requirement: 生成完 artifact 暂存到暂存区, 不再无条件立即提交, 两个模式分支处理提交时机
`/ly:propose` SHALL 在确定真实 change 名后, 先检查整个 Git index（`git diff --cached --name-only`）；若存在该 change 目录之外的已暂存内容, SHALL 停止并要求用户先处理这些改动（unstage 或另行提交）, 不得把它们一并提交。确认 index 干净后, 执行 `git add -- openspec/changes/<change-name>/`（仅暂存该 change 目录, 不使用 `git add -A` 等宽泛写法）, 然后**按用户在第 1 步总开关中选择的路径分支决定提交时机**, SHALL NOT 无条件立即 commit:

- **全自动路径**: `git add` 后 SHALL NOT 立即 commit——产物保持在暂存区, 直接进入第 6a 步调用 `/ly:review-plan <change-name>`; 由该审查循环在 Critical 清零时(见 `ly-review-gates` 的"循环结束后统一提交")把暂存区中的产物与循环修复一并统一提交。若用户选择走 worktree (`/ly:worktree switch <change-name> --auto`), 产物以暂存区状态存在于该 change 的分支上, 切到 worktree 后继续。
- **手动路径**: `git add` 后 SHALL NOT 立即 commit。在"跳过审查、直接结束"与"审查循环非清零终止"两种场景下, 才由 `/ly:propose` 询问用户是否提交(见 `ly-propose-flow` 的"手动路径下跳过审查或非清零终止时询问是否提交"与"手动路径下审查循环清零后由循环统一提交")。

提交时(自动模式的清零统一提交由 review-plan 完成; 手动模式的跳过提交由 `/ly:propose` 直接执行), 提交信息形如 `propose: <change-name>`。提交完成后 SHALL 用 `git show --name-only --format=` 校验该次 commit 实际包含的文件集合严格属于 `openspec/changes/<change-name>/` 目录。若该目录下无可提交内容、`git commit` 本身失败, 或校验发现文件集合超出该目录范围, `/ly:propose` SHALL 停止后续自动化步骤, 并报告具体原因。

#### Scenario: 全自动路径, artifact 暂存后不立即提交, 由 review-plan 清零时统一提交
- **WHEN** 用户执行 `/ly:propose` 并选择"全自动", `opsx:propose` 刚生成完 `openspec/changes/<change-name>/` 下的 proposal/design/tasks（及 specs, 如适用）, 且 index 中没有该目录之外的已暂存内容
- **THEN** 命令 `git add -- openspec/changes/<change-name>/` 后 SHALL NOT 立即 commit; 产物保持在暂存区, 直接调用 `/ly:review-plan <change-name>`; 审查循环清零时, 统一提交把产物与修复一并提交（提交信息含 `propose` 或 `fix` 前缀, 视清零统一提交规则而定）

#### Scenario: 全自动路径, 审查清零后的统一提交校验文件集合
- **WHEN** 上一 Scenario 中 `/ly:review-plan` 清零并以统一提交收尾（暂存区中的产物+修复一并提交）
- **THEN** 统一提交完成后的校验要求同样适用: 用 `git show --name-only --format=` 确认该次提交的实际文件集合严格属于该 change 目录, 超出范围则停止并报告

#### Scenario: index 中存在目录外的已暂存内容
- **WHEN** 确定真实 change 名后检查 index, 发现存在 `openspec/changes/<change-name>/` 之外的已暂存文件
- **THEN** 命令停止, 报告"检测到该 change 目录外的已暂存内容, 请先处理（unstage 或另行提交）后重试", 不执行 `git add` 也不 commit

#### Scenario: 手动路径, 用户明确跳过审查, 直接询问是否提交
- **WHEN** 用户在手动路径下对"要不要跑 review-plan 审查"选择"否"（跳过审查, 直接结束）
- **THEN** `/ly:propose` 询问用户是否提交该产物; 选"是"则执行 commit（提交信息 `propose: <change-name>`, 用 `git show` 校验文件集合), 编排结束; 选"否"则产物留在暂存区, 编排结束——SHALL NOT 无条件立即 commit

#### Scenario: 无需 commit 时, 产物留在暂存区
- **WHEN** 手动路径下用户选"是"要跑审查, 审查循环非清零终止后选择不提交, 或全自动路径下审查未清零
- **THEN** 产物（含循环修复的改动）保持在暂存区/工作区未提交状态, 不产生任何 commit

### Requirement: 全自动路径下自动调用 review-plan 审查循环, 由循环自身在清零时统一提交
当且仅当用户在开始时选择"全自动", `/ly:propose` SHALL 在完成 `git add` 暂存产物后自动调用 `/ly:review-plan <change-name>`, 该调用 SHALL 复用审查-修复循环规则（见 `ly-review-gates` 能力）。产物以暂存区状态作为审查目标, 由审查循环在 Critical 清零时统一提交（`fix: review-plan feedback ... - <change-name>`）, `/ly:propose` SHALL NOT 从外部拦截或观察循环的中间轮次状态来触发提交, 也 SHALL NOT 在调用前预先 commit 产物。

#### Scenario: 审查循环的清零统一提交由 review-plan 自身完成
- **WHEN** 选择"全自动", `/ly:propose` 暂存产物后调用 `/ly:review-plan <change-name>`, 第一轮发现 1 个 Critical 并修改了 `design.md`, `openspec validate` 通过, 第二轮清零
- **THEN** `/ly:review-plan` 在清零后统一提交（产物原改动 + 设计修复一并提交）, 提交信息形如 `fix: review-plan feedback (经 1 轮修复) - <change-name>`; `/ly:propose` 不需要感知这次提交的时机

### Requirement: 全自动路径下审查循环结束后询问是否切换隔离 worktree，任一终止原因都问
`/ly:propose` 在"全自动"路径下，SHALL 在审查循环终止（无论何种原因）后询问用户是否要为该 change 切换到隔离 worktree：终止原因为"Critical 清零"时，SHALL 调用 `/ly:worktree switch <change-name> --auto`（因为问题已收敛，切换后自然延续自动化）；终止原因为其余任一种（熔断、分歧未决、无法安全修复、验证失败、审查调用失败、提交失败、达到全局轮数上限）时，SHALL 复用该审查循环已产出的终止报告（SHALL NOT 重新生成或重复一份），再询问是否新建隔离 worktree，用户选"是"时调用 `/ly:worktree switch <change-name>`（**不带** `--auto`——问题尚未收敛，不应自动续跑审查，视为自动模式失效、退回人工确认）。用户对任一询问选择"否"时，留在当前工作区，流程结束。

调用 `/ly:worktree switch` 的结果 SHALL 按以下**switch 结果统一判定规则**处理（与 `ly-lifecycle-commands` 能力中 `/ly:apply` 共用同一套规则）：以其**是否最终输出续接命令**为唯一判定依据——输出了续接命令即视为目标 worktree 已就位，直接结束当前编排。续接提示按以下组合规则确定，SHALL NOT 拆成并列、互相独立的多条提示：不带 `--auto`、无 baseline 失败摘要时追加"运行 `/ly:apply` 继续"；不带 `--auto`、有 baseline 失败摘要时改为"处理完 baseline 失败问题后运行 `/ly:apply` 继续"；带 `--auto`（承诺"实施完成后自动依次调用 `/ly:review-code`"）、无 baseline 失败摘要时改写为一条连贯说明"运行 `/ly:apply` 继续实施（完成后自动依次调用 `/ly:review-code`）"；带 `--auto` 且有 baseline 失败摘要时，两个约束都要保留，改写为"处理完 baseline 失败问题后，运行 `/ly:apply` 继续实施（完成后自动依次调用 `/ly:review-code`）"——`--auto` 续接文案中不再包含"自动 commit"字样（apply 已不再自动 commit，见 `ly-lifecycle-commands`）。

#### Scenario: 审查通过后询问，选是时带 --auto
- **WHEN** `/ly:review-plan` 的审查-修复循环以 Critical 清零结束, 产物已由清零统一提交
- **THEN** `/ly:propose` 询问用户"是否为此次改动新建隔离 worktree？"，用户选择"是"时调用 `/ly:worktree switch <change-name> --auto`，选择"否"时结束流程, change 留在当前 worktree

#### Scenario: 带 --auto 切换成功时续接提示合并为一条连贯说明, 且不含"自动 commit"
- **WHEN** 上一 Scenario 中 `switch --auto` 成功输出续接命令，baseline 验证通过
- **THEN** 续接提示 SHALL 是"运行 `/ly:apply` 继续实施（完成后自动依次调用 `/ly:review-code`）"这一条连贯说明, SHALL NOT 包含"自动 commit"字样, SHALL NOT 拆成两条并列的提示

#### Scenario: 熔断或分歧未决时也问，但不带 --auto
- **WHEN** `/ly:review-plan` 的审查-修复循环因"同一问题连续两轮未解决"触发熔断，或因"分歧未决"停止；非清零终止意味着产物留在暂存区未提交
- **THEN** `/ly:propose` 复用该循环已产出的终止报告，按"手动路径下非清零终止时询问是否提交"的规则先询问是否提交产物（或直接按用户选择处理）, 再询问是否新建隔离 worktree；用户选"是"时调用 `/ly:worktree switch <change-name>`（不带 `--auto`）, 选"否"时结束流程

#### Scenario: 无法安全修复/验证失败/审查调用失败/提交失败/达到轮数上限时同样问，但不带 --auto
- **WHEN** `/ly:review-plan` 的审查-修复循环因"无法安全自动修复""修复后验证失败""审查调用失败""提交失败"或"达到全局轮数上限"中任一原因停止
- **THEN** `/ly:propose` 复用该循环已产出的终止报告，再询问是否新建隔离 worktree；用户选"是"时调用 `/ly:worktree switch <change-name>`（不带 `--auto`）, 选"否"时结束流程