## MODIFIED Requirements

### Requirement: 方案审查解析目标 change 且排除已归档项
`/ly:review-plan` 必须（SHALL）按以下优先级解析目标 change：（1）通过 `$ARGUMENTS` 传入的显式 change 名称；（2）若未指定, 且 `openspec/changes/` 下恰好只有一个 change 目录时, 使用该目录；（3）若存在多个 change 目录且未指定, 询问用户要审查哪一个。枚举候选目录时必须（SHALL）排除 `openspec/changes/archive/` 目录及其内容——已归档的 change 不是可选目标。解析完成后, 必须读取该 change 的 `proposal.md`、`design.md`、`tasks.md`（存在的部分）, 将其合并内容作为审查上下文传给以 `codex/reviewer.md` 角色提示词调用的 `ly-wrapper --backend codex`。审查必须聚焦方案的合理性——遗漏的边界情况、范围不清晰、风险点——而非逐行代码风格。

#### Scenario: change 有 proposal 和 tasks 但没有 design
- **WHEN** 用户对一个有 `proposal.md` 和 `tasks.md` 但没有 `design.md` 的 change 运行 `/ly:review-plan`
- **THEN** 命令审查现有的工件, 不因缺失 `design.md` 而报错

#### Scenario: 不存在活跃 change
- **WHEN** 用户运行 `/ly:review-plan` 且无法解析出任何 change 目录
- **THEN** 命令询问用户要审查哪个 change, 而不是凭空猜测

#### Scenario: 存在多个 change 且未显式指定
- **WHEN** 用户不带参数运行 `/ly:review-plan`, 且 `openspec/changes/` 下存在多个非归档的 change 目录
- **THEN** 命令询问用户要审查哪一个, 而不是任意挑一个

#### Scenario: 显式指定了 change 名称
- **WHEN** 用户运行 `/ly:review-plan <change-name>`
- **THEN** 命令直接审查该指定 change 目录, 不再询问用户消歧

#### Scenario: 只剩已归档的 change
- **WHEN** 用户不带参数运行 `/ly:review-plan`, `openspec/changes/` 下有一个活跃 change 和一个存放历史归档 change 的 `archive/` 目录
- **THEN** `archive/` 目录及其内容被排除在候选解析之外, 因此那个唯一的活跃 change 被直接选中, 不触发消歧询问

### Requirement: 代码审查读取 git diff 并分级输出发现

`/ly:review-code` 必须（SHALL）按以下方式确定审查范围：若存在未提交变更（已暂存或未暂存均可，审查对象是"当前工作区尚未提交的变更"这整个集合），使用 `git diff HEAD`（覆盖已暂存的修改与未暂存的修改）。**当且仅当**当前工作区连同暂存区都干净（没有任何未提交变更）时——无论仓库是否存在历史 commit——命令必须（SHALL）报告"无变更可审查"，直接结束，SHALL NOT 回退到审查任何历史 commit 的 diff（`git diff HEAD~1` / `git show HEAD` 这类以历史 commit 为审查对象的兜底分支已废弃：审查对象原则上是"未提交的变更"，历史 commit 不属于审查范围）。由于 `git diff HEAD` 不会显示未跟踪文件，命令必须额外列出未跟踪文件（用 `git status --porcelain` 过滤出 `??` 条目）并把其路径并入审查上下文，确保新建但未 `git add` 的文件不会被静默漏审。若仓库尚无任何 commit（`git rev-parse HEAD` 执行失败），命令必须以固定的三条 git 命令组合表达审查范围，而不是构造某种独立持久化的"快照"：`git diff --cached`（已暂存的改动）、`git diff`（未暂存的改动）、`git status --porcelain` 过滤 `??` 得到的未跟踪文件路径清单；不得尝试执行 `git diff HEAD` 或 `git diff HEAD~1`（这两者在无 HEAD 时无意义或报错）。命令必须以 `codex/reviewer.md` 角色提示词调用 `ly-wrapper --backend <init 选定的审查后端>`（默认 `codex`）, 并将发现严格分为三个严重度层级：Critical、Warning、Info。**首轮审查确定的审查范围（`git diff HEAD`，或零 commit 场景下的上述三条命令组合说明）必须（SHALL）被记录, 供首轮 TASK 使用**——工作区干净场景直接报告"无变更"即可，不存在需要记录的基线。第 2 轮起, 审查范围语义改为"对上一轮 Critical 的回归验证 + 本轮改动的增量审查"（不再是"基线 → 当前工作区完整状态"的地毯式复审）, 具体规则见"审查-修复循环与终止条件（review-code / review-plan 共用）"里的"第 2 轮起的 TASK 内容构造方式"。零 commit 场景下, 由于该三条命令每次执行都直接反映"当前"状态（不依赖某个固定时点的快照）, 修复导致某文件从"已暂存"变为"未暂存"不构成任何特殊问题——第 2 轮起的路径清单机制本身就是按文件当前路径读取内容, 与该文件处于 staged 还是 unstaged 无关。若存在 Critical 发现, 命令必须（SHALL）进入审查-修复循环（见"审查-修复循环与终止条件（review-code / review-plan 共用）"）, 而不是止步于报告。从第 2 轮起必须（SHALL）复用本流程首轮取得的 session_id（见 additional 的"审查循环轮间续聊（同一流程内复用）"规则）通过 resume 模式延续会话。

**首轮 TASK 内容构造方式**：审查后端以 agentic 模式运行（具备在 `WORKDIR` 下自主执行 shell 命令、读取文件的能力）, 命令 SHALL NOT 由 Claude 预先把首轮基线对应的完整 diff 文本或未跟踪文件的完整内容拼接进 TASK 字符串；TASK 必须（SHALL）改为传递首轮确定的审查范围说明（`git diff HEAD`，或零 commit 场景下"运行 `git diff --cached` + `git diff` + 未跟踪文件路径清单"这三条命令组合的说明）, 并指示审查后端自行执行这些命令/读取指定路径获取审查所需的实际内容。判定审查范围本身（是否存在未提交变更、选择 `git diff HEAD` 还是零 commit 三命令组合）仍由 Claude 完成, 不下放给审查后端。

#### Scenario: 存在未提交变更且无 Critical
- **WHEN** 用户在当前工作区存在未提交变更时运行 `/ly:review-code`, 且审查后端审查未发现任何 Critical
- **THEN** 审查范围是 `git diff HEAD`, 发现按 Critical/Warning/Info 分级输出, 命令直接结束, 不进入修复循环

#### Scenario: 已跟踪的修改与新建的未跟踪文件同时存在
- **WHEN** 用户运行 `/ly:review-code`, 工作区里既有已跟踪文件的修改, 也有一个新建的未跟踪文件
- **THEN** TASK 中包含 `git diff HEAD` 对应的基线引用说明和该未跟踪文件的路径, 审查后端自行读取两者的实际内容进行审查——未跟踪文件不会被静默遗漏

#### Scenario: 工作区干净但有历史提交, 报告无变更
- **WHEN** 用户在没有未提交变更、但存在历史提交时运行 `/ly:review-code`
- **THEN** 命令报告"无变更可审查"并直接结束, SHALL NOT 回退审查 `git diff HEAD~1` 或 `git show HEAD`——历史 commit 的 diff 不属于"代码审查"的审查范围

#### Scenario: 仓库只有一个 commit 且工作区干净
- **WHEN** 用户在没有未提交变更、且仓库恰好只有一个 commit 时运行 `/ly:review-code`
- **THEN** 命令报告"无变更可审查", SHALL NOT 审查该单个 commit 的完整内容——审查对象是未提交的变更, 不是历史 commit

#### Scenario: 仓库尚无任何 commit
- **WHEN** 用户在一个完全没有 commit 的仓库中运行 `/ly:review-code`（`git rev-parse HEAD` 会失败）
- **THEN** 命令以"`git diff --cached` + `git diff` + 未跟踪文件路径清单"这三条固定命令组合表达审查范围, 而不是因缺失 `HEAD` 引用而报错；TASK 中向审查后端说明该三条命令, 由审查后端自行执行并读取当前工作区内容, 不由 Claude 把内容整段贴入 TASK

#### Scenario: 无发现
- **WHEN** 审查后端没有返回任何问题
- **THEN** 命令明确说明未发现问题, 而不是保持沉默

#### Scenario: 首轮 TASK 不预先拼贴完整 diff 文本
- **WHEN** 首轮审查范围判定为 `git diff HEAD`, 且该 diff 内容有数百行
- **THEN** 传给审查后端的 TASK 只包含基线引用说明（例如"审查 `git diff HEAD`"）及未跟踪文件路径清单, 不包含 Claude 预先读取、拼接的完整 diff 文本；审查后端在 `WORKDIR` 下自行执行 `git diff HEAD` 获取实际内容

#### Scenario: 审查后端由 init 选定而非固定 codex（review-code）
- **WHEN** 用户已经通过 init 把 `routing.reviewer` 设为 `hermes`, 然后运行 `/ly:review-code`
- **THEN** 命令以 `--backend hermes` 调用 `ly-wrapper`, 而非 `codex`

#### Scenario: 第 2 轮以 resume 模式续聊同一会话
- **WHEN** `/ly:review-code` 第一轮结束, wrapper 返回了 session_id, 第一轮存在未清零的 Critical, 循环进入第二轮
- **THEN** 第二轮调用 wrapper 时以 resume 模式传回该 session_id让审查后端在同一会话上下文中复审, 而非另起全新会话

### Requirement: 方案审查分级输出发现
`/ly:review-plan` 必须（SHALL）读取目标 change 的 `proposal.md`/`design.md`/`tasks.md`（存在的部分即可, 缺失容错跳过）以及该 change 目录下 `specs/**/*.md` 的全部 delta spec 文件（若存在；不存在则容错跳过, 不报错）的路径, 以 `codex/plan-reviewer.md` 角色提示词（而非 `/ly:review-code` 使用的 `codex/reviewer.md`）调用 `ly-wrapper --backend <init 选定的审查后端>`（默认 `codex`）, 并将发现严格分为三个严重度层级：Critical、Warning、Info（与 `/ly:review-code` 一致, 不再使用不分级的"问题清单"格式）。**首轮**审查必须（SHALL）确保审查后端读取到这些文件的**当前内容**（不是 diff），不需要记录或复用基线——因为审查对象是文件当前状态而非变更范围, 不存在"审查范围漂移"问题。**第 2 轮起**改为增量语义, 具体规则见"审查-修复循环与终止条件（review-code / review-plan 共用）"里的"第 2 轮起的 TASK 内容构造方式"。审查必须（SHALL）聚焦方案文档本身的逻辑缺陷：遗漏的边界情况、范围不清晰、`proposal.md`/`design.md`/`tasks.md`/对应 spec 之间互相矛盾或脱节、风险点交代不清、spec 的 Requirement/Scenario 未覆盖 proposal 的 What Changes。**"spec 未覆盖 What Changes"这一检查项必须（SHALL）区分两种"该 change 没有 delta spec 文件"的情形**（`openspec validate`/`openspec archive` 只校验"该 change 的 delta 总数是否为 0"，不逐个核对 proposal 声明的每个 capability 是否都有对应 delta spec，因此这条检查是唯一能在方案阶段捕捉"部分/全部 capability 缺失覆盖"的机制，不能被下游工具兜底）：（a）该 change 的 `proposal.md` 的 Capabilities 段落本身未声明任何 New/Modified Capability（纯重构/工具/文档类变更, 通常配合 `.openspec.yaml` 的 `skip_specs: true`）——此时没有 delta spec 文件属于正常情况, SHALL NOT 报 Critical；（b）`proposal.md` 的 Capabilities 段落声明了至少一个 New/Modified Capability, 但该 change 目录下完全没有任何 delta spec 文件（不管 `skip_specs` 是否被设置为 `true`）——此时命令必须（SHALL）报告 Critical, 指出"proposal 声明了 capability 变更但没有任何 delta spec 覆盖"；若 `skip_specs: true` 与声明的 capability 变更同时存在, 额外指出这是 `skip_specs` 使用不当（真正无行为变更的 change 不应在 Capabilities 段落列出任何 capability）。`codex/plan-reviewer.md` 必须（SHALL）明确约束：SHALL NOT 将"代码库尚未实现某方案条目"或"`tasks.md` 中某任务未勾选"作为 Critical 依据——这是方案审查阶段（实施尚未开始或尚未完成）的正常状态, 不构成方案缺陷。若存在 Critical 发现, 命令必须（SHALL）进入审查-修复循环（见"审查-修复循环与终止条件（review-code / review-plan 共用）"）, 而不是止步于报告。

**首轮 TASK 内容构造方式**：命令**（SHALL）**不（SHALL NOT）由 Claude 预先读取 `proposal.md`/`design.md`/`tasks.md`/`specs/**/*.md` 的全文并拼接进 TASK 字符串；TASK 必须（SHALL）改为传递该 change 目录路径及需要审查的文件相对路径清单（`proposal.md`/`design.md`/`tasks.md`, 以及枚举到的全部 delta spec 文件路径）, 并指示审查后端在 `WORKDIR` 下自行读取这些文件的当前内容进行审查——并要求命令必须（SHALL）明确列出全部 delta spec 文件的路径（不能只提示"读取 specs 目录"而不枚举具体路径, 避免审查后端遗漏部分 delta spec 文件), **SHALL NOT** 仅在角色提示词里描述 checklist 项却不提供文件路径清单, 否则审查后端无从定位需要读取哪些 spec 文件。若该 change 的某份 delta spec 文件（无论出现在 `## MODIFIED Requirements` 内还是外）中显式文字引用了基线 spec 里未被本次修改的既有 Requirement（例如"见……'某 Requirement 名'"这类指代, 包括本 delta 自身在 MODIFIED Requirement 正文中引用同一 capability 基线里其他未改动 Requirement 的情况), 命令必须（SHALL）额外将该基线能力对应的 `openspec/specs/<capability>/spec.md` 路径纳入首轮路径清单, 并在 TASK 中说明该文件仅作审查上下文（用于核实引用是否准确、是否与 delta 冲突), 不属于本次修复对象——避免审查后端因看不到被引用的既有 Requirement 定义而误判为遗漏或凭空猜测其内容。

#### Scenario: 无 Critical
- **WHEN** 用户运行 `/ly:review-plan`, 审查后端未发现任何 Critical（可能有 Warning/Info）
- **THEN** 发现按 Critical/Warning/Info 分级输出, 命令直接结束, 不进入修复循环

#### Scenario: 无任何发现
- **WHEN** 审查后端对 proposal/design/tasks 没有返回任何问题
- **THEN** 命令明确说明"方案审查未发现问题", 而不是保持沉默

#### Scenario: 多个候选 change 且未指定
- **WHEN** 用户运行 `/ly:review-plan` 且未通过 `$ARGUMENTS` 指定 change 名, `openspec/changes/` 下（排除 `archive/`）存在多个候选
- **THEN** 命令用 AskUserQuestion 询问用户选择哪个 change, 不猜测

#### Scenario: 方案条目未实现不构成 Critical
- **WHEN** 某个 change 的 `tasks.md` 里存在多个未勾选的任务（对应代码库中尚未实现该功能）, 审查后端依据 `codex/plan-reviewer.md` 审查该 change
- **THEN** 未勾选的任务、代码库中尚未实现该方案条目, 均不作为 Critical 依据被报告；审查只针对 `proposal.md`/`design.md`/`tasks.md` 及对应 spec 本身的逻辑缺陷（遗漏边界、范围不清晰、文档间矛盾、风险点交代不清、spec 未覆盖 What Changes）

#### Scenario: spec 未覆盖 proposal 的 What Changes, 审查后端自行读取 delta spec 内容后判定
- **WHEN** 某 change 的 `proposal.md` 的 What Changes 提到某项新行为, 该 capability 存在对应的 `specs/<capability>/spec.md` 文件, 但其中对应 Requirement 未提及这项行为
- **THEN** 命令必须已在 TASK 中列出该 change 目录下全部 `specs/**/*.md` 的路径, 审查后端自行读取这些文件内容后才能据此判定"spec 未覆盖 What Changes"这一 Critical

#### Scenario: proposal 未声明任何 capability, 无 delta spec 属于正常情况
- **WHEN** 某 change 的 `proposal.md` 的 Capabilities 段落中 New/Modified Capabilities 均为空（纯重构/清理/文档类变更), 该 change 目录下没有任何 delta spec 文件
- **THEN** 命令不报告 Critical, 视为正常情况——`skip_specs: true` 与"未声明任何 capability"是一致的

#### Scenario: proposal 声明了 capability 变更但完全没有 delta spec, 报告 Critical
- **WHEN** 某 change 的 `proposal.md` 的 Capabilities 段落声明了至少一个 New/Modified Capability, 但该 change 目录下 `specs/**/*.md` 一个文件都不存在
- **THEN** 命令必须报告 Critical, 说明"proposal 声明了 capability 变更但没有任何 delta spec 覆盖"; 若该 change 的 `.openspec.yaml` 同时设置了 `skip_specs: true`, 额外说明该 `skip_specs` 使用不当（`openspec validate`/`openspec archive` 不会拦截这种情况, 只有这一步能捕捉到)

#### Scenario: 首轮 TASK 只传路径清单, 不拼贴全文
- **WHEN** 某 change 的 `proposal.md`、`design.md`、`tasks.md` 及两份 delta spec 文件总长度超过千行
- **THEN** 传给审查后端的 TASK 只包含该 5 个文件各自的相对路径清单和该 change 目录路径, 不包含 Claude 预先读取、拼接的完整文件内容；审查后端在 `WORKDIR` 下自行读取这些路径对应的当前内容

#### Scenario: 审查后端由 init 选定而非固定 codex
- **WHEN** 用户已经通过 init 把 `routing.reviewer` 设为 `hermes` 或 `openclaw`, 然后运行 `/ly:review-plan`
- **THEN** 命令以 `--backend hermes`（或对应后端）调用 `ly-wrapper`, 而非 `--backend codex`

### Requirement: 审查调用失败视为独立终止条件
若 `ly-wrapper` 调用超时、以非零状态退出、返回空响应, 或返回内容未能按 Critical/Warning/Info 格式解析, `/ly:review-code` 与 `/ly:review-plan` 必须（SHALL）将其视为一次独立的终止条件, 立即停止循环, 报告原始失败信息（退出码/超时说明/原始输出片段）, SHALL NOT 将其等同于"本轮无 Critical 发现"或视为清零通过。

#### Scenario: 审查调用超时
- **WHEN** 某一轮调用 `ly-wrapper` 超过配置的超时时间未返回
- **THEN** 命令停止循环, 报告"审查调用超时, 无法判定本轮结果", 不得报告"未发现问题"或触发清零

#### Scenario: 返回内容格式不符
- **WHEN** 某一轮 `ly-wrapper` 返回了内容, 但内容既不是可识别的 Critical/Warning/Info 分级格式, 也不是明确的"无发现"声明
- **THEN** 命令停止循环, 报告原始返回内容片段及"无法解析审查结果"的说明, 转人工核实
