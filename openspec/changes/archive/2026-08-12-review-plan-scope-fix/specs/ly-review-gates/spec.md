## MODIFIED Requirements

### Requirement: 方案审查分级输出发现
`/ly:review-plan` 必须（SHALL）读取目标 change 的 `proposal.md`/`design.md`/`tasks.md`（存在的部分即可, 缺失容错跳过）**以及该 change 目录下 `specs/**/*.md` 的全部 delta spec 文件（若存在；不存在则容错跳过, 不报错；存在多份 delta spec 时全部读取并按文件路径排序后依次拼接, 不只取其中一份）**, 以 `codex/plan-reviewer.md` 角色提示词（而非 `/ly:review-code` 使用的 `codex/reviewer.md`）调用 `codeagent-wrapper --backend codex`, 并将发现严格分为三个严重度层级：Critical、Warning、Info（与 `/ly:review-code` 一致, 不再使用不分级的"问题清单"格式）。每一轮审查都必须（SHALL）重新读取这些文件的**当前内容**（不是 diff）, 不需要记录或复用首轮基线——因为审查对象是文件当前状态而非变更范围, 不存在"审查范围漂移"问题。审查必须（SHALL）聚焦方案文档本身的逻辑缺陷：遗漏的边界情况、范围不清晰、`proposal.md`/`design.md`/`tasks.md`/对应 spec 之间互相矛盾或脱节、风险点交代不清、spec 的 Requirement/Scenario 未覆盖 proposal 的 What Changes——这一条要求命令必须（SHALL）把 delta spec 的实际内容纳入 Codex 的审查输入, SHALL NOT 仅在角色提示词里描述这条 checklist 项却不提供 spec 文件内容, 否则 Codex 无从判断"spec 是否覆盖 proposal"。`codex/plan-reviewer.md` 必须（SHALL）明确约束：SHALL NOT 将"代码库尚未实现某方案条目"或"`tasks.md` 中某任务未勾选"作为 Critical 依据——这是方案审查阶段（实施尚未开始或尚未完成）的正常状态, 不构成方案缺陷。若存在 Critical 发现, 命令必须（SHALL）进入审查-修复循环（见"审查-修复循环与终止条件（review-code / review-plan 共用）"）, 而不是止步于报告。

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

#### Scenario: spec 未覆盖 proposal 的 What Changes, 命令读取 delta spec 内容后由 Codex 判定
- **WHEN** 某 change 的 `proposal.md` 的 What Changes 提到某项新行为, 但该 change 目录下 `specs/<capability>/spec.md` 里对应 Requirement 未提及这项行为（或该 capability 根本没有 delta spec 文件覆盖它）
- **THEN** 命令必须已把该 change 目录下全部 `specs/**/*.md` 的实际内容读取并纳入本轮 Codex 审查输入, Codex 才能据此判定"spec 未覆盖 What Changes"这一 Critical; 若该 change 没有任何 delta spec 文件, 命令容错跳过, 不报错、不视为该 Requirement 无法满足

### Requirement: 审查-修复循环与终止条件（review-code / review-plan 共用）
当某一轮 Codex 审查发现至少一个 Critical 时, `/ly:review-code` 与 `/ly:review-plan` 都必须（SHALL）由当前会话的 Claude 针对该轮全部 Critical 逐条判断（见"Critical 需先经 Claude 判断是否认可"）并对认可的部分修复, 修复完成后必须（SHALL）自动重新调用 Codex 对更新后的内容进行下一轮审查, 不要求用户手动重新触发命令。`/ly:review-code` 的修复对象是审查范围指向的应用代码文件（及为验证修复而必须新增/调整的测试文件）；`/ly:review-plan` 的修复对象是该 change 自己的 `proposal.md`/`design.md`/`tasks.md`**以及该 change 目录下的 delta spec 文件（`specs/**/*.md`）**——例如"spec 未覆盖 proposal 的 What Changes"这类 Critical, 修复方式就是编辑对应的 delta spec 文件, 不属于修复对象之外的越权改动。两个命令的每轮修复允许改动"当前轮 Critical 报告直接指向的条目"以及"修复该 Critical 所必需的直接依赖条目"（例如一个跨 artifact/跨文件的一致性问题, 需要同步改动多处才能真正修好）, 但不得借机重构、格式化或改动与该 Critical 无关的内容；命中"必需依赖条目"扩展范围时, 本轮报告必须（SHALL）逐项说明每处改动与该 Critical 的关联性。每轮修复完成后必须（SHALL）记录本轮实际改动的文件清单（含修改的 delta spec 文件, 如适用）。`/ly:review-code` 每轮修复后, 若项目存在对应的验证命令（测试/类型检查/构建）, 必须（SHALL）运行与本轮改动范围相称的验证, 验证失败必须（SHALL）作为停止条件；`/ly:review-plan` 每轮修复后必须（SHALL）运行 `openspec validate --changes <change-name>` 作为验证步骤, 验证失败同样必须（SHALL）作为停止条件。循环必须（SHALL）持续到满足以下任一终止条件, 并额外受一个宽松的全局轮数上限约束（见"全局轮数上限作为最后兜底"）：

1. 某一轮审查 Critical 数为 0（正常清零）
2. 熔断：同一个 Critical（以"文件路径 + 问题类别 + 定位锚点（`/ly:review-code` 为函数名/路由/调用点；`/ly:review-plan` 为 artifact 内的具体条目/章节）"三者共同判定为同一问题, 不要求问题描述文字完全一致）在相邻两轮审查中都被判定为存在——即上一轮判定为 Critical 并已尝试修复的问题, 在紧接着的下一轮复审中仍被判定为同一问题未解决。若 Claude 在上一轮对该 Critical 的判断是"不认可"（未修复）, 相邻两轮再次出现 SHALL NOT 判定为熔断, 而是走"分歧未决"（见下）
3. 无法安全自动修复：某个 Critical 的修复需要产品/业务决策、依赖当前会话不具备的外部凭据、会改变已发布的公开 API 或接口契约, 或 Claude 判断当前上下文信息不足以给出确定性修复——命中时不得进行猜测性修改
4. 修复后验证失败：`/ly:review-code` 某一轮修复后运行的测试/类型检查/构建未通过, 或 `/ly:review-plan` 某一轮修复后 `openspec validate` 未通过
5. 分歧未决：Claude 对某个 Critical 判断为不认可（详见下一条 Requirement）, 且该 Critical 在下一轮审查中仍被 Codex 判定为同一问题存在
6. 提交失败（除非传入 `--no-commit`）：见"每轮修复默认自动提交, `--no-commit` 关闭"，本轮 commit 本身执行失败
7. 审查对象类型持续系统性误判：连续 3 轮（含本轮）审查中, 每一轮的全部 Critical 都被 Claude 判定为同一大类系统性误判——即 Codex 反复以"该轮 Critical 所依据的判断类别不属于当前命令的审查范畴"为由被 Claude 判定不认可（例如 `/ly:review-plan` 场景下连续 3 轮的 Critical 均以"代码库尚未实现该方案条目"作为理由）, 不要求这 3 轮之间 Critical 的文件/类别/锚点相互匹配, 只要求"判定为不认可的理由类别"在这 3 轮中一致

触发终止条件 2 到 7 中任一时, 命令必须（SHALL）立即停止循环, 在报告中明确指出触发的具体条件、涉及的问题（文件、类别、锚点、判定依据）, 并说明后续需要人工介入, 不得继续自动修复。循环期间的 Warning 与 Info 发现不参与循环终止判定, 只在循环结束后的最终报告中列出**最后一轮**审查的结果, 不跨轮次合并汇总。

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

### Requirement: 全局轮数上限作为最后兜底
`/ly:review-code` 与 `/ly:review-plan` 的审查-修复循环必须（SHALL）设置一个全局轮数上限（默认 5 轮）。达到该上限时, 无论熔断/分歧未决/审查对象类型持续系统性误判等信号是否已触发, 命令必须（SHALL）立即停止循环, 报告"已达到全局轮数上限, 停止自动化, 转人工介入", 并附完整轮次轨迹（每轮 Critical 摘要）。该上限 SHALL NOT 作为正常场景下的主要终止信号, 仅用于兜底防止其余终止条件因某种原因未生效而导致的真正无限循环。**清零优先于轮数上限**：轮数上限的判定必须（SHALL）发生在"本轮审查结果确认为非清零"之后——若第 N 轮（包括恰好第 5 轮）审查结果本身是 Critical 清零, 命令必须（SHALL）按正常清零处理并输出清零报告, SHALL NOT 因为该轮恰好命中轮数上限而报告为"达到全局轮数上限"。

#### Scenario: 正常场景不触及轮数上限
- **WHEN** 循环在第 3 轮就因 Critical 清零结束
- **THEN** 全局轮数上限完全不影响本次执行, 报告中不需要提及该上限

#### Scenario: 达到全局轮数上限
- **WHEN** 循环连续 5 轮都发现新的、判同键各不相同的 Critical（因而既未清零、也未熔断、也未分歧未决、也未命中审查对象类型持续系统性误判）
- **THEN** 命令在第 5 轮结束后停止循环, 报告"已达到全局轮数上限（5 轮）, 停止自动化", 附上完整的 5 轮 Critical 摘要轨迹, 说明需要人工介入

#### Scenario: 第 5 轮恰好清零, 按清零处理不报达到上限
- **WHEN** 循环第 1-4 轮各自发现新的 Critical 并修复, 第 5 轮审查 Critical 数为 0
- **THEN** 命令报告本次已自动修复的 Critical 数量, 按正常清零结束, SHALL NOT 报告"已达到全局轮数上限"
