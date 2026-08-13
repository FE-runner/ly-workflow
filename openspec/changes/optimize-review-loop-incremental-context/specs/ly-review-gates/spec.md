## MODIFIED Requirements

### Requirement: 代码审查读取 git diff 并分级输出发现
`/ly:review-code` 必须（SHALL）按以下方式确定审查范围：若存在未提交变更, 使用 `git diff HEAD`（覆盖已跟踪的修改和已暂存的新增）；否则回退到最近一次 commit 的 diff。由于 `git diff HEAD` 不会显示未跟踪文件, 命令必须额外列出未跟踪文件（用 `git status --porcelain` 过滤出 `??` 条目）并把其路径并入审查上下文, 确保新建但未 `git add` 的文件不会被静默漏审。若仓库尚无任何 commit（`git rev-parse HEAD` 执行失败）, 命令必须构造一份稳定快照作为首轮基线（覆盖 staged/unstaged/untracked 三类状态的合并视图, 而不是单纯的 `git diff --cached`）, 不得尝试执行 `git diff HEAD` 或 `git diff HEAD~1`。命令必须以 `codex/reviewer.md` 角色提示词调用 `codeagent-wrapper --backend codex`, 并将发现严格分为三个严重度层级：Critical、Warning、Info。**首轮审查确定的审查范围（具体的基线引用：对应的 commit-ish, 或零 commit 场景下的快照）必须（SHALL）被记录, 供首轮 TASK 使用, 不得重新执行"判定审查范围"的分支选择逻辑**。第 2 轮起, 审查范围语义改为"对上一轮 Critical 的回归验证 + 本轮改动的增量审查"（不再是"基线 → 当前工作区完整状态"的地毯式复审）, 具体规则见"审查-修复循环与终止条件（review-code / review-plan 共用）"里的"第 2 轮起的 TASK 内容构造方式"。零 commit 场景下, 修复可能把某个文件从"已暂存"变为"未暂存"（例如 Claude 直接编辑了已 `git add` 过的文件）, 复审必须（SHALL）仍能在快照与当前工作区之间看到这次修复, 不得因为文件的 staged/unstaged 状态变化而漏审。若存在 Critical 发现, 命令必须（SHALL）进入审查-修复循环（见"审查-修复循环与终止条件（review-code / review-plan 共用）"）, 而不是止步于报告。

**首轮 TASK 内容构造方式**：Codex backend 以 agentic 模式运行（具备在 `WORKDIR` 下自主执行 shell 命令、读取文件的能力）, 命令 SHALL NOT 由 Claude 预先把首轮基线对应的完整 diff 文本或未跟踪文件的完整内容拼接进 TASK 字符串；TASK 必须（SHALL）改为传递首轮确定的基线引用（commit-ish, 或零 commit 场景下对基线快照的说明）和未跟踪文件路径清单, 并指示 Codex 自行执行 `git diff`/读取指定路径获取审查所需的实际内容。判定审查范围本身（分支选择逻辑：`git diff HEAD` / `git diff HEAD~1` / `git show HEAD` / 零 commit 快照）仍由 Claude 完成, 不下放给 Codex。

#### Scenario: 存在未提交变更且无 Critical
- **WHEN** 用户在工作区存在未提交变更时运行 `/ly:review-code`, 且 Codex 审查未发现任何 Critical
- **THEN** 审查范围是 `git diff HEAD`, 发现按 Critical/Warning/Info 分级输出, 命令直接结束, 不进入修复循环

#### Scenario: 已跟踪的修改与新建的未跟踪文件同时存在
- **WHEN** 用户运行 `/ly:review-code`, 工作区里既有已跟踪文件的修改, 也有一个新建的未跟踪文件
- **THEN** TASK 中包含 `git diff HEAD` 对应的基线引用说明和该未跟踪文件的路径, Codex 自行读取两者的实际内容进行审查——未跟踪文件不会被静默遗漏

#### Scenario: 工作区干净但有历史提交
- **WHEN** 用户在没有未提交变更、但存在至少一次历史提交时运行 `/ly:review-code`
- **THEN** 审查范围回退为 `git diff HEAD~1`

#### Scenario: 仓库只有一个 commit（不存在 HEAD~1）
- **WHEN** 用户在没有未提交变更、且仓库恰好只有一个 commit 时运行 `/ly:review-code`
- **THEN** 命令审查该单个 commit 的完整内容（例如 `git show HEAD`）, 而不是因缺失 `HEAD~1` 而报错

#### Scenario: 仓库尚无任何 commit
- **WHEN** 用户在一个完全没有 commit 的仓库中运行 `/ly:review-code`（`git rev-parse HEAD` 会失败）
- **THEN** 命令构造一份覆盖 staged/unstaged/untracked 的稳定快照作为首轮基线, 而不是因缺失 `HEAD` 引用而报错, 也不单纯依赖 `git diff --cached`；TASK 中向 Codex 说明该快照的构成方式, 由 Codex 自行读取当前工作区内容, 不由 Claude 把快照内容整段贴入 TASK

#### Scenario: 零 commit 场景下已暂存文件被直接修改, 复审不漏检
- **WHEN** 首轮基线快照记录了某文件的已暂存内容, Claude 修复该文件时直接编辑了工作区副本（未重新 `git add`）, 导致该文件此后处于未暂存状态
- **THEN** 第二轮 TASK 中该文件路径清单里仍以其当前工作区路径给出（不依赖 staged/unstaged 状态标签）, Codex 读取该路径的当前内容即可看到这次修复, 不会因为该文件从 staged 变成 unstaged 而被漏审

#### Scenario: 无发现
- **WHEN** codex 审查员没有返回任何问题
- **THEN** 命令明确说明未发现问题, 而不是保持沉默

#### Scenario: 首轮工作区干净, 后续轮次不因基线概念而漂移
- **WHEN** 首轮审查在工作区干净、有历史提交的情况下确定基线为 `HEAD~1`, 审查发现 Critical 并触发修复, 修复后工作区产生了未提交改动
- **THEN** 第二轮不再引用 `HEAD~1` 这个基线概念做整体复审；TASK 改为传递第一轮 Critical 原文及本轮改动文件的路径清单（相对 `WORKDIR`), Codex 据此判断问题是否解决, 不因工作区变"脏"而产生"审查范围"这一概念上的歧义

#### Scenario: 首轮 TASK 不预先拼贴完整 diff 文本
- **WHEN** 首轮审查范围判定为 `git diff HEAD`, 且该 diff 内容有数百行
- **THEN** 传给 Codex 的 TASK 只包含基线引用说明（例如"审查 `git diff HEAD`"）及未跟踪文件路径清单, 不包含 Claude 预先读取、拼接的完整 diff 文本；Codex 在 `WORKDIR` 下自行执行 `git diff HEAD` 获取实际内容

### Requirement: 方案审查分级输出发现
`/ly:review-plan` 必须（SHALL）读取目标 change 的 `proposal.md`/`design.md`/`tasks.md`（存在的部分即可, 缺失容错跳过）以及该 change 目录下 `specs/**/*.md` 的全部 delta spec 文件（若存在；不存在则容错跳过, 不报错）的路径, 以 `codex/plan-reviewer.md` 角色提示词（而非 `/ly:review-code` 使用的 `codex/reviewer.md`）调用 `codeagent-wrapper --backend codex`, 并将发现严格分为三个严重度层级：Critical、Warning、Info（与 `/ly:review-code` 一致, 不再使用不分级的"问题清单"格式）。**首轮**审查必须（SHALL）确保 Codex 读取到这些文件的**当前内容**（不是 diff），不需要记录或复用基线——因为审查对象是文件当前状态而非变更范围, 不存在"审查范围漂移"问题。**第 2 轮起**改为增量语义, 具体规则见"审查-修复循环与终止条件（review-code / review-plan 共用）"里的"第 2 轮起的 TASK 内容构造方式"。审查必须（SHALL）聚焦方案文档本身的逻辑缺陷：遗漏的边界情况、范围不清晰、`proposal.md`/`design.md`/`tasks.md`/对应 spec 之间互相矛盾或脱节、风险点交代不清、spec 的 Requirement/Scenario 未覆盖 proposal 的 What Changes。`codex/plan-reviewer.md` 必须（SHALL）明确约束：SHALL NOT 将"代码库尚未实现某方案条目"或"`tasks.md` 中某任务未勾选"作为 Critical 依据——这是方案审查阶段（实施尚未开始或尚未完成）的正常状态, 不构成方案缺陷。若存在 Critical 发现, 命令必须（SHALL）进入审查-修复循环（见"审查-修复循环与终止条件（review-code / review-plan 共用）"）, 而不是止步于报告。

**首轮 TASK 内容构造方式**：命令 SHALL NOT 由 Claude 预先读取 `proposal.md`/`design.md`/`tasks.md`/`specs/**/*.md` 的全文并拼接进 TASK 字符串；TASK 必须（SHALL）改为传递该 change 目录路径及需要审查的文件相对路径清单（`proposal.md`/`design.md`/`tasks.md`, 以及枚举到的全部 delta spec 文件路径）, 并指示 Codex 在 `WORKDIR` 下自行读取这些文件的当前内容进行审查——这一条要求命令必须（SHALL）明确列出全部 delta spec 文件的路径（不能只提示"读取 specs 目录"而不枚举具体路径, 避免 Codex 遗漏部分 delta spec 文件), SHALL NOT 仅在角色提示词里描述 checklist 项却不提供文件路径清单, 否则 Codex 无从定位需要读取哪些 spec 文件。

#### Scenario: 无 Critical
- **WHEN** 用户运行 `/ly:review-plan`, Codex 审查未发现任何 Critical（可能有 Warning/Info）
- **THEN** 发现按 Critical/Warning/Info 分级输出, 命令直接结束, 不进入修复循环

#### Scenario: 无任何发现
- **WHEN** codex 审查员对 proposal/design/tasks 没有返回任何问题
- **THEN** 命令明确说明"方案审查未发现问题", 而不是保持沉默

#### Scenario: 多个候选 change 且未指定
- **WHEN** 用户运行 `/ly:review-plan` 且未通过 `$ARGUMENTS` 指定 change 名, `openspec/changes/` 下（排除 `archive/`）存在多个候选
- **THEN** 命令用 AskUserQuestion 询问用户选择哪个 change, 不猜测

#### Scenario: 方案条目未实现不构成 Critical
- **WHEN** 某个 change 的 `tasks.md` 里存在多个未勾选的任务（对应代码库中尚未实现该功能）, Codex 依据 `codex/plan-reviewer.md` 审查该 change
- **THEN** 未勾选的任务、代码库中尚未实现该方案条目, 均不作为 Critical 依据被报告；审查只针对 `proposal.md`/`design.md`/`tasks.md` 及对应 spec 本身的逻辑缺陷（遗漏边界、范围不清晰、文档间矛盾、风险点交代不清、spec 未覆盖 What Changes）

#### Scenario: spec 未覆盖 proposal 的 What Changes, Codex 自行读取 delta spec 内容后判定
- **WHEN** 某 change 的 `proposal.md` 的 What Changes 提到某项新行为, 但该 change 目录下 `specs/<capability>/spec.md` 里对应 Requirement 未提及这项行为（或该 capability 根本没有 delta spec 文件覆盖它）
- **THEN** 命令必须已在 TASK 中列出该 change 目录下全部 `specs/**/*.md` 的路径, Codex 自行读取这些文件内容后才能据此判定"spec 未覆盖 What Changes"这一 Critical; 若该 change 没有任何 delta spec 文件, 命令容错跳过, 不报错、不视为该 Requirement 无法满足

#### Scenario: 首轮 TASK 只传路径清单, 不拼贴全文
- **WHEN** 某 change 的 `proposal.md`、`design.md`、`tasks.md` 及两份 delta spec 文件总长度超过千行
- **THEN** 传给 Codex 的 TASK 只包含这 5 个文件各自的相对路径清单和该 change 目录路径, 不包含 Claude 预先读取、拼接的完整文件内容；Codex 在 `WORKDIR` 下自行读取这些路径对应的当前内容

### Requirement: 审查-修复循环与终止条件（review-code / review-plan 共用）
当某一轮 Codex 审查发现至少一个 Critical 时, `/ly:review-code` 与 `/ly:review-plan` 都必须（SHALL）由当前会话的 Claude 针对该轮全部 Critical 逐条判断（见"Critical 需先经 Claude 判断是否认可"）并对认可的部分修复, 修复完成后必须（SHALL）自动重新调用 Codex 对更新后的内容进行下一轮审查, 不要求用户手动重新触发命令。`/ly:review-code` 的修复对象是审查范围指向的应用代码文件（及为验证修复而必须新增/调整的测试文件）；`/ly:review-plan` 的修复对象是该 change 自己的 `proposal.md`/`design.md`/`tasks.md`以及该 change 目录下的 delta spec 文件（`specs/**/*.md`）——例如"spec 未覆盖 proposal 的 What Changes"这类 Critical, 修复方式就是编辑对应的 delta spec 文件, 不属于修复对象之外的越权改动。两个命令的每轮修复允许改动"当前轮 Critical 报告直接指向的条目"以及"修复该 Critical 所必需的直接依赖条目"（例如一个跨 artifact/跨文件的一致性问题, 需要同步改动多处才能真正修好）, 但不得借机重构、格式化或改动与该 Critical 无关的内容；命中"必需依赖条目"扩展范围时, 本轮报告必须（SHALL）逐项说明每处改动与该 Critical 的关联性。每轮修复完成后必须（SHALL）记录本轮实际改动的文件清单（含修改的 delta spec 文件, 如适用）。`/ly:review-code` 每轮修复后, 若项目存在对应的验证命令（测试/类型检查/构建）, 必须（SHALL）运行与本轮改动范围相称的验证, 验证失败必须（SHALL）作为停止条件；`/ly:review-plan` 每轮修复后必须（SHALL）运行 `openspec validate --changes <change-name>` 作为验证步骤, 验证失败同样必须（SHALL）作为停止条件。循环必须（SHALL）持续到满足以下任一终止条件, 并额外受一个宽松的全局轮数上限约束（见"全局轮数上限作为最后兜底"）：

1. 某一轮审查 Critical 数为 0（正常清零）
2. 熔断：同一个 Critical（以"文件路径 + 问题类别 + 定位锚点（`/ly:review-code` 为函数名/路由/调用点；`/ly:review-plan` 为 artifact 内的具体条目/章节）"三者共同判定为同一问题, 不要求问题描述文字完全一致）在相邻两轮审查中都被判定为存在——即上一轮判定为 Critical 并已尝试修复的问题, 在紧接着的下一轮复审中仍被判定为同一问题未解决。若 Claude 在上一轮对该 Critical 的判断是"不认可"（未修复）, 相邻两轮再次出现 SHALL NOT 判定为熔断, 而是走"分歧未决"（见下）
3. 无法安全自动修复：某个 Critical 的修复需要产品/业务决策、依赖当前会话不具备的外部凭据、会改变已发布的公开 API 或接口契约, 或 Claude 判断当前上下文信息不足以给出确定性修复——命中时不得进行猜测性修改
4. 修复后验证失败：`/ly:review-code` 某一轮修复后运行的测试/类型检查/构建未通过, 或 `/ly:review-plan` 某一轮修复后 `openspec validate` 未通过
5. 分歧未决：Claude 对某个 Critical 判断为不认可（详见下一条 Requirement）, 且该 Critical 在下一轮审查中仍被 Codex 判定为同一问题存在
6. 提交失败（除非传入 `--no-commit`）：见"每轮修复默认自动提交, `--no-commit` 关闭"，本轮 commit 本身执行失败
7. 审查对象类型持续系统性误判：连续 3 轮（含本轮）审查中, 每一轮的全部 Critical 都被 Claude 判定为同一大类系统性误判——即 Codex 反复以"该轮 Critical 所依据的判断类别不属于当前命令的审查范畴"为由被 Claude 判定不认可（例如 `/ly:review-plan` 场景下连续 3 轮的 Critical 均以"代码库尚未实现该方案条目"作为理由）, 不要求这 3 轮之间 Critical 的文件/类别/锚点相互匹配, 只要求"判定为不认可的理由类别"在这 3 轮中一致

触发终止条件 2 到 7 中任一时, 命令必须（SHALL）立即停止循环, 在报告中明确指出触发的具体条件、涉及的问题（文件、类别、锚点、判定依据）, 并说明后续需要人工介入, 不得继续自动修复。循环期间的 Warning 与 Info 发现不参与循环终止判定, 只在循环结束后的最终报告中列出**最后一轮**审查的结果, 不跨轮次合并汇总。

**第 2 轮起的 TASK 内容构造方式（增量传递）**：从第 2 轮起, 命令 SHALL NOT 重新拼贴完整基线 diff / 完整 artifact 全文作为 TASK 内容；审查语义从"发现问题"变为"对上一轮 Critical 的回归验证 + 本轮改动的增量审查"。TASK 必须（SHALL）改为仅包含：（1）上一轮 Codex 报告的全部 Critical 原文（逐字, 不经 Claude 改写, 用于让 Codex 比对判断是否已解决——包含被 Claude 判定"不认可"的条目, 不因未修复而略去）；（2）路径清单, 必须（SHALL）覆盖"本轮实际修复改动的文件" ∪ "上一轮全部 Critical 各自指向的文件"（`/ly:review-plan` 场景下含修改的 delta spec 文件路径）——即使某条 Critical 因 Claude 不认可而未被修改, 其指向的文件路径也必须（SHALL）纳入清单, 否则 Codex 无法读取该文件当前内容来判断问题是否仍然存在。命令必须（SHALL）指示 Codex 自行读取这些路径对应文件的当前内容, 判断：（a）上一轮各条 Critical 是否已解决；（b）本轮改动是否引入了新的 Critical/Warning/Info。未被"本轮改动"或"上一轮任一 Critical 指向"覆盖的文件 SHALL NOT 被重新整段传入 TASK。

**报告逐轮展示 Codex 原始发现**：`/ly:review-code`/`/ly:review-plan` 的每一轮（不只终止时的轮次）循环内部报告必须（SHALL）包含一个独立区块, 逐字展示该轮 Codex 返回的原始 Critical/Warning/Info 内容（不经 Claude 概括、改写或合并), 与 Claude 对该轮每条 Critical 的认可/不认可判定并排列出, 使用户可以对照核实 Claude 的判定是否忠实反映了 Codex 原意。该区块必须（SHALL）在该轮 Codex 调用返回、Claude 完成本轮认可/不认可判定之后, 于本轮报告中呈现（不是 Codex 进程执行期间的流式展示——Codex 的完整结论本身只在其进程结束时一次性可用, 不存在中途可展示的部分结果), 且必须在每一轮都发生, 不能只保留在最终报告或"分歧未决"终止场景中。

最终报告必须（SHALL）包含：循环终止原因、总轮次、已修复的 Critical 摘要（含每轮改动文件清单）、最后一轮审查中仍存在的 Warning/Info。仅当整个执行过程从未出现任何 Critical/Warning/Info 时, 命令才可以使用"未发现问题"这一表述；只要曾经发现并修复过 Critical, 报告必须明确说明"本次已自动修复 N 个 Critical", 不得用"未发现问题"掩盖这一事实。

#### Scenario: 一轮修复后 Critical 清零（review-code）
- **WHEN** `/ly:review-code` 第一轮审查发现 2 个 Critical, Claude 修复后自动触发第二轮审查, 第二轮 Critical 数为 0, 且两轮修复后的验证均通过
- **THEN** 循环在第二轮结束, 命令报告"本次已自动修复 2 个 Critical", 列出最后一轮的 Warning/Info（如有）, 不再触发第三轮审查

#### Scenario: 一轮修复后 Critical 清零（review-plan）
- **WHEN** `/ly:review-plan` 第一轮审查在 `design.md` 发现 1 个 Critical（如"未说明回滚方案"）, Claude 修改 `design.md` 后自动触发第二轮审查, `openspec validate` 通过, 第二轮 Critical 数为 0
- **THEN** 循环在第二轮结束, 命令报告"本次已自动修复 1 个 Critical", 列出最后一轮的 Warning/Info（如有）

#### Scenario: 修复对象包含 delta spec 文件
- **WHEN** `/ly:review-plan` 某一轮审查发现的 Critical 是"spec 的 Requirement 未覆盖 proposal 的 What Changes"（锚定在 `specs/<capability>/spec.md`）, Claude 判断认可
- **THEN** Claude 编辑该 delta spec 文件补齐对应 Requirement/Scenario, 记录改动文件清单中包含该 spec 文件, 不视为超出修复对象范围

#### Scenario: 修复后问题转移到不同文件或不同类别, 循环继续
- **WHEN** 第一轮审查在 `a.ts` 发现一个"空指针"类 Critical, Claude 修复后, 第二轮审查在 `a.ts` 发现一个新的"未处理异常"类 Critical（不同问题类别）
- **THEN** 命令视为新问题, 不判定为熔断, 继续对新 Critical 执行修复并触发第三轮审查

#### Scenario: 同一文件内两个独立的同类问题不被误判为熔断
- **WHEN** 第一轮审查在 `c.ts` 的 `handleLogin` 函数发现一个"SQL 注入"类 Critical, Claude 修复后, 第二轮审查在同一 `c.ts` 但 `handleSearch` 函数（不同定位锚点）发现另一个"SQL 注入"类 Critical
- **THEN** 命令视为新问题（锚点不同）, 不判定为熔断, 继续修复并触发下一轮审查

#### Scenario: 同一问题连续两轮未解决, 触发熔断
- **WHEN** 第一轮审查在 `b.ts` 的 `parseInput` 函数判定存在"SQL 注入"类 Critical, Claude 认可并尝试修复, 第二轮审查在同一 `b.ts` 同一 `parseInput` 函数依然判定存在同一"SQL 注入"类 Critical
- **THEN** 命令立即停止循环, 不再尝试第三次修复, 报告中标明该问题的文件/类别/锚点及两轮各自的判定说明, 需要人工介入

#### Scenario: 熔断场景同样适用于 review-plan
- **WHEN** `/ly:review-plan` 第一轮审查判定 `proposal.md` 的"Impact"章节存在"范围与 tasks.md 不一致"类 Critical, Claude 认可并修改后, 第二轮审查在同一章节依然判定存在同一类 Critical
- **THEN** 命令立即停止循环, 报告中标明该问题所在的 artifact 文件/章节/类别及两轮判定说明, 需要人工介入

#### Scenario: Critical 需要业务决策, 判定为无法安全自动修复
- **WHEN** 某一轮审查发现的 Critical 是"该接口未做权限校验", 但修复方式依赖产品未明确的权限模型
- **THEN** 命令不进行猜测性修改, 立即停止循环, 报告该 Critical 的原始发现、判定为"无法安全修复"的理由、以及建议的人工处理方向

#### Scenario: 修复后验证失败, 触发停止
- **WHEN** `/ly:review-code` 某一轮 Claude 修复完成后运行项目测试命令, 测试失败；或 `/ly:review-plan` 某一轮修复完成后 `openspec validate` 报错
- **THEN** 命令停止循环, 不再进行下一轮修复, 报告本轮改动的文件清单及验证失败的具体信息, 说明需要人工介入

#### Scenario: 循环中途 Warning/Info 变化不影响终止判定
- **WHEN** 某一轮审查 Critical 清零, 但 Warning 数量相比上一轮有所增加
- **THEN** 循环仍在这一轮结束（因为终止判定只看 Critical）, 最终报告只列出最后一轮（清零那一轮）的 Warning, 不合并此前轮次的 Warning

#### Scenario: 修复范围扩展到必需的依赖条目, 并说明关联性
- **WHEN** `/ly:review-plan` 的某个 Critical 是"proposal.md 的 Impact 章节与 tasks.md 的任务范围不一致", 该 Critical 锚定在 `proposal.md`, 但真正修复需要同时调整 `tasks.md` 里对应的任务描述
- **THEN** Claude 同时修改 `proposal.md` 与 `tasks.md`, 本轮报告逐项说明"修改 tasks.md 是因为要消除跟 proposal.md 的不一致"这一关联性, 不视为违反修复范围限制

#### Scenario: 连续 3 轮同类系统性误判, 触发新终止条件
- **WHEN** `/ly:review-plan` 连续 3 轮审查的 Critical 均以"代码库尚未实现该方案条目"为理由（每轮涉及的具体任务条目不同, 锚点不完全一致）, Claude 每轮都判定不认可并写明"这是方案阶段的正常状态, 不构成 Critical"
- **THEN** 命令在第 3 轮结束后立即停止循环, 不等待锚点完全匹配的熔断/分歧未决条件触发, 报告"审查对象类型持续系统性误判", 列出 3 轮的原始发现与反驳理由, 说明需要人工介入（例如检查 `plan-reviewer.md` 角色提示词是否需要进一步调整）

#### Scenario: 系统性误判类别不连续, 不触发新终止条件
- **WHEN** 第一轮、第三轮的 Critical 均以"代码库尚未实现"为理由被判不认可, 但第二轮的 Critical 是一个被认可并修复的真实文档缺陷
- **THEN** 不触发"审查对象类型持续系统性误判"（未连续 3 轮), 循环按其余终止条件正常判定

#### Scenario: 第二轮 TASK 路径清单覆盖改动文件与全部上一轮 Critical 指向的文件
- **WHEN** `/ly:review-code` 第一轮审查发现 3 个 Critical, Claude 认可并修复了其中 2 个（涉及 `a.ts`、`b.ts`）, 不认可第 3 个（锚定在 `c.ts`, 未改动任何文件）
- **THEN** 第二轮传给 Codex 的 TASK 包含：第一轮全部 3 条 Critical 的原文, 以及路径清单 `a.ts`、`b.ts`、`c.ts`（后者是因为第 3 条 Critical 指向它, 即使本轮未修改）；其余未被本轮改动、也未被任何上一轮 Critical 指向的文件内容不重新整段传入, Codex 自行读取这三个文件的当前内容判断前两个 Critical 是否已解决, 并判断第 3 条 Critical 是否仍然存在

#### Scenario: 每轮报告展示 Codex 原始发现与 Claude 判定的并排对照
- **WHEN** `/ly:review-plan` 第一轮审查返回 2 个 Critical, Claude 认可第 1 个并修改 `design.md`, 不认可第 2 个（判断为误报）
- **THEN** 本轮循环内部报告包含一个"Codex 本轮原始发现"区块, 逐字展示这 2 个 Critical 的原文, 紧邻展示 Claude 对每一条的认可/不认可判定及理由, 用户可直接对照, 不需要等到循环终止才能看到 Codex 原文

### Requirement: Critical 需先经 Claude 判断是否认可, 不认可则触发分歧未决
`/ly:review-code` 与 `/ly:review-plan` 的审查-修复循环里, Codex 报告的每一条 Critical SHALL NOT 被当作自动生效的裁决直接执行修复。Claude 必须（SHALL）先判断是否认可该 Critical：认可则按上一条 Requirement 的规则修复；不认可（判断为误报、对上下文理解有误、或建议本身存在问题）则 SHALL NOT 修复, 但必须（SHALL）在本轮报告中写明反驳理由, 不得沉默跳过或悄悄忽略。若同一个 Critical（按判同键判定）在下一轮审查中仍被 Codex 提出, 且 Claude 依然不认可, 命令必须（SHALL）触发"分歧未决"终止条件, 立即停止循环, 报告中必须并列展示 Codex 每一轮的原始发现与 Claude 每一轮的反驳理由, 说明需要人工裁决, 不得继续自动修复或自动放弃该问题。

#### Scenario: Claude 判断某条 Critical 为误报, 不修复
- **WHEN** 某一轮审查报告"switch 前置校验缺少非法字符处理", 但 Claude 核对后发现该校验已经存在, 判断这是误报
- **THEN** Claude 不修改任何文件, 本轮报告写明"不认可：该校验已在 `xxx.md` 第 N 行存在, 判断为误报", 循环继续（若这是本轮唯一 Critical, 视为该项已处理, 进入下一轮复审确认 Codex 是否仍坚持该发现）

#### Scenario: 分歧持续两轮, 触发分歧未决
- **WHEN** 上一 Scenario 中 Claude 判断为误报未修复, 下一轮 Codex 仍报告同一条 Critical
- **THEN** 命令触发"分歧未决"终止条件, 立即停止循环, 报告并列展示 Codex 两轮的原始发现文本与 Claude 两轮的反驳理由, 说明需要人工裁决

#### Scenario: 分歧在下一轮消失
- **WHEN** Claude 判断某条 Critical 不认可未修复, 下一轮审查（针对其他 Critical 的修复触发的复审）不再提出该问题
- **THEN** 不触发"分歧未决"（该问题已不再被 Codex 提出）, 循环按其余 Critical 的状态继续正常判定
