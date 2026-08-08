## Why

一次 change 从"方案想清楚"到"进入隔离环境写代码"之间，现在全是人工体力活：`/ly:review-plan` 只审一次，发现问题要人读报告、人改 proposal/design/tasks、人再手动重跑一次命令确认清零；确认没问题之后，若想隔离实施（避免污染主工作区），又要人工现算 worktree 路径、现拼分支名、现想清楚基线该从哪切。这三段（方案审查收敛、隔离环境创建、两者之间的衔接）目前分别是"没有""半成品""纯手动"，衔接处全靠使用者记住下一步该做什么。

同时，`/ly:review-code` 已经存在同样的"审查发现问题→人改→人重新触发"痛点，且已经沉淀出一套可复用的审查-修复循环规则（终止条件、熔断判定、修复边界）。没理由让 `/ly:review-plan` 单独再造一套，也没理由让"方案审查通过后怎么进隔离环境"这段留白。

## What Changes

**A. 审查-修复循环扩展到 `/ly:review-plan`**
- `/ly:review-code` 已有的审查-修复循环规则（Critical 清零或熔断即结束、不设固定轮数上限、"文件+问题类别+定位锚点"三者共同判定同一问题、无法安全修复/验证失败也作为停止条件）原样复用给 `/ly:review-plan`。
- `/ly:review-plan` 当前输出是不分级的"问题清单"，本次改为与 `/ly:review-code` 一致的 Critical/Warning/Info 三级输出，循环只由 Critical 驱动，Warning/Info 不参与终止判定，只在最终报告列出最后一轮结果。
- `/ly:review-plan` 的"修复"动作是编辑该 change 自己的 `proposal.md`/`design.md`/`tasks.md`（不是应用代码），修复范围为"Critical 直接指向的条目 + 修复它所必需的直接依赖条目"（不是机械地只改锚点所在的单一位置，但也不得借机改动无关内容，每轮报告需说明关联性）。
- `/ly:review-plan` 不存在 `/ly:review-code` 那种"diff 基线漂移"问题（每轮都是重新读取三份文件的当前内容，不是读 diff），因此不需要复用基线记录规则；但每轮修复后要运行一次 `openspec validate --changes <change-name>` 作为验证步骤，验证失败视为"修复后验证失败"停止条件。
- **审查调用本身失败（超时/非零退出/空响应/格式不符）视为独立终止条件**，不得被误判为"本轮无 Critical"而当作清零通过。
- **Codex 的 Critical 不是必须执行的裁决**：Claude 先判断是否认可，不认可则不修复但要写明反驳理由；同一 Critical 若在下一轮仍被提出且 Claude 依然不认可，触发新增的"分歧未决"终止条件（区别于"熔断"），停止循环转人工，报告双方论点。
- 加一个宽松的全局轮数保底上限（如 20 轮），不作为主终止信号，只防真正失控的死循环。

**B. 新增 `/ly:worktree switch <change-name> [--auto]` 子命令**
- 面向已存在、已提交的 OpenSpec change，一键定位或创建对应的隔离 worktree，输出续接实施的命令，不自动执行、不自动切会话。
- 前置校验：change 必须存在（`proposal.md`**与 `tasks.md` 均已存在**）且无未提交/未跟踪内容；change 名需匹配 `^[a-z0-9]+(-[a-z0-9]+)*$`；**若目标路径尚未是已注册的 worktree**（即本次需要从 base ref 新建），额外校验该 change 的 artifact commit 必须是目标 base ref 的祖先（否则说明改动在别的分支上，从 base ref 切出的新 worktree 不会包含该 change，必须先合并/rebase）——**若目标路径已是已注册的 worktree，跳过这条拓扑校验，直接定位**。
- 路径/分支直接用 change 名推导（`../.ly/<项目名>/<change-name>`），分支基线固定从仓库默认分支最新提交切出（不用当前 HEAD，避免在别的 feature worktree 里误切出错误基线）。
- 覆盖"已是注册 worktree / 路径存在非 worktree / 分支已存在未检出 / 分支已被占用 / 当前已在 worktree 内"五种场景的确定性处理（spec 补全对应 Scenario，不再只在 design.md 出现）。
- baseline（安装+测试）结果与创建/定位结果分开报告；命中"已注册 worktree 直接定位"时跳过 baseline；**baseline 失败时默认不输出续接命令，报告失败摘要并询问是否显式继续**（原设计"不阻断输出"改为默认阻断）。
- **新增 `--auto` 标志**：不改变创建/定位逻辑本身，只改变打印的续接命令内容——不传时维持原文案（"继续实施 change，读取 tasks.md 按任务执行"）；传了则续接命令额外要求新会话在实施完 tasks 后自动依次调用 `/ly:review-code --commit-each-round`，**按其全部终止条件运行**（清零/熔断/分歧未决/无法安全修复/验证失败/审查调用失败/达到全局轮数上限，不只是"清零或熔断"两种），且该轮代码修复完成后逐轮 commit，不留下未提交的自动修复结果。

**C. `/ly:propose` 收尾流程重写：总开关 → commit → 审查 → 询问隔离**
- **总开关**：`/ly:propose` 在调用 `Skill(opsx:propose)` **之前**，先问用户一次"本次要不要走自动化收尾流程（审查循环 + worktree 询问 + 隔离后自动续接实施与审查）？"。这是整条编排链路唯一的开关，只问一次，不在链路中间再重复询问是否启用。
- commit **不受总开关控制**，永远执行：`opsx:propose` 生成完当前 change 的全部 artifact 后，`/ly:propose` 壳在调用前后比对 `openspec list --json` 快照，取新增的那一条作为本次实际生成的 change 名（不再单纯依赖全局 `lastModified` 最新一条，也不依赖 `$ARGUMENTS`；若无法唯一确定则直接询问用户）；确定 change 名后先检查整个 Git index，若存在该 change 目录之外的已暂存内容则停止并要求用户先处理，确认干净后再 `git add -- openspec/changes/<change-name>/` 并 commit（`propose: <change-name>`），**提交后用 `git show --name-only --format=` 校验实际文件集合严格属于该目录**；无内容可提交、提交失败，或提交后校验发现范围超出，则停止后续自动化并报告原因。
- **总开关 = 否**：commit 完成后流程直接结束，不调用 `/ly:review-plan`，不询问 worktree——等价于回到"只生成方案 + 提交"的最小行为。
- **总开关 = 是**：commit 后自动调用 `/ly:review-plan <change-name> --commit-each-round`（走 A 里的审查-修复循环，`--commit-each-round` 让循环自己在每轮修复+验证通过后 commit，不再由 `propose.md` 从外部拦截轮次状态；该 commit 本身失败也视为独立终止条件，不进入下一轮）。
  - **仅当循环终止原因为"Critical 清零"时**，才询问用户是否要为该 change 切换到隔离 worktree：
    - 是 → 调用 `/ly:worktree switch <change-name> --auto`（因为总开关已经是"是"，切换后自然延续自动化——新 worktree 里实施完自动跑 `/ly:review-code --commit-each-round` 循环，不用户额外确认）
    - 否 → 留在当前工作区，流程结束
  - **其余全部终止原因**（熔断、分歧未决、无法安全修复、验证失败、审查调用失败、达到全局轮数上限）都**不询问、不调用 switch**，直接报告对应终止详情——方案本身尚未收敛，不适合急着进隔离环境。

**D. `/ly:apply` 本次范围内保持不变**
- 仍只在委托 `opsx:apply` 完成后追加一句**不含具体 change 名**的通用提示（"如需隔离环境可用 `/ly:worktree switch <change-name>` 或先 `/ly:worktree list` 查看"），不引入编排逻辑或状态查询——这是本次的范围取舍：apply 阶段该有的隔离时机已经在 `/ly:propose` 收尾时处理过（含总开关=是时的自动续接），本次不重复编排；不是受任何"薄壳"原则的约束（该原则已废止，见 design.md）。

## Capabilities

### New Capabilities
- `worktree-switch`：`/ly:worktree switch <change-name>` 子命令
- `ly-propose-flow`：`/ly:propose` 收尾的 commit → 审查循环 → 隔离询问编排

### Modified Capabilities
- `ly-review-gates`：审查-修复循环从只覆盖 `/ly:review-code` 扩展到同时覆盖 `/ly:review-plan`
- `ly-lifecycle-commands`：原"Explore/Propose/Apply/Archive 命令是纯委托"这条统一约束被拆开——`propose` 不再是纯委托（新增总开关+编排），`apply` 允许追加一句通用提示，`explore`/`archive` 维持纯委托不变

## Impact

- `templates/commands/review-code.md`：保持已定稿的审查-修复循环说明，补充"分歧未决"终止条件、审查调用失败终止条件、全局轮数保底、零 commit 场景快照修正、`--commit-each-round` 标志
- `templates/commands/review-plan.md`：新增 Critical/Warning/Info 分级 + 审查-修复循环说明（复用 review-code 同款终止/熔断规则，修复对象换成 change 自身的 artifact 文件，修复范围放宽为"直接指向+必需依赖"，每轮修复后跑 `openspec validate`，同样支持 `--commit-each-round`）
- `templates/commands/worktree.md`：新增 `switch` 子命令（命名校验、分支基线、分支拓扑祖先校验、冲突场景处理、baseline 失败默认阻断、`--auto` 标志控制续接命令文案）
- `templates/commands/propose.md`：从"零逻辑委托壳"改为先问总开关，再委托 `opsx:propose` → 前后快照比对确定真实 change 名 → 精确暂存范围 commit → （开关=是时）调 `/ly:review-plan --commit-each-round` → 询问并调 `/ly:worktree switch --auto` 的编排说明
- `templates/commands/apply.md`：只追加一句不含具体 change 名的通用提示，不改变委托语义
- 不涉及 `codeagent-wrapper` 二进制、`opsx:*` 技能本体
- 根 `CLAUDE.md` 变更记录需同步补充本次新增能力
