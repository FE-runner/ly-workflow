## MODIFIED Requirements

### Requirement: 方案审查分级输出发现
`/ly:review-plan` 必须（SHALL）读取目标 change 的 `proposal.md`/`design.md`/`tasks.md`（存在的部分即可, 缺失容错跳过）以及该 change 目录下 `specs/**/*.md` 的全部 delta spec 文件（若存在；不存在则容错跳过, 不报错）的路径, 以 `codex/plan-reviewer.md` 角色提示词（而非 `/ly:review-code` 使用的 `codex/reviewer.md`）调用 `codeagent-wrapper --backend <init 选定的审查后端>`（默认 `codex`）, 并将发现严格分为三个严重度层级：Critical、Warning、Info（与 `/ly:review-code` 一致, 不再使用不分级的"问题清单"格式）。**首轮**审查必须（SHALL）确保审查后端读取到这些文件的**当前内容**（不是 diff），不需要记录或复用基线——因为审查对象是文件当前状态而非变更范围, 不存在"审查范围漂移"问题。**第 2 轮起**改为增量语义, 具体规则见"审查-修复循环与终止条件（review-code / review-plan 共用）"里的"第 2 轮起的 TASK 内容构造方式"。审查必须（SHALL）聚焦方案文档本身的逻辑缺陷：遗漏的边界情况、范围不清晰、`proposal.md`/`design.md`/`tasks.md`/对应 spec 之间互相矛盾或脱节、风险点交代不清、spec 的 Requirement/Scenario 未覆盖 proposal 的 What Changes。**"spec 未覆盖 What Changes"这一检查项必须（SHALL）区分两种"该 change 没有 delta spec 文件"的情形**（`openspec validate`/`openspec archive` 只校验"该 change 的 delta 总数是否为 0"，不逐个核对 proposal 声明的每个 capability 是否都有对应 delta spec，因此这条检查是唯一能在方案阶段捕捉"部分/全部 capability 缺失覆盖"的机制，不能被下游工具兜底）：（a）该 change 的 `proposal.md` 的 Capabilities 段落本身未声明任何 New/Modified Capability（纯重构/工具/文档类变更, 通常配合 `.openspec.yaml` 的 `skip_specs: true`）——此时没有 delta spec 文件属于正常情况, SHALL NOT 报 Critical；（b）`proposal.md` 的 Capabilities 段落声明了至少一个 New/Modified Capability, 但该 change 目录下完全没有任何 delta spec 文件（不管 `skip_specs` 是否被设置为 `true`）——此时命令必须（SHALL）报告 Critical, 指出"proposal 声明了 capability 变更但没有任何 delta spec 覆盖"；若 `skip_specs: true` 与声明的 capability 变更同时存在, 额外指出这是 `skip_specs` 使用不当（真正无行为变更的 change 不应在 Capabilities 段落列出任何 capability）。`codex/plan-reviewer.md` 必须（SHALL）明确约束：SHALL NOT 将"代码库尚未实现某方案条目"或"`tasks.md` 中某任务未勾选"作为 Critical 依据——这是方案审查阶段（实施尚未开始或尚未完成）的正常状态, 不构成方案缺陷。若存在 Critical 发现, 命令必须（SHALL）进入审查-修复循环（见"审查-修复循环与终止条件（review-code / review-plan 共用）"）, 而不是止步于报告。

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

#### Scenario: spec 未覆盖 proposal 的 What Changes, Codex 自行读取 delta spec 内容后判定
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
- **WHEN** 用户已经通过 init 把 `routing.reviewer` 设为 `claude`（或 `hermes`/`openclaw`）, 然后运行 `/ly:review-plan`
- **THEN** 命令以 `--backend claude`（或对应后端）调用 `codeagent-wrapper`, 而非 `--backend codex`

### Requirement: 代码审查读取 git diff 并分级输出发现
`/ly:review-code` 必须（SHALL）按以下方式确定审查范围：若存在未提交变更, 使用 `git diff HEAD`（覆盖已跟踪的修改和已暂存的新增）；否则回退到最近一次 commit 的 diff。由于 `git diff HEAD` 不会显示未跟踪文件, 命令必须额外列出未跟踪文件（用 `git status --porcelain` 过滤出 `??` 条目）并把其路径并入审查上下文, 确保新建但未 `git add` 的文件不会被静默漏审。若仓库尚无任何 commit（`git rev-parse HEAD` 执行失败）, 命令必须以固定的三条 git 命令组合表达审查范围, 而不是构造某种独立持久化的"快照"：`git diff --cached`（已暂存的改动, 对无 HEAD 仓库等价于与空树相比）、`git diff`（未暂存的改动）、`git status --porcelain` 过滤 `??` 得到的未跟踪文件路径清单；不得尝试执行 `git diff HEAD` 或 `git diff HEAD~1`（这两者在无 HEAD 时无意义或报错）。命令必须以 `codex/reviewer.md` 角色提示词调用 `codeagent-wrapper --backend <init 选定的审查后端>`（默认 `codex`）, 并将发现严格分为三个严重程度层级：Critical、Warning、Info。**首轮审查确定的审查范围（具体的基线引用：对应的 commit-ish, 或零 commit 场景下的上述三条命令组合）必须（SHALL）被记录, 供首轮 TASK 使用, 不得重新执行"判断审查范围"的分支选择逻辑**。第 2 轮开始, 审查范围定义为"对上一轮 Critical 的回归验证 + 本轮改动的增量审查"（不再是"基线 → 当前工作区完整状态"的整体复审）, 具体规则见"审查-修复循环与终止条件（review-code / review-plan 共用）"里的"第 2 轮起的 TASK 内容构造方式"。零 commit 场景下, 由于该三条命令每次执行都直接反映"当前"状态（不依赖某个固定时点的快照）, 修复使某文件从"已暂存"变为"未暂存"（例如 Claude 直接编辑了已 `git add` 过的文件）不构成任何特殊问题——第 2 轮起的路径清单机制本身就是按文件当前路径读取内容, 与该文件处于 staged 还是 unstaged 无关。若存在 Critical 发现, 命令必须（SHALL）进入审查-修复循环（见"审查-修复循环与终止条件（review-code / review-plan 共用）"）, 而不是止步于报告。从第 2 轮起必须（SHALL）复用本流程首轮取得的 session_id（见 additional 的"审查循环轮间续聊（同一流程内复用）"规则）通过 resume 模式延续会话。

**首轮 TASK 内容构造方式**：审查后端以 agentic 模式运行（具备在 `WORKDIR` 下自主执行 shell 命令、读取文件的能力）, 命令 SHALL NOT 由 Claude 预先把首轮基线对应的完整 diff 文本或未跟踪文件的完整内容拼接进 TASK 字符串；TASK 必须（SHALL）改为传递首轮确定的基线引用（commit-ish, 或零 commit 场景下"运行 `git diff --cached` + `git diff` + 未跟踪文件路径清单"该三条命令组合的说明）, 并指示审查后端自行执行这些命令/读取路由获取审查所需的实际内容。判断审查范围本身（分支选择逻辑：`git diff HEAD` / `git diff HEAD~1` / `git show HEAD` / 零 commit 三命令组合）仍由 Claude 完成, 不下放给审查后端。

#### Scenario: 存在未提交变更且无 Critical
- **WHEN** 用户在当前工作区存在未提交变更时运行 `/ly:review-code`, 且审查后端审查未发现任何 Critical
- **THEN** 审查范围是 `git diff HEAD`, 发现按 Critical/Warning/Info 分级输出, 命令直接结束, 不进入修复循环

#### Scenario: 已跟踪的修改与新建的未跟踪文件同时存在
- **WHEN** 用户运行 `/ly:review-code`, 工作区里既有已跟踪文件的修改, 也有一个新建的未跟踪文件
- **THEN** TASK 中包含 `git diff HEAD` 对应的基线引用说明和该未跟踪文件的路径, 审查后端自行读取两者的实际内容进行审查——未跟踪文件不会被静默遗漏

#### Scenario: 工作区干净但有历史提交
- **WHEN** 用户在没有未提交变更、但存在至少一次历史提交时运行 `/ly:review-code`
- **THEN** 审查范围回退为 `git diff HEAD~1`

#### Scenario: 仓库只有一个 commit（不存在 HEAD~1）
- **WHEN** 用户在没有未提交变更、且仓库恰好只有一个 commit 时运行 `/ly:review-code`
- **THEN** 命令审查该单个 commit 的完整内容（例如 `git show HEAD`）, 而不是因缺失 `HEAD~1` 而报错

#### Scenario: 仓库尚无任何 commit
- **WHEN** 用户在一个完全没有 commit 的仓库中运行 `/ly:review-code`（`git rev-parse HEAD` 会失败）
- **THEN** 命令以"`git diff --cached` + `git diff` + 未跟踪文件路径清单"这三条固定命令组合表达审查范围, 而不是因缺失 `HEAD` 引用而报错；TASK 中向审查后端说明该三条命令, 由审查后端自行执行并读取当前工作区内容, 不由 Claude 把内容整段贴入 TASK

#### Scenario: 零 commit 场景下已暂存文件被直接修改, 复审仍能定位到该文件
- **WHEN** 首轮审查用三条命令组合确定了审查范围, Claude 修复某文件时直接编辑了工作区副本（未重新 `git add`）, 导致该文件此后处于未暂存状态
- **THEN** 第二轮路径清单里仍以该文件当前工作区路径给出（不依赖 staged/unstaged 状态标签）, 审查后端读取该路径的当前内容即可看到这次修复, 不会因为该文件从 staged 变成 unstaged 而被漏审——该三条命令组合本身没有"固定时点"的概念, 不存在"漏检查"这个问题

#### Scenario: 无发现
- **WHEN** 审查后端没有返回任何问题
- **THEN** 命令明确说明未发现问题, 而不是保持沉默

#### Scenario: 首轮工作区干净, 后续轮次不因基线概念而漂移
- **WHEN** 首轮审查在工作区干净、有历史提交的情况下确定基线为 `HEAD~1`, 审查发现 Critical 并触发修复, 修复后工作区产生了未提交改动
- **THEN** 第二轮不再引用 `HEAD~1` 这个基线概念做整体复审；TASK 改为传递第一轮 Critical 原文及本轮改动文件的路径清单（相对 `WORKDIR`), 审查后端据此判断问题是否解决, 不因工作区变"脏"而产生"审查范围"这一概念上的歧义

#### Scenario: 首轮 TASK 不预先拼贴完整 diff 文本
- **WHEN** 首轮审查范围判定为 `git diff HEAD`, 且该 diff 内容有数百行
- **THEN** 传给审查后端的 TASK 只包含基线引用说明（例如"审查 `git diff HEAD`"）及未跟踪文件路径清单, 不包含 Claude 预先读取、拼接的完整 diff 文本；审查后端在 `WORKDIR` 下自行执行 `git diff HEAD` 获取实际内容

#### Scenario: 审查后端由 init 选定而非固定 codex（review-code）
- **WHEN** 用户已经通过 init 把 `routing.reviewer` 设为 `hermes`, 然后运行 `/ly:review-code`
- **THEN** 命令以 `--backend hermes` 调用 `codeagent-wrapper`, 而非 `codex`

#### Scenario: 第 2 轮以 resume 模式续聊同一会话
- **WHEN** `/ly:review-code` 第一轮结束, wrapper 返回了 session_id, 第一轮存在未清零的 Critical, 循环进入第二轮
- **THEN** 第二轮调用 wrapper 时以 resume 模式传回该 session_id让审查后端在同一会话上下文中复审, 而非另起全新会话

### Requirement: 审查-修复循环与终止条件（review-code / review-plan 共用）
当某一轮审查发现至少一个 Critical 时, `/ly:review-code` 与 `/ly:review-plan` 都必须（SHALL）由当前会话的 Claude 针对该轮全部 Critical 逐条判断（见"Critical 需先经 Claude 判断是否认可"）并执行认可部分的修复, 修复完成后必须（SHALL）自动重新调用审查后端对更新后的内容进行下一轮审查, 不要求用户手动触发。`/ly:review-code` 的修复对象是审查范围指向的应用代码文件（含为验证修复而必须新增/调整的测试文件）；`/ly:review-plan` 的修复对象是该 change 自己的 `proposal.md`/`design.md`/`tasks.md`以及该 change 目录下的 delta spec 文件（`specs/**/*.md`）——例如"spec 未覆盖 proposal 的 What Changes"这类 Critical, 修复方式就是编辑对应的 delta spec 文件, 不属于修复对象之外的私改。两个命令的每轮修复允许改动"当前轮 Critical 报告直接指向的条目"以及"修复该 Critical 所必需的直接依赖条目"（例如一个跨 artifact/跨文件的一致性问题, 需要同步改动多处才能真正修好）, 但不得借机重构、格式化或改动与该 Critical 无关的内容；命中"必需依赖"用时, 本轮报告必须（SHALL）逐项说明每处改动与该 Critical 的关联性。每轮修复完成后必须（SHALL）记录本轮实际改动的文件清单（含修改的 delta spec 文件, 如适用）。`/ly:review-code` 每轮修复后, 若项目存在对应的验证命令（测试/类型检查/构建）, 必须（SHALL）运行与该轮改动范围相称的验证, 验证失败必须作为停止条件处理；`/ly:review-plan` 每轮修复后必须（SHALL）运行 `openspec validate --changes <change-name>` 作为验证步骤, 验证失败同样作为停止条件。循环必须（SHALL）持续到满足以下任一终止条件, 并受一个全局轮数上限的兜底约束（见"全局轮数上限作为最后兜底"）：

1. 某一轮审查 Critical 数为 0（正常清零）
2. 熔断：同一个 Critical（以"文件路径 + 问题类型 + 定位锚点（`/ly:review-code` 为函数名/路由/调用点；`/ly:review-plan` 为 artifact 内的具体条目/章节）"三者共同判定为同一问题, 不要求问题描述文字完全一致）在相邻两轮审查中都判定仍存在——即上一轮判定为 Critical 并已尝试修复的问题, 在紧接的下一轮复审中仍被判定未解决。若 Claude 在上一轮对它的判断是"不认可"（未修复）, 相邻两轮再次出现 SHALL NOT 走熔断而走"分歧未决"（见下）
3. 无法安全自动修复：某个 Critical 的修复需要产品/业务决策、依赖当前会话不具备的外部凭据、会改变已发布的公开 API 或接口契约, 或 Claude 判断当前上下文不足以给出确认性修复——命中时不做猜测性修改
4. 修复后验证失败：`/ly:review-code` 该轮修复后运行的测试/类型检查/构建未通过, 或 `/ly:review-plan` 该轮修复后 `openspec validate` 未通过
5. 分歧未决：Claude 对某个 Critical 判断为不认可（详见下一条 Requirement）, 且该 Critical 在下一轮审查中仍被审查后端判定为同一问题存在
6. 审查对象类型持续系统性误判:连续 3 轮（含本轮）审查中每一轮的全部 Critical 都被 Claude 判定为同一大类系统性误判——即审查后端反复以"该轮 Critical 所依据的类型不属于当前命令的审查范畴"为由被 Claude 判定不认可（例如 `/ly:review-plan` 连续 3 轮的 Critical 均以"代码库尚未实现该方案条目"为理由），不要求这 3 轮之间 Critical 的文件/类别/锚点互相一致, 只要求"判定为不认可的原因类型"在这 3 轮中一致

出现终止条件 2-6 中任一条时, 命令必须（SHALL）立即停止循环, 在报告中明确指出触发的具体条件、涉及的问题（文件、类别、锚点、判断依据）, 并说明需要人工介入, 不得继续自动修复；这些条件时命令 SHALL NOT 提交任何改动（见下方）——已产生的改动留在工作区交由人工处理。循环期间的 Warning 与 Info 发现不参与循环终止判定, 只在循环结束后的最中报告列出最后一轮的结果, 不跨轮次合并。

**循环期间不提交, 仅在正常清零后统一提交一次**：每一轮修复完成、验证通过后, SHALL NOT 立即执行 git commit——改动保持在当前状态, 直到循环结束。仅当循环以"正常清零"结束（终止条件 1）时, 命令才对循环全程改动的文件执行一次统一提交。若循环以终止条件 2-6 中任一结束或达到全局轮数上限, 命令 SHALL NOT 提交, 改动保持在工作区未提交。

**第 2 轮起 TASK 通过增量传递, 并用 resume 复用同一会话**（会话复用规则见 `optional-review-agent` 的"审查循环轮间续聊（同一流程内复用）"）:从第 2 轮起, 命令 SHALL NOT 重新拼接完整的内容作为 TASK；TASK 必须（SHALL）只包含:（1）上一轮审查后端返回的全部 Critical 原文（逐字, 不经改写, 包含被判"不认可"的条目）；（2）路径清单, 覆盖"本轮修复改动的文件" ∪ "上一轮全部 Critical 指向的文件"（`/ly:review-plan`场景下含 delta spec 文件）——即使某条未修改, 其指向的文件路径也要纳入, 否则审查后端无法读取当前内容判断问题是否仍存在。若某条上一轮 Critical 位置字段缺失可解析路径, 命令必须保守处理（一般是将该轮已知的兜底路径集合纳入清单, 不得静默丢弃）。若上一轮某条 Critical 指向的文件被删除或重命名, 路径清单改用新路径并说明状态变化。命令必须（SHALL）指示审查后端自行读取路径当前内容, 判断:（a）上轮各 Critical 是否已解决；（b）本轮改动是否引入新问题。未被"本轮改动"和"上一轮任一 Critical 指向"覆盖的文件 SHALL NOT 重新整段传入。**同时**本轮 wrapper 调用必须（SHALL）以首轮取得的 session_id 走 resume 模式, 让审查后端拥有上一轮上下文（它发出的 Critical 与已做修复）——这种上下文记忆与 TASK 的增量传递不冲突，内存不替代 TASK 的逐字原文（会话记忆主要用于让审查后端理解开放问题的上下文，具体每条 Critical 的逐字文本仍然要显式传, 避免后端依据模糊记忆断言）。

**报告逐轮展示审查后端原始发现**：`/ly:review-code`/`/ly:review-plan` 的每一轮审查调用（包括首轮 Critical 为 0 不进入循环的情况）都必须在报告中包含独立区块, 逐字展示该轮审查后端返回的原始 Critical/Warning/Info 内容（不经概括、改写或合并）, 并与 Claude 对该轮每条 Critical 的认可/不认可判定并排列出（若该轮无 Critical, 只展示原文）。该区块必须在该轮审查调用返回后于本轮报告呈现。

**报告格式**: 循环终止原因、总轮数、已修复的 Critical 摘要（含每轮改动文件清单）、上最后一轮 Warning/Info。仅当全程无任何 Critical/Warning/Info 时才可以使用"未发现问题"表述；只要发现并修复过 Critical, 报告必须明确"本次已自动修复 N 个 Critical"。每条 Critical 摘要用关人员易懂的语言概括问题与已做改动, 逐字原文区块作为补充材料并存。

#### Scenario: 一轮修复后 Critical 清零（review-code）
- **WHEN** `/ly:review-code` 第一轮审查发现 2 个 Critical, Claude 修复后自动触发第二轮审查, 第二轮 Critical 数为 0, 且两轮修复后的验证均通过
- **THEN** 循环在第二轮结束, 命令报告"本次已自动修复 2 个 Critical", 列出第二轮的 Warning/Info, 不再触发第三轮

#### Scenario: 一轮修复后 Critical 清零（review-plan）
- **WHEN** `/ly:review-plan` 第一轮审查在 `design.md` 发现 1 个 Critical（如"未注明范围"）, Claude 修改 `design.md` 后自动触发第二轮, `openspec validate` 通过, 第二轮 Critical 数为 0
- **THEN** 循环在第二轮结束, 命令报告"本次已自动修复 1 个 Critical", 列出最后一轮 Warning/Info

#### Scenario: 修复对象包含 delta spec 文件
- **WHEN** `/ly:review-plan` 某一轮审查发现的 Critical 是"spec 的 Requirement 未覆盖 proposal 的 What Changes"（锚定在 `specs/<capability>/spec.md`）, Claude 判断认可
- **THEN** 修复该 Critical 的方式是编辑该 delta spec 文件补对 Requirement/Scenario, 这被记录在改动文件清单中, 不视为走出修复对象范围

#### Scenario: 修复后问题转移到不同文件或不同类别, 循环继续
- **WHEN** 第一轮审查在 `a.ts` 发现一个"空指针"类 Critical, Claude 修复后开发, 第二轮审查在 `a.ts` 发现一个不同的“未处理异常”类 Critical（问题类型不同）
- **THEN** 命令视为新问题, 不判定熔断, 继续处理新 Critical 并触发下一轮

#### Scenario: 同一文件内两个独立的同类问题不被误判为熔断
- **WHEN** 第一轮审查在 `c.ts` 的 `handleLogin` 发现“SQL 注入”类 Critical, Claude 修复后第二轮在同一 `c.ts` 但 `handleSearch`（不同锚点）又发现一条“SQL 注入”类 Critical
- **THEN** 命令视为新问题（锚点不同）, 不判定熔断, 继续处理

#### Scenario: 同一问题连续两轮未解决, 触发熔断
- **WHEN** 第一轮审查在 `b.ts` 的 `parseInput` 判定“SQL 注入”类 Critical, Claude 认可并尝试修复, 第二轮在同一 `b.ts` 同一 `parseInput` 仍判同一条“SQL 注入”未解决
- **THEN** 命令立即停止循环, 报告标注该问题文件/类别/锚点及两轮判定, 需要人工介入

#### Scenario: 熔断场景同样适用于 review-plan
- **WHEN** review-plan 第一轮审查判定 `proposal.md` 的“Purposes”章节与 tasks.md 不一致类 Critical, Claude 认可并修改后, 第二轮在同一章节与类别仍然判定存在
- **THEN** 命令立即停止循环, 报告该问题所在 artifact/章节/类别及两轮判定, 转人工

#### Scenario: Critical 需要业务决策, 判定为无法安全自动修复
- **WHEN** 某一轮 Critical 是"该接口未做权限校验", 但修复方式依赖产品未明确的权限模型
- **THEN** 命令不达猜测性修改, 立即停止循环, 报告 Critical 原因及“无法安全修复”的理由, 以及建议的人工方向

#### Scenario: 修复后验证失败, 触发停止
- **WHEN** review-code 某一轮修复后运行测试失败；或 review-plan 该轮修复后 `openspec validate` 报错
- **THEN** 命令停止循环, 不再继续下一轮, 报告本轮改动文件，及验证失败的具体错误, 需要人工介入

#### Scenario: 循环中途 Warning/Info 变化不影响终止判定
- **WHEN** 某一轮 Critical 清零但 Warning 数量较上一轮增加
- **THEN** 循环仍按正常清零在该轮结束（终止只看 Critical）, 最终报告只列出最后一轮的 Warning, 不合并此前轮

#### Scenario: 修复范围扩展到必需的依赖条目, 并说明关联性
- **WHEN** review-plan 的一个 Critical “proposal.md 的 Impact 章节与 tasks.md 任务不一致”, 该 Critical 锚定 proposal.md, 但真正修复需同时改 `tasks.md`
- **THEN** Claude 同时改 proposal.md 和 tasks.md, 本轮报告逐项说明改动与 Critical 的关联, 不视为违反修复范围

#### Scenario: 连续 3 轮同类系统性误判, 触发新终止条件
- **WHEN** review-plan 连续 3 轮的 Critical 都以“代码库尚未实现该方案条目”为理由（各轮具体任务不同）, Claude 每轮不认可并说明“方案阶段正常状态”
- **THEN** 命令在第 3 轮后停止, 报告"审查对象类型持续系统性误判", 列出 3 轮原文与判定理由, 转人工（如检查角色提示词是否需要调整）

#### Scenario: 系统性误判类别不连续, 不触发新终止条件
- **WHEN** 第一、三轮 Critical 均以“代码库尚未实现”而被判不认可, 但第二轮是一条被认可并修复的真实文档缺陷
- **THEN** 不触发“持续系统性误判”（未连续 3 轮), 循环按原有终止条件继续判定

#### Scenario: 第二轮 TASK 路径清单覆盖改动文件与全部上一轮 Critical 指向的文件
- **WHEN** review-code 第一轮 3 个 Critical, Claude 认可并修复 2 个（涉及 a.ts/b.ts）, 不认可第 3 个（指向 c.ts 未改动）
- **THEN** 第二轮 T可 包含: 该 3 条 Critical 逐字原文及路径清单 a.ts、b.ts、c.ts；其它未被本轮改动和未由任何上一轮 Critical 指向的文件不整体传入, 审查后端自行读取这 3 个文件判断前 2 条是否已解决、第 3 条是否存在

#### Scenario: 跨文件/范围性 Critical 的路径列出全部相关文件
- **WHEN** review-plan 第一轮“proposal.md Impact 与 tasks.md 范围不一致”（不存在单个目标文件）
- **THEN** 该 Critical 的位置字段列出 proposal.md 与 tasks.md 两个路径；第二轮路径清单必须同时包含两个, 不取其一

#### Scenario: Critical 位置字段缺失可解析路径, 保守纳入全部 artifact
- **WHEN** 某轮一条 Critical 缺失可解析路径（角色提示词未被遵守）
- **THEN** 命令不得静默丢弃, 必须将该 change 目录全部 artifact/delta spec 路径统一纳入下一轮路径清单, 并在报告中说明“该条 Critical 缺少路径, 已扩大范围”

#### Scenario: 每轮报告展示 Codex 原始发现与 Claude 判定的并排对照
- **WHEN** 某轮返回 2 个 Critical: Claude 认可第 1 个并仍 `design.md`, 不认可第 2 个（误报）
- **THEN** 本轮报告“逐字原文”区块展示 2 条原文, 并排展示 Claude 对每条认可/不认可及理由, 用户直接对照

#### Scenario: 轮间续聊开启时, 第 2 轮仍按增量传递语义构造 TASK
- **WHEN** `/ly:review-plan` 首轮取得 session_id, 第 2 轮以 resume 模式延续会话
- **THEN** TASK 仍只包含上一轮全部 Critical 逐字原文 + 路径清单（增量），不整段重新传入基线 artifact 全文；会话记忆提供上下文，不代表 TASK 可省略逐字 Critical 原文