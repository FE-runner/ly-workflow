## MODIFIED Requirements

### Requirement: 代码审查读取 git diff 并分级输出发现
`/ly:review-code` 必须（SHALL）按以下方式确定审查范围：若存在未提交变更（已暂存或未暂存均可，审查对象是"当前工作区尚未提交的变更"这整个集合），使用 `git diff HEAD`（覆盖已暂存的修改与未暂存的修改）。**当且仅当**当前工作区连同暂存区都干净（没有任何未提交变更）时——无论仓库是否存在历史 commit——命令必须（SHALL）报告"无变更可审查"，直接结束，SHALL NOT 回退到审查任何历史 commit 的 diff（`git diff HEAD~1` / `git show HEAD` 这类以历史 commit 为审查对象的兜底分支已废弃：审查对象原则上是"未提交的变更"，历史 commit 不属于审查范围）。由于 `git diff HEAD` 不会显示未跟踪文件，命令必须额外列出未跟踪文件（用 `git status --porcelain` 过滤出 `??` 条目）并把其路径并入审查上下文，确保新建但未 `git add` 的文件不会被静默漏审。若仓库尚无任何 commit（`git rev-parse HEAD` 执行失败），命令必须以固定的三条 git 命令组合表达审查范围，而不是构造某种独立持久化的"快照"：`git diff --cached`（已暂存的改动）、`git diff`（未暂存的改动）、`git status --porcelain` 过滤 `??` 得到的未跟踪文件路径清单；不得尝试执行 `git diff HEAD` 或 `git diff HEAD~1`（这两者在无 HEAD 时无意义或报错）。命令必须以 `codex/reviewer.md` 角色提示词调用 `codeagent-wrapper --backend codex`, 并将发现严格分为三个严重度层级：Critical、Warning、Info。**首轮审查确定的审查范围（`git diff HEAD`，或零 commit 场景下的上述三条命令组合说明）必须（SHALL）被记录, 供首轮 TASK 使用**——工作区干净场景直接报告"无变更"即可，不存在需要记录的基线。第 2 轮起, 审查范围语义改为"对上一轮 Critical 的回归验证 + 本轮改动的增量审查"（不再是"基线 → 当前工作区完整状态"的地毯式复审）, 具体规则见"审查-修复循环与终止条件（review-code / review-plan 共用）"里的"第 2 轮起的 TASK 内容构造方式"。零 commit 场景下, 由于该三条命令每次执行都直接反映"当前"状态（不依赖某个固定时点的快照）, 修复导致某文件从"已暂存"变为"未暂存"不构成任何特殊问题——第 2 轮起的路径清单机制本身就是按文件当前路径读取内容, 与该文件处于 staged 还是 unstaged 无关。若存在 Critical 发现, 命令必须（SHALL）进入审查-修复循环（见"审查-修复循环与终止条件（review-code / review-plan 共用）"）, 而不是止步于报告。

**首轮 TASK 内容构造方式**：Codex backend 以 agentic 模式运行（具备在 `WORKDIR` 下自主执行 shell 命令、读取文件的能力）, 命令 SHALL NOT 由 Claude 预先把首轮基线对应的完整 diff 文本或未跟踪文件的完整内容拼接进 TASK 字符串；TASK 必须（SHALL）改为传递首轮确定的审查范围说明（`git diff HEAD`，或零 commit 场景下"运行 `git diff --cached` + `git diff` + 未跟踪文件路径清单"这三条命令组合的说明）, 并指示 Codex 自行执行这些命令/读取指定路径获取审查所需的实际内容。判定审查范围本身（是否存在未提交变更、选择 `git diff HEAD` 还是零 commit 三命令组合）仍由 Claude 完成, 不下放给 Codex。

#### Scenario: 存在未提交变更且无 Critical
- **WHEN** 用户在工作区存在未提交变更时运行 `/ly:review-code`, 且 Codex 审查未发现任何 Critical
- **THEN** 审查范围是 `git diff HEAD`, 发现按 Critical/Warning/Info 分级输出, 命令直接结束, 不进入修复循环

#### Scenario: 已跟踪的修改与新建的未跟踪文件同时存在
- **WHEN** 用户运行 `/ly:review-code`, 工作区里既有已跟踪文件的修改, 也有一个新建的未跟踪文件
- **THEN** TASK 中包含 `git diff HEAD` 对应的审查范围说明和该未跟踪文件的路径, Codex 自行读取两者的实际内容进行审查——未跟踪文件不会被静默遗漏

#### Scenario: 工作区干净但有历史提交, 报告无变更
- **WHEN** 用户在没有未提交变更、但存在历史提交时运行 `/ly:review-code`
- **THEN** 命令报告"无变更可审查"并直接结束, SHALL NOT 回退审查 `git diff HEAD~1` 或 `git show HEAD`——历史 commit 的 diff 不属于"代码审查"的审查范围

#### Scenario: 仓库只有一个 commit 且工作区干净
- **WHEN** 用户在没有未提交变更、且仓库恰好只有一个 commit 时运行 `/ly:review-code`
- **THEN** 命令报告"无变更可审查", SHALL NOT 审查该单个 commit 的完整内容——审查对象是未提交的变更, 不是历史 commit

#### Scenario: 仓库尚无任何 commit
- **WHEN** 用户在一个完全没有 commit 的仓库中运行 `/ly:review-code`（`git rev-parse HEAD` 会失败）
- **THEN** 命令以"`git diff --cached` + `git diff` + 未跟踪文件路径清单"这三条固定命令组合表达审查范围, 而不是因缺失 `HEAD` 引用而报错；TASK 中向 Codex 说明这三条命令, 由 Codex 自行执行并读取当前工作区内容, 不由 Claude 把内容整段贴入 TASK

#### Scenario: 零 commit 场景下已暂存文件被直接修改, 复审仍能定位到该文件
- **WHEN** 首轮审查用三条命令组合确定了审查范围, Claude 修复某文件时直接编辑了工作区副本（未重新 `git add`）, 导致该文件此后处于未暂存状态
- **THEN** 第二轮路径清单里仍以该文件当前工作区路径给出（不依赖 staged/unstaged 状态标签）, Codex 读取该路径的当前内容即可看到这次修复, 不会因为该文件从 staged 变成 unstaged 而被漏审

#### Scenario: 无发现
- **WHEN** codex 审查员没有返回任何问题
- **THEN** 命令明确说明未发现问题, 而不是保持沉默

#### Scenario: 首轮 TASK 不预先拼贴完整 diff 文本
- **WHEN** 首轮审查范围判定为 `git diff HEAD`, 且该 diff 内容有数百行
- **THEN** 传给 Codex 的 TASK 只包含审查范围说明（例如"审查 `git diff HEAD`"）及未跟踪文件路径清单, 不包含 Claude 预先读取、拼接的完整 diff 文本；Codex 在 `WORKDIR` 下自行执行 `git diff HEAD` 获取实际内容

### Requirement: 循环结束后统一提交, `--no-commit` 关闭最终提交
`/ly:review-code` 与 `/ly:review-plan` 默认（不传任何标志）在循环执行期间 SHALL NOT 提交——每一轮修复完成后只运行验证（`/ly:review-code` 为测试/类型检查/构建；`/ly:review-plan` 为 `openspec validate`），不执行 git commit，改动保持在工作区（修复改动一律留在工作区未暂存状态；审查目标本身的原始改动可能已由编排方 `/ly:propose`、`/ly:apply` 暂存，命令 SHALL NOT 主动改变文件的 staged 状态）。仅当循环以"正常清零"结束（某一轮 Critical 数为 0）时，命令必须（SHALL）在输出报告之前对**审查目标全部文件**执行一次统一提交：先 `git add` 审查目标范围内的全部文件（`/ly:review-code` 为审查范围圈定的全部代码文件——原始改动 + 循环期间修复的改动全部暂存；`/ly:review-plan` 为目标 change 目录下的 `proposal.md`/`design.md`/`tasks.md` 及全部 delta spec 文件——含编排方早已暂存的产物与循环期间修复的文件，一并暂存），再执行一次 commit（仅暂存并提交这些文件，不做范围外的 `git add`），提交信息包含 `fix:` 前缀、目标标识（change 名或审查对象说明）与总轮次说明（例如"经 N 轮修复"）。

**审查目标原始改动的提交归属**：`/ly:review-code` 的审查目标本身就是"当前工作区尚未提交的变更"（`git diff HEAD` 圈定的范围），这些文件在循环开始前处于未提交状态是设计上的正常输入；同样地，`/ly:review-plan` 的审查目标（该 change 的 artifact 与 delta spec 文件）现在也允许在循环开始前处于未暂存或已暂存状态（`/ly:propose` 编排下产物已暂存、独立运行时可能未暂存）。循环产生的修复是在这份原始改动之上的修正，清零后的统一提交本来就应同时包含"原始改动"与"审查修正"，二者是同一个待提交单元，不需要也不应该被拆开。**因此 `review-plan` 场景下不再存在任何"循环开始前已脏的文件被跳过提交"的隔离逻辑**——propose 产物是合法审查对象不是无关脏文件，用户手工编辑的 artifact 同样属于审查目标内容，一并提交；删除对"循环开始前未提交状态文件"的 `git status --porcelain` 预检查和隔离跳过行为。

若循环全程没有任何 Critical 被认可修复（从未发生实际文件改动），SHALL NOT 创建空 commit。若循环以其余任一终止条件结束（熔断、无法安全修复、验证失败、分歧未决、审查对象类型持续系统性误判）或达到全局轮数上限，命令 SHALL NOT 提交，已产生的改动保持在工作区未提交状态，交由人工核实后自行决定是否提交——这些场景本身已经需要人工介入，不适合先自动提交半成品。当编排方（`/ly:propose` 或 `/ly:apply`）按自身规则决定对这类非清零终止的改动是否提交（见 `ly-propose-flow`、`ly-lifecycle-commands` 能力中的手动模式询问规则）时，是编排方层面在循环结束后对暂存区做提交决策，SHALL NOT 被理解为 review 循环自身的行为；循环自身的约束始终是"非清零 SHALL NOT 提交"。若"正常清零"后的这次统一提交本身执行失败（Git hook 拒绝、身份未配置、锁文件冲突等），必须（SHALL）在报告中如实说明该失败，视为"循环已清零, 但统一提交失败"的独立结果——循环本身不重新进入下一轮（因为已经清零, 没有下一轮的意义），但报告必须明确指出还需要人工手动完成这次提交。传入可选标志 `--no-commit` 时，命令 SHALL NOT 执行这次最终统一提交（不管循环以何种方式结束），修复结果始终留给调用方或用户自行处理。

#### Scenario: review-plan 场景下, 编排方暂存的产物与循环修复一并统一提交
- **WHEN** `/ly/propose` 将 `openspec/changes/<change-name>/` 下的产物 `git add` 暂存后调用 `/ly:review-plan <change-name>`; 循环期间因某条 Critical 修复了 `design.md` 与一份 delta spec, 最终清零
- **THEN** 清零后的统一提交先 `git add` 该 change 目录下的全部 artifact 与 delta spec 文件（含编排方已暂存的产物与循环的修复改动）, 再执行一次 commit——产物与修复作为同一待提交单元一并提交, 不存在"循环开始前已脏被跳过"的隔离

#### Scenario: review-code 场景下, 被审查的原始改动与修复一并提交
- **WHEN** 用户在触发 `/ly:review-code` 前已有未提交的代码改动（这正是本次的审查对象), 循环期间修复了其中一个 Critical 后清零
- **THEN** 统一提交时先把审查范围内全部文件 `git add`（用户原始改动 + 循环期间修复一并暂存）, 再执行 commit——二者作为同一份改动一起提交, 不做隔离——这是 `/ly:review-code` 的正常预期行为

#### Scenario: 正常清零后统一提交一次
- **WHEN** 用户（或编排该命令的上层流程）执行 `/ly:review-plan <change-name>`（不带任何标志）, 第一轮发现 1 个 Critical 并修复、`openspec validate` 通过, 第二轮 Critical 数为 0
- **THEN** 循环期间（第一轮修复后）不执行任何 commit; 第二轮清零后, 命令 `git add` 该 change 目录全部 artifact 与 delta spec 文件, 在输出报告之前统一提交, 提交信息形如 `fix: review-plan feedback (经 1 轮修复) - <change-name>`

#### Scenario: 带 --no-commit 时不做最终提交
- **WHEN** 用户执行 `/ly:review-code --no-commit`, 循环修复了若干 Critical 后清零结束
- **THEN** 命令不执行任何 commit（循环期间和清零后都不提交）, 修改的文件保持在工作区未提交状态

#### Scenario: 循环以非清零终止条件结束, 循环自身不提交已产生的改动
- **WHEN** `/ly:review-code` 第一轮修复 1 个 Critical 后, 第二轮审查判定该问题仍存在（触发熔断）
- **THEN** 循环自身不提交第一轮的改动, 已修改的文件保持在工作区未提交状态, 报告中说明需要人工核实是否保留这次修复; 是否提交改由编排方（`/ly:propose`/`/ly:apply` 手动模式）按自身规则询问用户后决定

#### Scenario: 本轮无实际改动, 不创建空 commit
- **WHEN** 循环从未有任何 Critical 被 Claude 判定为认可（因而从未发生实际文件改动), 最终以某种方式清零或终止
- **THEN** 命令不执行 commit, 不产生空提交

#### Scenario: 清零后的统一提交本身失败
- **WHEN** 循环第二轮清零, 命令尝试执行统一提交, 但因 pre-commit hook 拒绝或 Git 身份未配置导致 commit 失败
- **THEN** 命令不重新进入循环（因为已经清零), 在报告中如实说明这次统一提交失败的原始错误信息, 并指出需要人工手动完成提交