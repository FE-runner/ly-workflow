## Purpose

提供两个由 Codex 支撑的审查关卡——一个用于在实施前审查 OpenSpec change 的方案, 一个用于在实施后审查代码变更——统一使用现有的 `codeagent-wrapper` 二进制（`--backend codex`），替代旧的双模型（Codex + Gemini）交叉审查机制。两个命令都支持审查-修复循环：Codex 报告的 Critical 不是自动生效的裁决，Claude 先判断是否认可再决定是否修复，循环直到 Critical 清零或触发终止条件。

## Requirements

### Requirement: 方案审查解析目标 change 且排除已归档项
`/ly:review-plan` 必须（SHALL）按以下优先级解析目标 change：（1）通过 `$ARGUMENTS` 传入的显式 change 名称；（2）若未指定, 且 `openspec/changes/` 下恰好只有一个 change 目录时, 使用该目录；（3）若存在多个 change 目录且未指定, 询问用户要审查哪一个。枚举候选目录时必须（SHALL）排除 `openspec/changes/archive/` 目录及其内容——已归档的 change 不是可选目标。解析完成后, 必须读取该 change 的 `proposal.md`、`design.md`、`tasks.md`（存在的部分）, 将其合并内容作为审查上下文传给以 `codex/reviewer.md` 角色提示词调用的 `codeagent-wrapper --backend codex`。审查必须聚焦方案的合理性——遗漏的边界情况、范围不清晰、风险点——而非逐行代码风格。

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
`/ly:review-code` 必须（SHALL）按以下方式确定审查范围：若存在未提交变更, 使用 `git diff HEAD`（覆盖已跟踪的修改和已暂存的新增）；否则回退到最近一次 commit 的 diff。由于 `git diff HEAD` 不会显示未跟踪文件, 命令必须额外列出未跟踪文件（用 `git status --porcelain` 过滤出 `??` 条目）并把其内容并入审查上下文, 确保新建但未 `git add` 的文件不会被静默漏审。若仓库尚无任何 commit（`git rev-parse HEAD` 执行失败）, 命令必须构造一份稳定快照作为首轮基线（覆盖 staged/unstaged/untracked 三类状态的合并视图, 而不是单纯的 `git diff --cached`）, 不得尝试执行 `git diff HEAD` 或 `git diff HEAD~1`。命令必须以 `codex/reviewer.md` 角色提示词调用 `codeagent-wrapper --backend codex`, 并将发现严格分为三个严重度层级：Critical、Warning、Info。**首轮审查确定的审查范围（具体的基线引用：对应的 commit-ish, 或零 commit 场景下的快照）必须（SHALL）被记录并在后续所有轮次中复用, 不得重新执行"判定审查范围"的分支选择逻辑**——后续每轮审查复审"该基线 → 当前工作区完整状态"（含未跟踪文件）, 确保工作区因修复动作变"脏"后不会导致审查范围收缩、漏审原始改动中未被触及的部分。零 commit 场景下, 修复可能把某个文件从"已暂存"变为"未暂存"（例如 Claude 直接编辑了已 `git add` 过的文件）, 复审必须（SHALL）仍能在快照与当前工作区之间看到这次修复, 不得因为文件的 staged/unstaged 状态变化而漏审。若存在 Critical 发现, 命令必须（SHALL）进入审查-修复循环（见"审查-修复循环与终止条件（review-code / review-plan 共用）"）, 而不是止步于报告。

#### Scenario: 存在未提交变更且无 Critical
- **WHEN** 用户在工作区存在未提交变更时运行 `/ly:review-code`, 且 Codex 审查未发现任何 Critical
- **THEN** 审查范围是 `git diff HEAD`, 发现按 Critical/Warning/Info 分级输出, 命令直接结束, 不进入修复循环

#### Scenario: 已跟踪的修改与新建的未跟踪文件同时存在
- **WHEN** 用户运行 `/ly:review-code`, 工作区里既有已跟踪文件的修改, 也有一个新建的未跟踪文件
- **THEN** 审查上下文同时包含 `git diff HEAD` 的输出和该未跟踪文件的内容——未跟踪文件不会被静默遗漏

#### Scenario: 工作区干净但有历史提交
- **WHEN** 用户在没有未提交变更、但存在至少一次历史提交时运行 `/ly:review-code`
- **THEN** 审查范围回退为 `git diff HEAD~1`

#### Scenario: 仓库只有一个 commit（不存在 HEAD~1）
- **WHEN** 用户在没有未提交变更、且仓库恰好只有一个 commit 时运行 `/ly:review-code`
- **THEN** 命令审查该单个 commit 的完整内容（例如 `git show HEAD`）, 而不是因缺失 `HEAD~1` 而报错

#### Scenario: 仓库尚无任何 commit
- **WHEN** 用户在一个完全没有 commit 的仓库中运行 `/ly:review-code`（`git rev-parse HEAD` 会失败）
- **THEN** 命令构造一份覆盖 staged/unstaged/untracked 的稳定快照作为首轮基线, 而不是因缺失 `HEAD` 引用而报错, 也不单纯依赖 `git diff --cached`

#### Scenario: 零 commit 场景下已暂存文件被直接修改, 复审不漏检
- **WHEN** 首轮基线快照记录了某文件的已暂存内容, Claude 修复该文件时直接编辑了工作区副本（未重新 `git add`）, 导致该文件此后处于未暂存状态
- **THEN** 第二轮复审仍能通过"快照 → 当前工作区完整状态"的差异看到这次修复, 不会因为该文件从 staged 变成 unstaged 而被漏审

#### Scenario: 无发现
- **WHEN** codex 审查员没有返回任何问题
- **THEN** 命令明确说明未发现问题, 而不是保持沉默

#### Scenario: 首轮工作区干净, 修复后审查范围不漂移
- **WHEN** 首轮审查在工作区干净、有历史提交的情况下确定基线为 `HEAD~1`, 审查发现 Critical 并触发修复, 修复后工作区产生了未提交改动
- **THEN** 第二轮复审仍以 `HEAD~1` 为基线, 复审"`HEAD~1` → 当前工作区"的完整差异, 不会因为工作区变"脏"而切换为只审 `git diff HEAD`

### Requirement: 方案审查分级输出发现
`/ly:review-plan` 必须（SHALL）读取目标 change 的 `proposal.md`/`design.md`/`tasks.md`（存在的部分即可, 缺失容错跳过）, 以 `codex/reviewer.md` 角色提示词调用 `codeagent-wrapper --backend codex`, 并将发现严格分为三个严重度层级：Critical、Warning、Info（与 `/ly:review-code` 一致, 不再使用不分级的"问题清单"格式）。每一轮审查都必须（SHALL）重新读取三份文件的**当前内容**（不是 diff）, 不需要记录或复用首轮基线——因为审查对象是文件当前状态而非变更范围, 不存在"审查范围漂移"问题。若存在 Critical 发现, 命令必须（SHALL）进入审查-修复循环（见"审查-修复循环与终止条件（review-code / review-plan 共用）"）, 而不是止步于报告。

#### Scenario: 无 Critical
- **WHEN** 用户运行 `/ly:review-plan`, Codex 审查未发现任何 Critical（可能有 Warning/Info）
- **THEN** 发现按 Critical/Warning/Info 分级输出, 命令直接结束, 不进入修复循环

#### Scenario: 无任何发现
- **WHEN** codex 审查员对 proposal/design/tasks 没有返回任何问题
- **THEN** 命令明确说明"方案审查未发现问题", 而不是保持沉默

#### Scenario: 多个候选 change 且未指定
- **WHEN** 用户运行 `/ly:review-plan` 且未通过 `$ARGUMENTS` 指定 change 名, `openspec/changes/` 下（排除 `archive/`）存在多个候选
- **THEN** 命令用 AskUserQuestion 询问用户选择哪个 change, 不猜测

### Requirement: 审查-修复循环与终止条件（review-code / review-plan 共用）
当某一轮 Codex 审查发现至少一个 Critical 时, `/ly:review-code` 与 `/ly:review-plan` 都必须（SHALL）由当前会话的 Claude 针对该轮全部 Critical 逐条判断（见"Critical 需先经 Claude 判断是否认可"）并对认可的部分修复, 修复完成后必须（SHALL）自动重新调用 Codex 对更新后的内容进行下一轮审查, 不要求用户手动重新触发命令。`/ly:review-code` 的修复对象是审查范围指向的应用代码文件（及为验证修复而必须新增/调整的测试文件）；`/ly:review-plan` 的修复对象是该 change 自己的 `proposal.md`/`design.md`/`tasks.md`。两个命令的每轮修复允许改动"当前轮 Critical 报告直接指向的条目"以及"修复该 Critical 所必需的直接依赖条目"（例如一个跨 artifact/跨文件的一致性问题, 需要同步改动多处才能真正修好）, 但不得借机重构、格式化或改动与该 Critical 无关的内容；命中"必需依赖条目"扩展范围时, 本轮报告必须（SHALL）逐项说明每处改动与该 Critical 的关联性。每轮修复完成后必须（SHALL）记录本轮实际改动的文件清单。`/ly:review-code` 每轮修复后, 若项目存在对应的验证命令（测试/类型检查/构建）, 必须（SHALL）运行与本轮改动范围相称的验证, 验证失败必须（SHALL）作为停止条件；`/ly:review-plan` 每轮修复后必须（SHALL）运行 `openspec validate --changes <change-name>` 作为验证步骤, 验证失败同样必须（SHALL）作为停止条件。循环必须（SHALL）持续到满足以下任一终止条件, 并额外受一个宽松的全局轮数上限约束（见"全局轮数上限作为最后兜底"）：

1. 某一轮审查 Critical 数为 0（正常清零）
2. 熔断：同一个 Critical（以"文件路径 + 问题类别 + 定位锚点（`/ly:review-code` 为函数名/路由/调用点；`/ly:review-plan` 为 artifact 内的具体条目/章节）"三者共同判定为同一问题, 不要求问题描述文字完全一致）在相邻两轮审查中都被判定为存在——即上一轮判定为 Critical 并已尝试修复的问题, 在紧接着的下一轮复审中仍被判定为同一问题未解决。若 Claude 在上一轮对该 Critical 的判断是"不认可"（未修复）, 相邻两轮再次出现 SHALL NOT 判定为熔断, 而是走"分歧未决"（见下）
3. 无法安全自动修复：某个 Critical 的修复需要产品/业务决策、依赖当前会话不具备的外部凭据、会改变已发布的公开 API 或接口契约, 或 Claude 判断当前上下文信息不足以给出确定性修复——命中时不得进行猜测性修改
4. 修复后验证失败：`/ly:review-code` 某一轮修复后运行的测试/类型检查/构建未通过, 或 `/ly:review-plan` 某一轮修复后 `openspec validate` 未通过
5. 分歧未决：Claude 对某个 Critical 判断为不认可（详见下一条 Requirement）, 且该 Critical 在下一轮审查中仍被 Codex 判定为同一问题存在
6. 提交失败（仅在传入 `--commit-each-round` 时适用）：见"`--commit-each-round` 标志控制循环是否自行逐轮提交"，本轮 commit 本身执行失败

触发终止条件 2 到 6 中任一时, 命令必须（SHALL）立即停止循环, 在报告中明确指出触发的具体条件、涉及的问题（文件、类别、锚点、判定依据）, 并说明后续需要人工介入, 不得继续自动修复。循环期间的 Warning 与 Info 发现不参与循环终止判定, 只在循环结束后的最终报告中列出**最后一轮**审查的结果, 不跨轮次合并汇总。

最终报告必须（SHALL）包含：循环终止原因、总轮次、已修复的 Critical 摘要（含每轮改动文件清单）、最后一轮审查中仍存在的 Warning/Info。仅当整个执行过程从未出现任何 Critical/Warning/Info 时, 命令才可以使用"未发现问题"这一表述；只要曾经发现并修复过 Critical, 报告必须明确说明"本次已自动修复 N 个 Critical", 不得用"未发现问题"掩盖这一事实。

#### Scenario: 一轮修复后 Critical 清零（review-code）
- **WHEN** `/ly:review-code` 第一轮审查发现 2 个 Critical, Claude 修复后自动触发第二轮审查, 第二轮 Critical 数为 0, 且两轮修复后的验证均通过
- **THEN** 循环在第二轮结束, 命令报告"本次已自动修复 2 个 Critical", 列出最后一轮的 Warning/Info（如有）, 不再触发第三轮审查

#### Scenario: 一轮修复后 Critical 清零（review-plan）
- **WHEN** `/ly:review-plan` 第一轮审查在 `design.md` 发现 1 个 Critical（如"未说明回滚方案"）, Claude 修改 `design.md` 后自动触发第二轮审查, `openspec validate` 通过, 第二轮 Critical 数为 0
- **THEN** 循环在第二轮结束, 命令报告"本次已自动修复 1 个 Critical", 列出最后一轮的 Warning/Info（如有）

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

### Requirement: 审查调用失败视为独立终止条件
若 `codeagent-wrapper` 调用超时、以非零状态退出、返回空响应, 或返回内容未能按 Critical/Warning/Info 格式解析, `/ly:review-code` 与 `/ly:review-plan` 必须（SHALL）将其视为一次独立的终止条件, 立即停止循环, 报告原始失败信息（退出码/超时说明/原始输出片段）, SHALL NOT 将其等同于"本轮无 Critical 发现"或视为清零通过。

#### Scenario: 审查调用超时
- **WHEN** 某一轮调用 `codeagent-wrapper` 超过配置的超时时间未返回
- **THEN** 命令停止循环, 报告"审查调用超时, 无法判定本轮结果", 不得报告"未发现问题"或触发清零

#### Scenario: 返回内容格式不符
- **WHEN** 某一轮 `codeagent-wrapper` 返回了内容, 但内容既不是可识别的 Critical/Warning/Info 分级格式, 也不是明确的"无发现"声明
- **THEN** 命令停止循环, 报告原始返回内容片段及"无法解析审查结果"的说明, 转人工核实

### Requirement: 全局轮数上限作为最后兜底
`/ly:review-code` 与 `/ly:review-plan` 的审查-修复循环必须（SHALL）设置一个宽松的全局轮数上限（默认 20 轮）。达到该上限时, 无论熔断/分歧未决等信号是否已触发, 命令必须（SHALL）立即停止循环, 报告"已达到全局轮数上限, 停止自动化, 转人工介入", 并附完整轮次轨迹（每轮 Critical 摘要）。该上限 SHALL NOT 作为正常场景下的主要终止信号, 仅用于兜底防止其余终止条件因某种原因未生效而导致的真正无限循环。

#### Scenario: 正常场景不触及轮数上限
- **WHEN** 循环在第 3 轮就因 Critical 清零结束
- **THEN** 全局轮数上限完全不影响本次执行, 报告中不需要提及该上限

#### Scenario: 达到全局轮数上限
- **WHEN** 循环连续 20 轮都发现新的、判同键各不相同的 Critical（因而既未清零、也未熔断、也未分歧未决）
- **THEN** 命令在第 20 轮结束后停止循环, 报告"已达到全局轮数上限（20 轮）, 停止自动化", 附上完整的 20 轮 Critical 摘要轨迹, 说明需要人工介入

### Requirement: `--commit-each-round` 标志控制循环是否自行逐轮提交
`/ly:review-code` 与 `/ly:review-plan` 都必须（SHALL）支持可选标志 `--commit-each-round`。传入该标志时, 循环在每一轮修复完成且该轮验证（`/ly:review-code` 为测试/类型检查/构建；`/ly:review-plan` 为 `openspec validate`）通过后, 必须（SHALL）立即在循环内部执行一次 commit（仅暂存并提交本轮实际改动的文件, 不做范围外的 `git add`），提交信息包含 `fix:` 前缀、目标标识（change 名或审查对象说明）与轮次序号。若本轮没有实际文件改动（例如该轮全部 Critical 都被判定为不认可）, SHALL NOT 创建空 commit。若 commit 本身执行失败（Git hook 拒绝、身份未配置、锁文件冲突等）, 必须（SHALL）将其视为独立的终止条件：立即停止循环, 不进入下一轮审查或后续编排, 报告 Git 返回的原始错误信息及本轮改动的文件清单。不传入该标志时, 命令 SHALL NOT 自动 commit, 修复结果留给调用方或用户自行处理, 与命令改动前的行为一致。

#### Scenario: 带 --commit-each-round 时逐轮提交
- **WHEN** 用户（或编排该命令的上层流程）执行 `/ly:review-plan <change-name> --commit-each-round`, 第一轮发现 1 个 Critical 并修复、`openspec validate` 通过
- **THEN** 命令在进入第二轮审查之前立即提交一次, 提交信息形如 `fix: review-plan feedback (round 1) - <change-name>`

#### Scenario: 不带 --commit-each-round 时不自动提交
- **WHEN** 用户直接执行 `/ly:review-code`（不带 `--commit-each-round`）, 循环修复了若干 Critical 后清零结束
- **THEN** 命令不执行任何 commit, 修改的文件保持在工作区未提交状态, 与改动前的行为一致

#### Scenario: 本轮无实际改动, 不创建空 commit
- **WHEN** 带 `--commit-each-round` 运行, 某一轮全部 Critical 都被 Claude 判定为不认可（未修改任何文件）
- **THEN** 命令不执行 commit, 不产生空提交, 继续按分歧未决相关判定处理

#### Scenario: commit 本身失败, 触发独立终止条件
- **WHEN** 带 `--commit-each-round` 运行, 某一轮修复且验证通过后尝试 commit, 但因 pre-commit hook 拒绝或 Git 身份未配置导致 commit 失败
- **THEN** 命令立即停止循环, 不进入下一轮审查, 报告 Git 返回的原始错误信息及本轮改动的文件清单, 说明需要人工处理
