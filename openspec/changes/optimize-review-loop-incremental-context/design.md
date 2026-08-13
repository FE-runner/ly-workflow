## Context

见 `proposal.md` - Why。现有实现（`templates/commands/review-code.md`、`review-plan.md`）每轮都由 Claude 手动拼接完整基线 diff / 全部 artifact 内容进 TASK 字符串，重传给 `codeagent-wrapper --backend codex`。经核实（`codeagent-wrapper/executor.go:772-795`），Codex backend 以 `codex e -C WORKDIR --dangerously-bypass-approvals-and-sandbox` 方式运行，具备在 `WORKDIR` 下自主执行 shell 命令、读取文件的 agentic 能力（`parser.go:251-266` 的 `command_execution` 事件即 Codex 自身执行 shell 命令后上报，非 wrapper 模拟）。`--progress` 只把 120 字符摘要吐到 stderr（`parser.go:228-240`），完整结论只在进程结束时一次性输出到 stdout（`main.go:463`），Claude 是唯一读到完整原文的一方。

## Goals / Non-Goals

**Goals:**
- 第 2 轮起，TASK 只传"上一轮 Critical 原文 + 路径清单（本轮改动文件 ∪ 上一轮全部 Critical 指向的文件）"，让 Codex 自行读取判断，降低每轮重传的内容量。
- 首轮 TASK 只传基线引用/路径清单，不由 Claude 预先读取拼接全文。
- 报告逐轮展示 Codex 原始发现（逐字），与 Claude 判定并排，方便用户核实。
- 修正 `codex/reviewer.md` 的输出格式，与 `plan-reviewer.md` 的 Critical/Warning/Info 结构一致。

**Non-Goals:**
- 不改变 `codeagent-wrapper` 的 Go 代码或 stdin 协议（`ROLE_FILE`/`TASK`/`OUTPUT`）——协议本身已支持自由文本，足够表达路径清单和指令。
- 不改变审查范围判定的分支逻辑本身（`git diff HEAD` / `HEAD~1` / `git show HEAD` / 零 commit 快照的判定规则不变），只改变"判定完成后如何构造 TASK 内容"。
- 不新增真正的 OS 级文件系统隔离——见下方 Risks，这次改动明确不处理该问题，只记录认知。
- 不改变循环终止条件的判定规则本身（熔断/分歧未决/系统性误判等 9 类条件不变），只改变 TASK 构造方式和报告展示方式。

## Decisions

**1. 首轮：Claude 保留"判定审查范围/枚举文件路径"的职责，但不再读取内容拼接全文**

`/ly:review-code` 首轮仍由 Claude 执行 `git rev-parse`/`git status --porcelain` 等命令确定基线引用（commit-ish 或快照说明）；`/ly:review-plan` 首轮仍由 Claude 枚举 `proposal.md`/`design.md`/`tasks.md`/`specs/**/*.md` 的存在与路径。区别在于：确定后不再 `Read` 这些文件/执行 `git diff` 把内容读出来拼进 TASK 字符串，而是把"基线引用说明 + 路径清单"作为 TASK 文本传给 Codex，指示它自己在 `WORKDIR` 下读取。

*备选方案：让 Codex 自己判定审查范围（例如自己跑 `git status` 决定用哪种 diff 策略）*——放弃。审查范围判定分支较多（未提交/有历史/单 commit/零 commit 四种），依赖 Claude 已有的、经过多轮打磨的判定逻辑（见现有 spec 的对应 Requirement），交给 Codex 重新判定等于把这套逻辑复制一份到 prompt 里维护两份，且 Codex 的判定结果不可控（无法保证它选中同一分支），影响范围判定的一致性和可测试性。

**2. 第 2 轮起：TASK 只含"上一轮 Critical 原文 + 路径清单（本轮改动文件 ∪ 上一轮全部 Critical 指向的文件）"，不含未改动且未被任一上一轮 Critical 指向的内容**

第 2 轮起的审查目的从"发现问题"变成"验证修复是否到位 + 检测修复是否引入新问题"。验证修复只需要 Codex 对照"上一轮它自己报告的 Critical 原文"和"该 Critical 所指文件的当前内容"；检测新问题只需要 Codex 读取"本轮实际被改动过的文件"。**路径清单必须同时覆盖两类文件**：本轮实际改动的文件，以及上一轮全部 Critical 各自指向的文件（即使某条因 Claude 判定"不认可"而未被修改）——后者是必要的，因为"分歧未决"判定需要 Codex 能重新读取该文件当前内容去核实问题是否依然存在，仅靠 Critical 原文（文字描述）不足以支撑这个核实，必须让 Codex 能实际访问对应文件。除此两类之外的文件，其内容相对上一轮未变，重复传入不会带来新发现——Codex 面对相同输入大概率给出相同结论，重传的边际价值低，边际成本（token/时间）不低。

*备选方案：路径清单只含本轮实际改动的文件（不含未修改的 Critical 指向文件）*——放弃。首轮审查跑出来时，Codex 已确认认可-驳回后的 Critical 3（未修改）Round-2 审查中若不给它文件路径，它只能靠"记忆自己第一轮说过什么"来判断问题是否依然存在，无法重新核实文件当前内容，"分歧未决"判定所需的"下一轮 Codex 仍判定同一问题存在"这一动作会退化成"Codex 重复背诵自己上一轮的话"而不是真的重新审查，判定质量下降。

*备选方案：继续每轮全量重传（现状）*——放弃，是本次改动的直接动因（见 proposal.md Why）。

*备选方案：完全不传上一轮 Critical 原文，只传改动文件路径，让 Codex 自己判断哪些问题解决了*——放弃。Codex 若不知道"上一轮到底报告了什么"，无法判断"这次改动是否解决了那个具体问题"，只能重新对改动文件做一次独立审查，容易把"已解决的旧问题"重新报出来（换一种表述方式），导致熔断/分歧未决判定失真（判同键依赖"文件路径+问题类别+定位锚点"三者匹配，重新表述可能打不上）。必须把上一轮 Critical 原文带上，Codex 才能做"回归验证"式的针对性判断。

**3. 报告逐轮展示 Codex 原始发现（逐字），不等到终止才展示**

现状里"分歧未决"终止场景已经要求并列展示 Codex 两轮原文与 Claude 反驳理由，本次把这个展示动作提前到每一轮（不管是否触发终止），确保用户在循环进行中就能核实 Claude 的认可/不认可判断，不必等循环走完（甚至走到终止都没触发"分歧未决"这种需要展示原文的场景时，用户此前完全看不到 Codex 原文）。

*备选方案：把 Codex 原始输出直接转发到 stderr/进度流，让用户在执行过程中实时看到*——放弃（本次不做）。需要改动 `codeagent-wrapper` 的 `--progress` 行为或 Claude 侧的 Bash 调用方式（例如改用 Monitor 工具 tail 日志），涉及 wrapper 侧改动，超出本次"prompt/模板层"的改动范围；报告里逐字展示已经能解决"用户看不到原文"的核心诉求，实时流式是锦上添花，留作后续可能的独立改动。

## Risks / Trade-offs

- **[风险] "只读 sandbox" 是 prompt 软约束, 非 OS 级隔离** → Codex backend 实际用 `--dangerously-bypass-approvals-and-sandbox` 完全解除了系统级 sandbox（`executor.go:772-778`），`codex/reviewer.md` 里的"ZERO file system write permission - READ-ONLY sandbox"只是提示词层面的行为约束，Codex 若不遵守约束，技术上没有系统层拦截。本次改动进一步依赖 Codex 自主读文件的能力，不会*新增*这个风险（现状已经如此，只是之前调用方替它把内容读出来，掩盖了它本来就有完整文件系统访问权限这一事实），但需要明确记录：**不通过本次改动缓解**，若未来需要真正的隔离（例如审查一份不可信的第三方 diff），需要额外的机制（只读 bind mount、独立容器、专用 worktree 等），不是靠改 prompt 文案能解决的。
- **[风险] Codex 自行读取文件, 若读取路径或范围理解有误, 结果不可控** → 首轮 TASK 里必须明确给出"基线引用的具体形式"（例如"运行 `git diff HEAD` 得到的完整 diff，包含以下未跟踪文件的路径：...")，而不是模糊地说"审查最近的改动"；第 2 轮起必须明确给出改动文件的**相对路径**（相对 `WORKDIR`），避免 Codex 用错误的 cwd 假设读到不存在或不相关的文件。缓解：命令模板中固定该措辞结构，作为 tasks.md 的实施要点之一，实施时需实测确认 Codex 确实能按预期读取到内容（而不是读空/读错）。
- **[风险] 第 2 轮起不重传未改动内容, 理论上可能漏检"修复引入的、发生在未改动文件里的间接问题"** → 例如修复 A 文件的一个函数签名，导致 B 文件的调用点出错，但 B 文件本身没被这轮直接编辑。缓解：现有 Requirement 已要求"`/ly:review-code` 每轮修复后运行测试/类型检查/构建作为验证步骤"，这类跨文件引用错误应由类型检查/测试捕获，而不是依赖审查者重新扫描全部文件；若项目缺少对应验证命令，这个风险确实存在，但属于现有验证机制覆盖范围的问题，不是本次改动引入的新缺口——本次不额外处理，若后续发现问题再迭代。
- **[权衡] 报告体积变大（每轮都带 Codex 原文）** → 相比现状（只在终止时才展示原文），正常清零场景下最终报告会包含每一轮的原文区块，报告变长。判断收益（可核实性）大于成本（阅读量），且循环通常在 2-3 轮内清零，体量可控；未额外设置"只展示最后一轮原文"这种折中，因为那样又回到"中间轮次不可核实"的老问题。
