## Context

见 proposal.md - Why。本次涉及三块已有基础设施：

- `templates/commands/review-code.md`：已有"判定审查范围 → 调 Codex → 分级报告"三步，缺审查-修复循环。
- `templates/commands/review-plan.md`：已有"解析目标 change → 读取三份 artifact → 调 Codex → 报告"四步，输出不分级，也缺循环。
- `templates/commands/worktree.md`：已有完整的 `add` 子命令（隔离检测、路径规则、baseline 验证、IDE 打开），缺一个"按 change 名一键定位/创建"的语义化入口。
- `templates/commands/propose.md`：目前是零逻辑委托壳（`Skill({ skill: "opsx:propose", args: "$ARGUMENTS" })`），委托完就结束。

三块本来是分开讨论的（review-code 的审查-修复循环最先定稿；worktree switch 子命令独立设计；propose 收尾编排是后来在探索 worktree 时机时才浮现的需求），本次合并为一个 change 一起落地，因为三者串成一条完整链路：propose 生成方案 → commit → 审查收敛（复用同一套循环规则）→ 询问是否隔离 → 隔离则调 switch。拆开分别推进会导致 propose 编排提前假设"没有 switch 子命令""review-plan 不分级"等已经被否掉的前提。

## Goals / Non-Goals

**Goals:**
- 审查-修复循环规则只写一套自然语言描述，`/ly:review-code` 与 `/ly:review-plan` 共用，不重复定义、不出现两套措辞不一致的终止条件
- `switch <change-name>` 复用 `add` 的全部安全检查（隔离检测、baseline 验证），并补上 `add` 本身也缺的分支基线规则
- 路径/分支名从 change 名确定性推导，不需要用户额外输入，且经过合法性校验
- `switch` 命令输出与实际执行解耦：只打印，不跨会话执行
- `/ly:propose` 收尾流程（commit → 审查循环 → 询问隔离）以调用现成命令的方式编排，不重复实现审查/worktree 逻辑
- 循环状态（每轮 Critical 清单、文件+类别+锚点指纹）只存在于当次会话上下文里，不落盘、不引入额外文件

**Non-Goals:**
- 不做机器可解析的结构化 diff/JSON 协议——Codex 通过 `codeagent-wrapper` 返回自然语言报告，这一接口形态不变
- 不做跨会话/持久化的循环状态或历史记录
- 不实现"自动启动新 claude 会话并接管"的能力（`switch` 只打印续接命令，跨进程拉起会话超出 slash command 能力范围）
- 不修改 `add`/`list`/`remove`/`prune`/`migrate` 现有行为（除非该行为依赖的基线规则被本次统一，见 Decision"分支基线"）
- 不自动迁移未提交的 change 内容到新 worktree（`switch` 要求先提交；`migrate` 仍是单独、需用户明确调用的能力）
- 不实现孤儿 worktree 自动清理，仍靠人工 `remove`/`prune`
- 不做 apply → review-code/review-plan 的自动衔接——本次 `/ly:apply` 仍只追加一句通用提示，不新增编排逻辑或状态查询；这是本次的范围取舍，不是受任何原则约束（"薄壳不附加自定义逻辑"已废止，见 Decision 20），之后要不要给 `apply.md` 加编排，留给后续 change 按需判断

## Decisions

### 审查-修复循环（`/ly:review-code` 与 `/ly:review-plan` 共用）

**1. 循环控制放在 Prompt 描述里，不引入脚本或结构化协议**
两个命令本身都是纯指令文档，`codeagent-wrapper` 返回的都是自然语言报告。给循环加控制的最小改动是在文档里把"审查 → 判断 Critical → 修复 → 再审查"写成显式步骤，而不是新增一层解析 Codex 输出的代码。
- 备选方案：让 Codex 输出结构化 JSON，Claude 用脚本比对指纹集合——不采用，`reviewer.md` 角色提示词是两个命令共用的，强制 JSON 会牵连另一处；且"同问题"判定本身依赖语义理解，结构化字段不能完全替代 Claude 判断。

**2. 熔断判定标准：文件路径 + 问题类别 + 定位锚点，三者共同判定，不要求文字完全一致**
判同键是"文件路径 + 问题类别（如 SQL 注入/空指针/未处理异常）+ 定位锚点（函数名/路由/调用点，或对 review-plan 而言是 artifact 内的具体条目/章节）"，不比对描述文字的字符串相似度。
- 理由：Codex 每轮措辞会变化；三个维度共同判定既能避免"同文件同类别但不同函数"被误判为同一问题（见 spec 场景"同一文件内两个独立的同类问题不被误判为熔断"），又不需要引入编辑距离之类的算法。

**3. 循环边界严格限定在单命令内，不跨命令衔接**
`/ly:review-code` 与 `/ly:review-plan` 各自维护自己的循环，互不触发对方；也不触发 apply → review 的自动衔接（见 Non-Goals）。

**4. 不设固定轮数上限**
"同问题连续两轮未解决即熔断"这个信号已经是比轮数上限更精确的兜底：如果它生效，不会无限循环；如果不生效（问题一直在变换类别/锚点），说明修复方向有问题，加轮数上限只是把"卡住"推迟到某个魔法数字，不解决根因。

**5. 额外的两个停止条件：无法安全自动修复、修复后验证失败**
除了"Critical 清零"和"熔断"，循环还必须在以下情况立即停止并转人工：
- 某个 Critical 的修复需要产品/业务决策、依赖当前会话不具备的外部凭据、会改变已发布的公开 API/接口契约，或 Claude 判断信息不足以给出确定性修复——不得进行猜测性修改
- 修复后运行的验证（测试/类型检查/构建）未通过
- 理由：循环的目的是替代"人读报告→人改→人重新触发"的体力活，不是让 Claude 在信息不足或验证失败时硬着头皮往下猜——这两种情况本质上都是"当前自动修复能力的边界"，应该显式转人工而不是继续消耗轮次。

**6. `/ly:review-plan` 复用同一套循环规则的三处适配**
- **新增严重度分级**：`/ly:review-plan` 当前输出是不分级的"问题清单"，本次改为 Critical/Warning/Info 三级，因为循环终止判定需要一个明确的"驱动信号"（只有 Critical 驱动循环，Warning/Info 不参与），沿用 review-code 已验证过的分级习惯，避免用户在两个命令间切换心智模型。
- **修复对象不同**：review-code 修复的是应用代码文件；review-plan 修复的是该 change 自己的 `proposal.md`/`design.md`/`tasks.md`。修复范围同样严格限定在 Critical 报告直接指向的条目，不得借机重构无关内容。
- **不需要基线漂移记录**：review-code 的循环需要记录首轮确定的 diff 基线（commit-ish/已暂存标记）并在后续轮次复用，防止工作区变"脏"后审查范围收缩（见 review-code 的 spec 场景"首轮工作区干净, 修复后审查范围不漂移"）；review-plan 每轮都是重新读取三份文件的**当前内容**（不是 diff），天然不存在这个问题，因此不引入对应的基线记录规则。

### `/ly:worktree switch <change-name>` 子命令

**7. 新增子命令而非新建独立顶层命令**
`switch` 作为 `worktree.md` 的第 6 个子命令。隔离检测、baseline 验证、路径安全等逻辑已经在 `worktree.md` 里，新命令会重复实现或强耦合引用，不如直接扩展。

**8. 前置条件：change 必须已存在且已提交**
`switch <change-name>` 执行前两步校验：`openspec/changes/<change-name>/proposal.md` 必须存在（否则报错提示先跑 `/ly:propose`）；`git status --porcelain -- openspec/changes/<change-name>/` 必须为空（否则报错提示先 commit）。
- 理由：Git worktree 只共享已提交历史；不做这个校验，续接命令会因 `tasks.md` 不存在而失效，排查成本极高。
- 已考虑并否决：`switch` 内部自动 stash/迁移未提交文件——涉及边界情况复杂，`migrate` 已是独立、需显式调用的能力，不应在 `switch` 里静默触发。

**9. 命名合法性校验**
`<change-name>` 必须匹配 `^[a-z0-9]+(-[a-z0-9]+)*$`，不匹配直接报错。该值会同时进入文件系统路径、Git branch 名、给用户复制执行的 shell 命令三处，仅靠"假设是 kebab-case"不足以防御路径穿越/参数注入/命令注入。校验通过后分支名再过一遍 `git check-ref-format --branch`；输出路径统一走 shell 安全转义。

**10. 路径/分支推导规则：直接用 change 名，不做二次映射**
目标路径 `../.ly/<项目名>/<change-name>`，分支同名，不加前缀。change 名已是 kebab-case 且项目内唯一，直接复用最简单，且与 `openspec/changes/<change-name>/` 目录名保持视觉一致。

**11. 分支基线：统一从默认分支最新提交切出，不用当前 HEAD**
基线固定为仓库默认分支（`origin/HEAD` 解析，回退 `main`/`master`）的最新提交，输出中显示实际 base ref。`switch` 可能在任意 worktree 里被调用，用当前 HEAD 会把目标 change 错误建立在另一个未合并分支之上。此规则本次只统一给 `switch` 用，不改动 `add` 现有的隐式当前 HEAD 行为。

**12. 已存在/冲突场景的确定性处理矩阵**

| 目标路径状态 | 分支状态 | 处理 |
|---|---|---|
| 已是注册 worktree | 任意 | 直接定位，展示路径/分支，跳过创建与 baseline |
| 路径存在但非注册 worktree | 任意 | 报错拒绝，不覆盖、不删除 |
| 路径不存在 | 分支不存在 | 正常创建：`git worktree add -b <branch> <path> <base-ref>` |
| 路径不存在 | 分支存在，未被其他 worktree 检出 | 直接挂载：`git worktree add <path> <branch>` |
| 路径不存在 | 分支存在，已被其他 worktree 检出 | 报错拒绝，提示占用路径 |

**13. 已在 worktree 内时不静默跳过，而是询问**
检测到已在 worktree 内时提示当前路径/分支，询问是否仍要为目标 change 新建独立 worktree（默认否）——典型场景是用户已 `cd` 进另一个 worktree 又想切到别的 change，直接拒绝不够灵活，但默认仍保守。

**14. baseline 报告与创建结果分开** *（已被 Decision 27 取代：baseline 失败不再"不阻断"，改为默认阻断，需显式确认才继续）*
两行结果：创建/定位结果；baseline 结果（失败附摘要）。命中"已注册 worktree 直接定位"时跳过 baseline。

**15. 输出的续接命令固定引用 tasks.md，`--auto` 只改文案不改执行方式**
默认（不传 `--auto`）：`cd <绝对路径> && claude "继续实施 change: <change-name>，读取 openspec/changes/<change-name>/tasks.md 按任务执行"`，不判断该 change 是否已有 tasks.md 或该用哪个入口命令——`switch` 是通用工具，不耦合 OpenSpec 内部状态判断。传了 `--auto`：续接命令的 prompt 文本追加一句"实施完 tasks 后自动依次调用 `/ly:review-code`，直到 Critical 清零或熔断，不需要人工确认"。两种情况下命令本身都只是打印文本，`switch` 本身仍不自动执行、不跨进程拉起会话——`--auto` 影响的是"新会话被指示做什么"，不是"当前会话自动做什么"，与 Non-Goals 里"不实现自动启动新会话并接管"完全兼容。

### `/ly:propose` 收尾编排

**16. 总开关：在调用 `Skill(opsx:propose)` 之前先问一次，只问这一次**
`/ly:propose` 的第一步（早于委托 `opsx:propose`）是询问用户："本次要不要走自动化收尾流程（审查循环 + worktree 询问 + 隔离后自动续接实施与审查）？"。这是整条编排链路唯一的开关，链路后续步骤不再重复问"要不要继续自动"。
- 理由：用户明确要求"不是主动的，需要用户明确在创建需求时提出要自动"——即自动化不能是默认行为，必须显式opt-in；但也不want每一步都重复确认（那样跟"体力活"没区别），所以收敛成一个前置总开关。
- 已考虑并否决：把开关做成每次到"是否继续下一步"都问一遍——否决，这等于没有开关，只是把"每次都问 worktree"扩大成"每次都问所有步骤"，不满足"减少人工衔接"的初始目标。

**17. commit 不受总开关控制，永远执行**
无论总开关选是否，`opsx:propose` 生成完 artifact 后都立即 commit（"propose: <change-name>"）。
- 理由：用户明确澄清"commit不算"——commit 是"保存已完成的工作"，不是"自动化的一部分"；即使用户不想要后续的审查循环和隔离编排，方案生成后不落盘提交依然是不合理的（沿用原"每个节点都应有相应 commit"的要求，不因总开关而弱化）。

**18. 总开关 = 否：commit 后直接结束**
不调用 `/ly:review-plan`，不询问 worktree——等价于退回"只生成方案 + 提交"的最小行为，用户可以随时手动跑 `/ly:review-plan`、`/ly:worktree switch` 补上后续步骤。

**19. 总开关 = 是：commit 后自动调用 review-plan 循环，清零后问 worktree，问出的 switch 调用带 `--auto`**
commit 后自动调用 `/ly:review-plan`（走审查-修复循环，见"审查-修复循环"章节），循环期间每轮修复各自 commit（"fix: review-plan feedback (round N)"）。循环以"清零"结束后，每次都询问是否切换隔离 worktree；选"是"时调用 `/ly:worktree switch <change-name> --auto`（因为总开关已经是"是"，用户想要的是端到端自动化，切换后自然延续到"新 worktree 里自动实施 + 自动审查"，不需要为这一步再单独问一次）；选"否"时留在当前工作区，流程结束。循环以"熔断"结束时不询问 worktree，直接输出熔断报告——方案本身尚未收敛，不适合往下一步（隔离环境）推进。
- 已考虑并否决：worktree 询问环节再加一个"是否要自动续接 apply+review-code"的子问题——否决，总开关已经表达了"要端到端自动化"的意图，再问一次是重复确认，违背 Decision 16"只问一次"的设计。

**20. 废止"薄壳不附加自定义逻辑"这条项目级原则**
`CLAUDE.md`"关键设计决策"第 1 条（"委托而非重新封装：`explore`/`propose`/`apply`/`archive` 只做参数转发，不加自定义校验/编排逻辑"）本次废止，不再作为四个命令的架构约束。
- 理由：这条原则成立的前提是"这四个命令的编排价值为零，opsx 原生流程已经是干净实现"——本次 `propose.md` 的实践证明这个前提不成立：总开关、commit 节奏、审查收敛、隔离环境衔接，都是 opsx 原生流程覆盖不到、也不该由它覆盖的项目特定编排需求。继续保留这条原则只会让每次想加编排都要先论证"是不是例外"，徒增摩擦。
- 影响：`apply.md`/`archive.md`/`explore.md` 之后如需加编排逻辑，直接加，不需要援引或废除本条——本条已经不存在。`CLAUDE.md` 需同步删除该原则的文字表述（见 tasks.md 第 7 节）。
- 不代表"每个命令都必须加编排"——`apply.md` 在本次 change 里仍选择只加一句提示，是基于当前范围的独立判断，不是被原则强制的"薄壳"。

**21. `propose` 查询真实 change 名** *（已被 Decision 30 取代：改为调用前后快照比对，不再单纯依赖 `lastModified`）*
`Skill(opsx:propose)` 执行完毕后，运行 `openspec list --json`，取 `lastModified` 最新的一条作为本次生成的 change 名，不解析 `$ARGUMENTS`（用户输入的原始描述，`opsx:propose` 会把它转成 kebab-case slug，两者不保证一致）。可靠性依据：`opsx:propose` 内部执行的 `openspec new change` 与随后写入的 artifact 都会更新该 change 的 `lastModified`，且 propose 刚执行完，该 change 必然是全库最新修改的一条。
- 影响范围声明：本次只让 `propose.md` 查询真实 change 名并展开编排；`apply.md` 在这次 change 里维持原设计（只追加通用提示），是范围取舍，不是受 Decision 20 已废止的原则的约束。

### Codex 审查后的修正（本次方案自我审查发现的缺口）

以下决策修正/补充上面已有的决策，出处是 `/ly:review-plan` 对本 change 自身的审查报告（13 条发现，逐条讨论后采纳 11 条、收窄 2 条、搁置 2 条）。

**22. Codex 不是裁判，是讨论对象——新增"分歧未决"终止条件**
审查-修复循环里（`/ly:review-code` 与 `/ly:review-plan` 共用），Codex 报告的 Critical 不自动等于"必须执行的修复指令"。Claude 收到每条 Critical 后先做自己的判断：认可则按原规则修复；不认可（判断是误报、理解错了上下文、或建议本身有问题）则不修复，但必须在本轮报告里写明反驳理由，不能沉默跳过。若同一个 Critical（按 Decision 2 的判同键）在下一轮又被 Codex 提出、Claude 依然不认可，SHALL NOT 触发"熔断"（熔断语义是"尝试修复但没修好"，跟"根本不认可"不是一回事）——而是触发新增的第五种终止条件"分歧未决"：立即停止循环，把 Codex 的原始发现和 Claude 每轮的反驳理由并列展示，转人工裁决。
- 理由：用户明确要求"Codex 不是裁判，需要 Claude 和它讨论"——如果循环机制假设 Codex 的每条 Critical 都无条件正确，Claude 就只是执行修复指令的工具，不是真正的审查参与者；也会导致 Codex 的误报被机械修复成"错误的修复"。
- 与已有条件 3（无法安全自动修复）的区别：条件 3 是"Claude 认为信息不足/需要人工决策，不确定怎么修"；本条是"Claude 确信这条 Critical 本身不成立"。两者报告措辞不同（条件 3 说"需要人工提供更多信息"，本条说"Claude 不认可，理由是……"），但都归入"不进行猜测性修改"的同一大类行为。

**23. 全局轮数保底上限——极端兜底，不改变熔断作为主终止信号的地位**
审查-修复循环增加一个非常宽松的全局轮数上限（如 20 轮）作为最后兜底：一旦触及，无条件停止并转人工，报告完整轮次轨迹。
- 理由：Decision 4 论证过不设固定轮数上限，因为"同问题连续两轮熔断"已经是更精确的信号——这个论证依然成立，本条不推翻它，只是承认"若问题每轮都换文件/类别/锚点，或审查输出本身不稳定"时熔断规则可能不生效，这种情况下需要一个绝对保底，防止真正的死循环消耗资源。20 轮是刻意设得很宽松的数字（正常场景 2-3 轮就该清零或熔断），不会在正常场景下提前打断。

**24. 修复范围放宽为"Critical 直接指向的条目 + 修复它所必需的直接依赖条目"**
修正 Decision 6 里"修复范围严格限定在 Critical 报告直接指向的条目"这条规则：允许修改"修复该 Critical 所必需的直接依赖条目"，但每轮报告必须逐项说明这些额外改动与该 Critical 的关联性；仍然禁止借机重构、格式化或改动与该 Critical 无关的内容。
- 理由：像"proposal 与 tasks 范围不一致"这类 Critical，问题本身就跨 artifact，报告通常只锚定其中一处，严格限定"只改锚点所在文件"会导致修复后内部依然不一致，或逼着 Claude 违反规则才能真正修好。放宽到"必需的直接依赖"既解决了这个问题，又通过"逐项说明关联性"保留可审计性，不等于放任随意改动。

**25. 审查调用失败/空响应/格式不符时，视为明确失败终止条件，不得等同于"清零"**
`codeagent-wrapper` 调用超时、非零退出、空响应，或返回内容未按 Critical/Warning/Info 格式组织时，`/ly:review-code`/`/ly:review-plan` SHALL 将其视为一次独立的终止条件（区别于"熔断""分歧未决"），立即停止循环，报告原始失败信息（退出码/超时/原始输出片段），SHALL NOT 将其解读为"本轮无 Critical 发现"。
- 理由：自动化循环最危险的失败模式是"把故障误判为成功"——审查工具本身挂了，不代表代码/方案没问题，机械地把"没收到 Critical"等同于"清零"会让循环在审查能力失效的情况下继续往下走，甚至误报"审查通过"。

**26. `/ly:review-plan` 循环每轮修复后运行 `openspec validate` 作为验证步骤**
修正 Decision 5"review-plan 不引入验证失败停止条件（文档修改无对应的测试/构建可跑）"：改为每轮修复该 change 的 artifact 后运行一次 `openspec validate --changes <change-name>`，验证失败视为条件 4（修复后验证失败）触发，停止循环转人工。
- 理由：Codex 指出 OpenSpec artifact 并非"没有可执行验证"——`openspec validate` 就是文档场景下的结构/一致性验证等价物，原判断"文档无测试/构建可跑"不成立，应该补上。

**27. baseline 失败默认阻断续接命令输出，需显式确认才继续**
修正 Decision 14"baseline 失败不阻断续接命令输出"：改为 baseline 失败时默认不打印续接命令，而是报告失败摘要并询问用户是否仍要继续（默认否）；用户明确选择继续时才打印续接命令，且该命令的 prompt 文本必须携带 baseline 失败摘要、并要求新会话先处理环境问题。
- 理由：这条规则与现有 `add` 子命令"baseline 失败后询问继续或先排查"的既有安全语义相反，且本次新增的 `--auto` 路径会让新会话在环境未装好、测试已红的情况下继续自动实施+自动修复，出问题后根因会跟"环境本身有问题"和"实施引入的新问题"混在一起，难以归因。默认阻断、需显式确认，是更保守也更一致的选择。

**28. review-code 零 commit 场景补充稳定快照机制**
修正首轮基线记录相关的 review-code 规则：仓库尚无任何 commit 的场景下，首轮审查基线是"已暂存内容（`git diff --cached`）+ 未跟踪文件"；修复后已暂存文件的改动通常会变成未暂存状态，若后续轮次仍只读 `git diff --cached`，会漏掉实际修复结果。补充规则：零 commit 场景下的"基线"定义为一份稳定快照（首轮确定时点的文件内容集合，覆盖 staged/unstaged/untracked 三类状态的合并视图），后续每轮复审"该快照 → 当前工作区完整状态"的差异，而不是重新执行 `git diff --cached`。
- 理由：这是已有 review-code-fix-loop 能力里的既存边界 bug（不是本次新引入的），既然审查发现了，一并在本次修掉。

### `/ly:propose`/`--auto` 编排的责任修正

**29. `--commit-each-round` 标志：由审查-修复循环自己负责逐轮 commit，而不是外层命令"偷看"内部状态**
修正 Decision 19 里"propose 在 review-plan 循环期间对每轮修复各自 commit"的实现方式：`propose.md` 不再试图从外部观察 `/ly:review-plan` 循环的中间轮次状态（Codex 指出这在架构上不成立——`review-plan` 自己跑循环，`propose` 只能看到调用返回后的最终结果，没有轮次事件或回调可用）。改为给 `/ly:review-code`/`/ly:review-plan` 都新增一个可选标志 `--commit-each-round`：传入时，循环自身在每轮修复完成、且该轮验证（review-plan 是 `openspec validate`，review-code 是既有的测试/类型检查/构建）通过后，立即在循环内部执行一次 commit（提交信息格式不变：`fix: review-plan feedback (round N) - <change-name>` / 对应 review-code 的等价格式）；不传时维持现状——修复后留给调用方/用户自行处理，不自动 commit。
- 理由：commit 的时机信息（"这一轮修复完成"）只存在于循环内部，只有循环自己能可靠地在正确时机触发 commit；外层命令去猜测/拦截这个时机是本次审查发现的真实架构缺口。这个标志也顺便解决了 Codex 发现 13（`--auto` 续接实施后代码提交责任缺失）：`/ly:worktree switch --auto` 生成的续接 prompt 里，要求新会话调用 `/ly:review-code --commit-each-round`，让审查修复期间的代码改动也逐轮落盘，不会在自动化路径末尾留一堆未提交内容。
- `/ly:propose` 的调用方式相应改为：`Skill(opsx:propose)` → 无条件 commit（首次 artifact 提交，责任不变，见 Decision 17）→ 总开关=是时调用 `/ly:review-plan <change-name> --commit-each-round`（不再是外层拦截 commit）。

**30. change 名查询改为"调用前后快照比对"，不再单纯依赖 `lastModified`**
修正 Decision 21：`Skill(opsx:propose)` 调用前先记录 `openspec list --json` 的候选 change 名集合（快照 A），调用完成后再查一次（快照 B），取 B 相对 A 新增的那一条作为本次生成的 change 名。若新增条目不唯一（理论上不应该发生，`opsx:propose` 单次调用只创建一个 change），或没有新增条目（异常情况），SHALL NOT 猜测，改为直接询问用户"本次生成的 change 叫什么名字"。
- 理由：单纯取全局 `lastModified` 最新一条存在竞态——如果生成过程中用户在另一个会话touch了别的 change，或本次生成前该 change 目录已存在但只是被更新，最新一条未必是本次真正想要的目标。前后快照比对更可靠，且异常时能明确地转人工确认而不是继续猜。

**31. commit 精确暂存范围**
修正 Decision 17（原"commit 不受总开关控制永远执行"）与 Decision 29 的执行细节：commit 前先执行 `git add -- openspec/changes/<change-name>/`（只暂存该 change 目录，不用 `git add -A`），再执行 `git commit`；commit 前后都用 `git status --porcelain -- openspec/changes/<change-name>/` 校验暂存/提交范围确实只覆盖该目录。若该目录下无可提交内容（例如上一步 artifact 生成实际未产生任何文件变化）或 `git commit` 本身失败，SHALL 停止后续自动化步骤（不继续调用 review-plan/询问 worktree），并报告具体原因。
- 理由：`git commit <path>` 不会自动纳入该路径下的未跟踪新文件，容易漏提交刚生成的 artifact；明确先 `add` 再 `commit` 并校验范围，避免"以为提交了但其实漏了新文件"这种静默失败。

**32. `switch` 增加分支拓扑校验：artifact commit 必须是 base ref 的祖先**
修正 Decision 8/11：`switch` 前置校验新增一步——确认该 change 目录下 artifact 的最近一次 commit 是目标 base ref（默认分支最新提交）的祖先（`git merge-base --is-ancestor <artifact-commit> <base-ref>`）。不满足时报错拒绝，提示"该 change 的提交不在默认分支历史上，请先合并或 rebase 到默认分支，再执行 switch"，不自动创建 worktree。
- 理由：Codex 指出若 change 的提交在当前 feature 分支上，或本地默认分支落后 `origin/HEAD`，新 worktree 从 base ref 切出后根本不包含 `openspec/changes/<change-name>/`，续接命令会指向不存在的 `tasks.md`——这是会直接导致 `switch` 产出不可用结果的真实缺口，必须在前置校验里堵住，而不是等用户进新 worktree 才发现。

**33. worktree-switch spec 补全矩阵场景 + 修正"已在隔离环境内"的措辞矛盾**
- 补全：`specs/worktree-switch/spec.md` 补充 Scenario，覆盖 design.md 决策 12 矩阵里"路径存在但非注册 worktree"（报错拒绝）与"分支已存在但被其他 worktree 检出"（报错拒绝并提示占用路径）两种此前只在 design.md 出现、spec 里没有对应 Scenario 的场景，避免实施时只照抄 spec 而漏掉这两种处理。
- 修正矛盾：原 Requirement"已在隔离环境内时跳过创建"与其 Scenario"询问是否仍要新建"字面冲突（"跳过"暗示直接不创建，"询问"又暗示可能创建）。改写为"默认不创建，仅在用户明确确认后才创建"，并补充一条"用户选择不新建"时的结束输出 Scenario，消除歧义。

### 第二轮 Codex 复审后的修正

以下决策修正/补充第一轮修正后的方案，出处是对同一份方案的第二次 `/ly:review-plan` 审查（5 条 Critical + 2 条建议，全部采纳）。

**34. commit 精确暂存范围升级：检查整个 index，提交后校验实际文件集合**
修正 Decision 31：只检查目标 change 目录本身不够——`git add -- <path>` 只保证新增暂存的内容限定在该路径，不能阻止 index 中原本已存在的其他暂存内容被同一次 `git commit` 一并提交。改为：commit 前先检查整个 index（`git diff --cached --name-only`），若存在该 change 目录之外的已暂存内容，停止并要求用户先处理（unstage 或另行提交）；commit 完成后用 `git show --name-only --format=` 校验该次提交的实际文件集合严格属于目标目录。`--commit-each-round`（Decision 29）的逐轮提交同样适用这个保护，避免把用户此前遗留的暂存内容带入自动修复 commit。
- 理由：Codex 指出原方案的校验只看"目标目录状态"，没看"整个 index 状态"，存在"用户之前手动 stage 了别的文件，propose 的 commit 把它也带走"的真实风险。

**35. worktree 询问只在"Critical 清零"这一种终止原因下发生**
修正 Decision 19/27 里"熔断/分歧未决时不询问"的表述：改为明确"仅当终止原因为 Critical 清零时才询问是否切 worktree；其余全部终止原因（熔断、分歧未决、无法安全修复、验证失败、审查调用失败、达到全局轮数上限）都直接结束编排、输出对应终止报告，不询问、不调用 switch"。
- 理由：原表述只枚举了"熔断"和"分歧未决"两种不问的情况，遗漏了 Decision 5/23/25 后续新增的"无法安全修复""验证失败""审查调用失败""全局轮数上限"，按字面意思实现者可能在这些情况下仍然询问并调用 switch——这违背了"方案本身尚未收敛就不该急着进隔离环境"的初始意图，必须把条件收窄到唯一的正常终止路径。

**36. `switch` 前置条件新增 `tasks.md` 必须存在且已提交；分支拓扑校验只在"需要新建"时生效**
修正 Decision 8/32：
- 前置条件从"`proposal.md` 已存在"扩展为"`proposal.md` 与 `tasks.md` 均已存在且已提交"——理由：`switch` 固定输出的续接命令引用 `tasks.md`，若该 change 只完成了 proposal 就通过前置校验，新会话拿到的命令会指向不存在的文件；`switch` 的语义是"进入实施环境"，要求 tasks.md 就位更贴合这个语义。
- 分支拓扑校验（Decision 32）的适用顺序调整为：先判断目标路径是否已是已注册的 worktree——若是，直接定位，跳过拓扑校验（该 worktree 已存在即视为其历史可用，不再要求满足祖先关系，即使对应分支尚未合并到默认分支）；只有目标路径尚未注册（意味着本次需要从 base ref 新建或挂载分支）时，才执行拓扑校验。
- 理由：Codex 指出原方案"要求 artifact commit 是 base ref 祖先"与"已注册 worktree 直接定位"两条规则在"已注册 worktree 对应未合并分支"的场景下会给出相反结论（应拒绝还是应定位），必须明确谁优先——拓扑校验的目的是防止"从 base ref 新建出的 worktree 里没有该 change"，这个风险只在"新建"路径上存在，已注册的 worktree 不会有这个问题，所以让"已注册直接定位"的判断先于拓扑校验。

**37. `--commit-each-round` 的 commit 本身失败作为独立终止条件；无实际改动不建空 commit**
修正 Decision 29：commit 执行失败（Git hook 拒绝、身份未配置、锁文件冲突等）必须视为独立终止条件——立即停止循环，不进入下一轮审查，报告 Git 原始错误信息与本轮改动的文件清单。若某轮全部 Critical 都被判定为不认可（没有实际文件改动），不创建空 commit。
- 理由：Codex 指出"修复+验证都通过但 commit 本身失败"这种情况原方案没有定义处理方式，循环可能在"逐轮落盘"这个保证已经被破坏的情况下继续跑下去，导致后续轮次的改动边界不清（分不清哪些改动属于哪一轮）。

**38. `--auto` 续接文案改为"按全部终止条件运行"，不只提"清零或熔断"**
修正 Decision 15：续接命令 prompt 里原文案"直到 Critical 清零或熔断"改为"按 `/ly:review-code` 的全部终止条件运行（清零/熔断/分歧未决/无法安全修复/验证失败/审查调用失败/达到全局轮数上限，任一命中都停止）"。
- 理由：Codex 指出原文案只提两种终止条件，容易让新会话误解为"只有这两种情况会停"，实际 review-code 循环共有六种终止路径（含新增的分歧未决等），文案应该准确反映全部可能的停止点。

## Risks / Trade-offs

- [risk] "文件+类别+锚点"判定依赖 Claude 主观判断，可能误判（真正不同的问题被误认成同一个提前熔断；或同一根因被误认成不同问题无限修复）→ mitigation：熔断报告必须写出两轮各自的判定依据（文件、类别、锚点、问题描述），人工复核时能看出判定是否合理
- [risk] Claude 当场修复可能引入新的 Critical → mitigation：属于"修复后问题转移到不同文件/类别，循环继续"的既定场景，新问题会在下一轮被正常发现并进入下一轮修复；若反复出现同样会被熔断规则接住
- [risk] `switch` 前置要求"先 commit"，与"每个节点都有 commit"的编排结合后，可能在方案反复修改的探索期产生大量细碎 commit → trade-off：接受，用户已明确要求"每个节点都应有相应 commit"，历史颗粒度换来的可追溯性优先于历史整洁度；后续若需要可用交互式 rebase 整理，不在本次范围内处理
- [risk] `../.ly/项目名/<change-name>` 路径与 change 被删除/重命名后可能产生孤儿 worktree → mitigation：`switch`/`list` 检测到关联 change 不存在时提示，清理仍靠人工 `remove`/`prune`
- [trade-off] `switch` 不支持自定义路径/分支 → 换来零参数、零歧义；后续可加 `--branch`/`--path` 作为向后兼容的增量扩展
- [trade-off] `propose` 收尾流程变长（总开关询问 → commit → 审查循环 → 询问 → 可能再调 switch），单次 `/ly:propose` 的端到端耗时增加 → 接受，因为这正是本次要解决的"体力活衔接"问题；用户始终可以在总开关选否、或审查循环熔断时中途转人工，不会被卡死
- [risk] `--auto` 续接命令让新会话在无人值守的情况下自动实施 tasks 并循环审查代码 → mitigation：这条路径只在用户对总开关明确选"是"、且对 worktree 询问明确选"是"之后才会触发，双重确认；且 review-code 循环本身的"无法安全修复/验证失败"停止条件仍然生效，不会在新会话里无限跑下去
- [risk] "分歧未决"终止条件依赖 Claude 对 Codex 发现的反驳是否合理，可能出现 Claude 错误地驳回一条真实存在的问题 → mitigation：分歧报告必须完整列出 Codex 原始发现与 Claude 每轮反驳理由，人工复核有充分信息判断谁对；这是"半自动"设计的一部分，跟熔断报告的可审计性要求一致
- [risk] 全局轮数保底上限（Decision 23）设得太低会误伤正常场景 → mitigation：刻意设为宽松数值（如 20），正常场景 2-3 轮就该结束，20 轮只作为真正失控时的最后防线
