# ly-workflow

> Fork 自 [ccg-workflow](https://github.com/fengshao1227/ccg-workflow)（Claude + Codex + Gemini 多模型协作系统），重构为两角色精简工作流。

**Last Updated**: 2026-09-02 (v1.7.3)

---

## 变更记录 (Changelog)

> 完整变更历史请查看 [CHANGELOG.md](./CHANGELOG.md)

### 2026-09-02 (v1.7.3) — README 发布管线命令补齐
- 📝 **README 同步**：命令表补 `/ly:release`/`/ly:changelog`/`/ly:publish`，`/ly:apply` 描述改为按 `routing.implementer` 路由，架构节补发布方式说明（仅文档，无代码变更）

### 2026-09-02 (v1.7.2) — implementer 默认 Claude（本人实施）+ 白名单拆分 + apply 条件块渲染
- ✨ **`routing.implementer` 合法值扩为四选一**：`claude`（新默认）/`codex`/`hermes`/`openclaw`——reviewer 白名单不变（仍不收 `claude`）；`config.ts` 拆分独立 `VALID_IMPLEMENTER_BACKENDS` + `isValidImplementerBackend()`（`ModelRouting.implementer` 类型收窄为 `ImplementerBackend`），`init.ts`/`menu.ts` 存量值校验随语义迁移
- ✨ **默认值四处同改**：init 向导"选择实施后端"四选一、`Claude (recommended)` 置顶；update 非交互补齐值、`{{IMPLEMENTER_MODEL}}` fallback、`createDefaultRouting()` 公共 API 默认值均由 `hermes` → `claude`
- ✨ **`/ly:apply` claude 分支**：`apply.md` 新增条件块（`LY:IF:IMPLEMENTER_EXTERNAL/CLAUDE`，未闭合/未知标记显式报错），implementer=claude 渲染"本人实施"单路径——当前会话直接读 tasks.md 逐任务实施+验证+勾 checkbox → commit，无 wrapper 调用/OVERALL 解析/委托失败分支；非 claude 值仍渲染 wrapper 委托路径
- 🔄 **决策 5 心智模型更新**：Claude 是默认实施者 + 循环 Critical 亲自修复者；外部 implementer 后端降级为进阶选项

### 2026-09-02 (v1.7.1) — 新增发布管线命令：release/changelog/publish
- ✨ **新增 3 个 `/ly:*` 命令**（category: `release`，order 40-42，全量安装）：`/ly:release`（GitFlow 四场景发版——feature/release/hotfix/dev-offline + SemVer 自动推导版本号）、`/ly:changelog`（Keep a Changelog 格式生成 CHANGELOG.md，按 commit 前缀分组 Added/Fixed/Changed）、`/ly:publish`（npm 包发布四场景——bmc 私域 Nexus/GitHub Packages/npmjs+GitHub Release/CI 自动发布，前置检查→版本号推导→构建→发布→验证）；内容源自 liyang-gitflow/liyang-changelog/liyang-npm-publish skill v2.0.0，不新增 npm 依赖或 Go wrapper backend
- 🔄 **命令总数 11 → 14**：`CommandCategory` 新增 `'release'`，`src/utils/installer-data.ts` 的 `CORE_CONFIGS` 注册 3 条 `cmd()`；测试断言与文档计数同步更新

### 2026-09-01 (v1.7.0) — `/ly:apply` 委托外部 Implementer agent + reviewer 收窄三选一
- ✨ **新增 `routing.implementer` 可选实施后端**：`npx ly-workflow init` 在"选择审查模型"之后新增"选择实施后端"步骤（`codex`/`hermes`（默认）/`openclaw` 三选一，必选）；`/ly:apply` 不再由 Claude 自己实施，改为委托 `codeagent-wrapper --backend <routing.implementer>`（`ROLE_FILE: builder.md`）单次 agentic 调用完成 tasks——与审查关卡对称，Claude 只做判定（`OVERALL: PASS` 后走现有 commit 步骤，`FAIL`/调用失败原样呈报转人工，不重试不切回自己实施）；`routing.implementer` 与 `routing.reviewer` 相同时给出独立性下降提示（不阻断）。`npx ly-workflow update` 非交互路径下 implementer 缺失时静默补齐 `hermes`。
- 🔄 **BREAKING：`routing.reviewer` 移除 `claude` 选项**，收窄为 `codex`（默认）/`hermes`/`openclaw`——Claude（当前交互会话）本身是总指挥，不该再被选为被调度的审查/实施 backend。存量 `claude` 配置：交互式 `init` 不再预选、强制重新选择；非交互 `update` 静默重置为 `codex` 并在汇总中提示。
- 🔄 **`ly menu` 模型路由配置入口同步**：移除 `claude`、补齐三选一，新增 `implementer` 编辑入口；历史配置读取统一收口为 `isValidRoutingBackend` 白名单校验（此前 reviewer 挡 claude、implementer 完全不设防，现对称）。
- 🔄 **`review-plan`/`review-code` 审查-修复循环不变**：认可的 Critical 仍由 Claude 亲自修复，不委托给 Implementer agent——只有 `apply` 这一次性的"从 tasks.md 到代码"步骤委托给外部 agent。

> 完整变更历史请查看 [CHANGELOG.md](./CHANGELOG.md)

### 2026-09-01 (v1.6.0) — worktree 询问前置单点 + switch 退役 + 每步 commit + 全自动流水线
- 🔄 **worktree 询问只在创建方案前，全局一次**：`/ly:propose` 在委托 `opsx:propose` 之前询问一次"是否切到隔离 worktree"（不在任何 worktree 内才问），从**当前分支 HEAD** 用 `git worktree add -b <开发分支名>` 切出（目录 `~/.ly/worktrees/<项目名>/<开发分支名>`，单层平铺）；打印续接命令后结束会话，change 后续在隔离区内生成。原方案提交后/审查循环终止后的四处 worktree 询问全部移除。已在 worktree 内 → 跳过该询问（隔离已存在）；worktree/分支锁定为开发分支名，不随 change 名重命名。
- 🗑️ **`/ly:worktree switch` 子命令整体删除（含 `--auto`）**：worktree 命令树只留 `add`/`list`/`remove`/`prune`/`migrate`；`/ly:apply` 的隔离检测（固定路径+分支匹配+不匹配问 switch）与"worktree 反查"优先级一并移除，apply 只在当前工作区实施。
- 🔄 **propose/apply 每步 commit**：`opsx:propose` 生成方案后立即 commit `propose: <change-name>`；`opsx:apply` 实施完成后立即 commit `apply: <change-name>`；不再"暂存区持有、审查循环/跳过审查时才提交"。
- 🔄 **全自动 = 自动流水线直到审完代码**：选全自动时 `/ly:propose` 在同一会话内连续自动执行 `review-plan`（清零）→ `apply`（立即 commit）→ `review-code`（清零），任一环节非清零终止即停止流水线并报告；`/ly:archive` 仍手动。
- 🔄 **审查对象 = 最近一次相关 commit**：`review-plan` 审 `propose:` commit（`git log --grep="^propose:"`），`review-code` 审 `apply:` commit（`git log --grep="^apply:"`），审查范围 = 相关 commit 差异 + `git diff HEAD` + 未跟踪清单；无相关 commit 时退化为未提交 diff。两处审查一致处理。

### 2026-08-18 (v1.5.5) — worktree 询问收敛到 propose 单点
- 🔄 **`/ly:apply` 不再询问 worktree**：隔离性询问与 switch 分支移除，直接在当前工作区实施（需要隔离自行 switch）；`/ly:worktree switch` 自身"默认不创建"的强制确认也移除。worktree 新建/切换询问只在 `/ly:propose` 编排的自动/手动路径各一处。

### 2026-08-18 (v1.5.4) — 迁移退役 + 品牌动态化 + 安装链路修复
- 🔄 **v1.4.0 目录迁移退役**：一次性升级动作，v1.4.1+ 目录结构无变化；此前 config 缺失 + ~/.ly 残留时反复触发并可能卡死安装，已整体移除
- 🔄 **banner 品牌清理**：CCG logo → LY；slogan 去 "Codex Review"（流程代号已随 `{{REVIEWER_MODEL}}` 动态化）；状态行显示实际 reviewer 并超宽折行
- 🐛 **fix(installer)**：仅 GitHub Release 下载 + 版本门禁（删失效 CDN，不再静默装旧版）
- 🐛 **fix(commands)**：报告标签 "Codex 原文" 等 → `{{REVIEWER_MODEL}}`；逐字执行硬约束

### 2026-08-18 (v1.5.3) — wrapper 版本号与 npm 统一 + 三条断裂修复
- 🔄 **wrapper 版本号统一**：`codeagent-wrapper/main.go` 的 `version` 与 `installer.ts` 的 `EXPECTED_BINARY_VERSION` 从独立 6.1.0 改为与 npm 包号一致的 `1.5.3`，此后每次发版同步（消除 5.14.0/6.x 与 1.5.x 脱节）。
- 🐛 **fix(installer)**：二进制下载后版本门禁——CDN 镜像滞留旧 build 且下载"成功"不再校验导致静默装旧；现每源下载后 `--version` 比对 `EXPECTED_BINARY_VERSION`，不符删除并转下一源。
- 🐛 **fix(uninstall)**：卸载补删 `rules/ly-fast-context.md` 漏网规则文件。
- 🐛 **fix(hooks)**：`skill-router.js` 模板清 gemini/both 死分支，补 hermes/claude/openclaw 触发，ROLE_FILE 无 prompts 目录时回退 codex。

### 2026-08-18 (v1.5.2) — migration 迁移日志品牌残留清理
- 🐛 **fix**：`migration.ts` 迁移日志模板字符串仍是 v1.4.2 清理前的 `~/.ccg/...`（实际操作路径是 `~/.ly/...`），已改对；迁移时跳过 macOS Finder 系统文件 `.DS_Store`，不再复制到新配置目录。

### 2026-08-18 (v1.5.1) — review-plan lite 模式修复
- 🐛 **fix**：`/ly:review-plan` 模板 command 行补上与 review-code 一致的 `{{LITE_MODE_FLAG}}` 占位符——此前该模板缺占位符，`--lite` 未被注入，init 选定 lite 模式（"不要 web"）后 review-plan 运行时 `liteMode=false` 仍拉起 web server，与 review-code 行为不一致。

### 2026-08-18 (v1.5.0) — 可选审查 agent：codex/claude/hermes/openclaw + 轮间续聊
- ✨ **审查后端可选扩展为四值**：`codex`（默认）/`claude`/`hermes`/`openclaw`——init 向导"选择审查模型"步骤新增 Hermes 与 OpenClaw 两项，`routing.reviewer` 持久化四值；修复 `{{REVIEWER_MODEL}}` 断线——review-code/review-plan 模板的 `--backend codex` 改为 `--backend {{REVIEWER_MODEL}}`，init 选定的审查后端真正生效（此前选了 Claude 也不生效，占位符只存在于文档）。
- ✨ **`codeagent-wrapper` 新增 `HermesBackend`/`OpenClawBackend`**：`--backend hermes`（`hermes -z` one-shot 纯文本输出，`-r` 续聊）与 `--backend openclaw`（`openclaw agent --local -m --json` embedded 输出，`--session-id` 续聊）；parser 新增"非 JSON 行收集为 message"的文本兜底 + openclaw 多行 JSON blob 提取（`payloads[].text`/`sessionId`）；修复未知 JSON 事件（`{"item":null}`）被误当 message 的问题。
- 🔄 **审查循环第 2 轮起改为 resume 续聊**：首轮 wrapper 返回的 `SESSION_ID` 记录在案，第 2 轮起以 `--backend <后端> resume <session_id> -` 调用，使审查 agent 保留轮间记忆（同一流程内复用，不跨命令/跨项目）；未取得 session_id 退化独立调用并如实说明；增量传递规则不变。

### 2026-08-14 (v1.4.4) — 提交时机改造：propose/apply 产物暂存区持有 + 审查后提交
- 🔄 **`/ly:propose`/`/ly:apply` 不再无条件立即 commit**：产物默认 `git add` 暂存到暂存区，作为后续审查循环（`/ly:review-plan`/`/ly:review-code`，审查范围 `git diff HEAD` 覆盖已暂存+未暂存）的审查对象。自动模式下审查循环清零统一提交（免询问）；手动模式下在"明确跳过审查"或"审查循环非清零终止"时询问是否提交（仅提交暂存区中的产物，循环产生的未暂存修复保留在工作区）。`/ly:init`/`/ly:archive` 无条件自动 commit 不变。
- 🔄 **`/ly:review-code` 审查范围判定简化为两级**：有未提交变更 → `git diff HEAD`；零 commit 仓库 → 三条固定命令组合（`git diff --cached` + `git diff` + `??` 未跟踪清单）。工作区彻底干净时直接报告"无变更可审查"并结束，删除 `git diff HEAD~1`/`git show HEAD` 历史 commit 兜底分支（审查对象原则上是未提交的变更，历史 commit 不属于审查范围）。
- 🔄 **`/ly:review-plan` 删除"循环开始前已脏文件的隔离跳过"逻辑**（步骤 1.5 及其提交时引用）：`/ly:propose` 产物现在是合法审查对象，清零统一提交对 target change 目录全部 artifact 与 delta spec 文件 `git add` 后一并提交。
- 🔄 **两审查命令清零统一提交改为"先 `git add` 审查目标全部文件再 commit"**（原始改动 + 循环修复一并暂存，同一待提交单元），不再依赖循环期间临时收集的文件清单。
- 🔄 **`/ly:worktree switch --auto` 续接文案移除"自动 commit"字样**（apply 已不再自动 commit）。
### 2026-08-13 (v1.4.3) — 审查循环增量传递 + 人话报告 + 提交时机改造
- 🔄 **`/ly:review-code`/`/ly:review-plan` 第 2 轮起改为增量传递**：TASK 只传"上一轮 Critical 原文 + 路径清单（本轮改动文件 ∪ 上一轮全部 Critical 指向的文件）"，指示 Codex 自行读取判断，不再整段重传完整基线 diff/全部方案文档；首轮也只传基线引用/路径清单，不预先拼贴全文；零 commit 场景取消"构造快照"，改用 `git diff --cached`/`git diff`/未跟踪文件清单三条固定命令组合——Codex backend 实测以 agentic 模式运行，具备自主 shell/文件读取能力，不需要调用方代填全文。
- 🔄 **报告改为逐轮展示 Codex 原始发现（逐字）+ 人话摘要**：每一轮（含首轮 Critical 为 0 的情况）都展示 Codex 原文与 Claude 判定的并排对照，不再只在"分歧未决"终止场景才展示；最终报告的 Critical 摘要改为用人话概括问题和已做改动，逐字原文作为补充材料并存。
- 🔄 **提交行为改为"循环期间不提交，仅在正常清零后统一提交一次"**（原为"每轮修复后立即 commit"）：非清零终止（熔断/无法安全修复/验证失败/分歧未决/审查对象类型持续系统性误判/达到轮数上限）不产生任何提交，改动留在工作区；`--no-commit` 语义调整为"连最终统一提交也不做"；`/ly:review-plan` 新增提交隔离——跳过循环开始前已存在未提交改动的文件，避免把无关改动一并提交。
- ✨ **`/ly:review-plan` 的"spec 未覆盖 What Changes"检查项区分两种"无 delta spec"情形**：proposal 未声明任何 capability（正常，不报）vs 声明了 capability 但零 delta spec（报 Critical）——`openspec validate`/`openspec archive` 只校验 delta 总数是否为 0，不逐个核对每个声明的 capability 是否有对应 delta spec，这是唯一能捕捉该问题的检查点。
- 🐛 **fix**：`templates/prompts/codex/reviewer.md` 输出格式仍是过时的 VALIDATION REPORT 打分制（`XX/100`），与命令层实际要求的 Critical/Warning/Info 分级格式不一致，统一改为分级结构并补充路径契约。

### 2026-08-13 (v1.4.2) — worktree 默认目录改到用户目录 + 内部 ccg 品牌残留清理
- 🔄 **`/ly:worktree` 默认目录改为 `~/.ly/worktrees/<项目名>/`**（原 `../.ly/<项目名>/`，项目同级目录）：跨项目集中管理，`add`/`switch` 路径计算、文档同步更新；`--local` 项目内 `.worktrees/` 选项不受影响。
- 🔄 **清理内部代码标识符、运行时文件名/marker 字符串、模板内容里残留的 `Ccg`/`CCG`/`ccg` 品牌名**，统一改为 `Ly`/`LY`/`ly`：`CcgConfig`→`LyConfig`、`.ccg-version`→`.ly-version`、`ccg-fast-context.md`→`ly-fast-context.md`、`<!-- CCG:START -->`→`<!-- LY:START -->` 等；`src/utils/migration.ts` 按范围决策不动（自用项目不考虑老用户升级兼容）。
- 🐛 **fix**：`templates/hooks/skill-router.js` 域知识自动注入功能因硬编码旧路径（`skills/ccg/`）静默失效，改名后随之修复；`installer.ts` 里 Codex mode 卸载数组文件名与实际安装产物不一致的问题一并修复。

### 2026-08-10 (v1.4.1) — review-plan 独立角色提示词 + 读取spec + 系统性误判终止条件
- ✨ **`/ly:review-plan` 新增独立角色提示词 `plan-reviewer.md`**：明确禁止把"代码库尚未实现方案条目""tasks.md 任务未勾选"当 Critical（方案审查阶段的正常状态），`/ly:review-code` 不受影响仍用 `reviewer.md`。
- ✨ **`/ly:review-plan` 读取范围扩展到该 change 的全部 delta spec（`specs/**/*.md`）**：使 Codex 能判断"spec 是否覆盖 proposal 的 What Changes"；修复对象同步扩展到这些 spec 文件，否则发现的问题无法被修复导致循环不清零。
- ✨ **`/ly:review-code`/`/ly:review-plan` 共用终止条件新增第 9 类"审查对象类型持续系统性误判"**：连续 3 轮 Critical 均属同一大类系统性误判（不要求锚点匹配）即停止转人工——解决 Codex 每轮换锚点重复报同一类误判、现有熔断/分歧未决因锚点不匹配收不住、循环空转到轮数上限的问题。

### 2026-08-10 (v1.4.0) — propose 全自动/手动两路径 + apply 隔离检测 + switch 分支校验
- ✨ **`/ly:propose` 总开关改为"全自动 vs 手动"两条路径**：手动路径新增两处 worktree 询问点（方案提交后、审查循环终止后）与一处"要不要跑审查"询问；无论哪条路径，审查循环以"清零"之外的任一原因终止时都问一次 worktree（不带 `--auto`），非正常终止统一视为"退出自动模式，回到人工确认"。
- ✨ **`/ly:apply` 新增执行前隔离检测**：目标 change 名按固定优先级解析（显式参数 → 当前 worktree 反查 → 唯一未归档 change → 询问用户），已在该 change 的受控目标 worktree（固定路径 `../.ly/<项目名>/<change-name>` + 注册分支双重匹配）内跳过询问，不在或不匹配则先问一次要不要切换。
- ✨ **`/ly:worktree switch` 新增分支校验**：定位到"目标路径已注册"时，校验该路径当前分支是否严格等于目标 change 名，不匹配则拒绝执行、不直接定位——补上"固定路径被占用导致 `/ly:apply` 侧保护被绕过"这个口子；路径解析统一以 `git rev-parse --git-common-dir` 反推主仓库位置为基准。
- 🔄 **`/ly:review-code`/`/ly:review-plan` 全局轮数上限 20→5**，并明确"清零优先于轮数上限"。
- ⚠️ **已知限制**：本次隔离检测只防误操作，不防故意绕过——不校验目标分支 `HEAD` 是否真的包含该 change 当前的 artifact，也不强制 `switch` 续接命令必须经过 `/ly:apply`。

### 2026-08-10 (v1.3.0) — 全流程 commit 覆盖：init/apply/archive 补commit，review循环默认自动commit
- ✨ **`/ly:init`/`/ly:apply`/`/ly:archive` 补上自动 commit**：三者原先产生文件变动后不提交，现分别在生成 CLAUDE.md+openspec 结构、实施 tasks、归档 change 后自动 commit；无可提交内容或 commit 失败时跳过并如实报告，不中断主流程。
- 🔄 **`/ly:review-code`/`/ly:review-plan` 每轮自动 commit 改为默认行为**：原先需显式传 `--commit-each-round`，现默认开启，新增 `--no-commit` 用于关闭；`/ly:propose`/`/ly:worktree switch --auto` 的续接提示同步去掉冗余标志。

### 2026-08-10 (v1.2.1) — explore 加转向提示，防止绕开 propose 编排
- 🔄 **`/ly:explore` 加一句转向提示**：`opsx:explore` 原生支持讨论中直接创建 proposal/design/spec，但这样会跳过 `/ly:propose` 的编排（总开关、commit、review-plan 审查循环、worktree 询问）——讨论收敛到"要落地方案"时改为提示用户切换 `/ly:propose`，explore 本身不接管 artifact 创建。

### 2026-08-08 (v1.2.0) — Change 生命周期自动化：审查-修复循环 + worktree switch + propose 总开关
- ✨ **`/ly:review-code`/`/ly:review-plan` 新增审查-修复循环**：Critical 清零或触发终止条件（熔断/分歧未决/无法安全修复/验证失败/审查调用失败/达到全局轮数上限）才停止；Codex 报告的 Critical 不再是自动生效的裁决——Claude 先判断是否认可，不认可则不修复但要写反驳理由，同一问题连续两轮分歧则触发"分歧未决"转人工。`/ly:review-plan` 同步补上 Critical/Warning/Info 分级（此前是不分级的问题清单）。两者都支持 `--commit-each-round` 标志，由循环自身逐轮提交。
- ✨ **`/ly:worktree` 新增 `switch <change-name> [--auto]` 子命令**：按 OpenSpec change 名一键定位或创建隔离 worktree，只打印续接命令不自动执行；含分支拓扑校验（已注册 worktree 直接定位跳过校验，新建场景要求 change 提交在默认分支历史上）、命名合法性校验、baseline 失败默认阻断。
- 🔄 **`/ly:propose` 从零逻辑委托壳升级为编排入口**：调用 `opsx:propose` 前先问一次总开关（要不要走自动化收尾），commit 不受开关影响永远执行；开关开启时依次调用 `/ly:review-plan --commit-each-round`、（Critical 清零后）询问是否 `/ly:worktree switch --auto`。`/ly:apply` 保持薄壳，只追加一句通用提示。
- 🔄 **废止"薄壳不附加自定义逻辑"这条项目级原则**：见下方"关键设计决策"。

### 2026-08-07 (v1.1.0) — CLI 品牌残留清理 + 分类卸载修复
- 🐛 **fix(cli)**：清理 CLI 展示层残留的旧品牌名 "CCG - Claude + Codex + Gemini" 及 `/ccg:` 前缀；`showHelp()` 改为运行时读目录动态展示已装命令。
- 🐛 **fix(installer)**：修复跳过安装 impeccable skill 分类时的卸载/清理不完整——按分类过滤复制源、清理历史遗留目录、用生成器指纹校验清理对应命令文件（避免误删用户自定义同名文件）。
- ✨ **新增 spec**：`openspec/specs/cli-skill-category-lifecycle/spec.md`。

### 2026-08-07 (v1.0.0) — 首个版本，二次开发型改造
- 🔄 **架构重构**：从"Gemini前端 + Codex后端 + Claude编排"的多模型协作系统，简化为两角色工作流——Claude Code 自己完成聊天/分析/规划/实施，Codex 只在两个节点做审查关卡（方案审查 + 代码审查）。
- 🔄 **最大化复用 OpenSpec 原生流程**：删除 CCG 自研的多模型引擎（`templates/engine/`）与 OpenSpec 包装命令（`spec-*`），改用原生 `opsx:explore`/`opsx:propose`/`opsx:apply`/`opsx:archive`。
- ✨ **新增 7 个 `/ly:*` 命令**：`init`（生成 CLAUDE.md + `openspec init`）、`explore`/`propose`/`apply`/`archive`（薄壳委托 opsx 技能）、`review-plan`（审方案）、`review-code`（审代码，Critical/Warning/Info 分级）。
- 🔄 **Go wrapper 瘦身**：`codeagent-wrapper` 只保留 `codex`/`claude` 两个 backend，删除 `GeminiBackend`/`GrokBackend`/`AntigravityBackend`。
- 🔄 **项目改名**：`ccg-workflow` → `ly-workflow`，CLI 命令前缀 `ccg` → `ly`。
- 🗑️ **删除**：`templates/commands-legacy/`（18 个旧版多模型命令）及其安装机制（`LEGACY_CONFIGS`、init 向导的"旧版兼容"选项、update 自动保留逻辑）；`templates/prompts/{gemini,grok,antigravity}/`。

---

## 模块职责

**ly-workflow** 是一套精简的 Claude Code 工作流：Claude 自己完成开发全流程，Codex 仅作为独立审查关卡介入。核心组成：

1. **14 个 `/ly:*` 命令**：项目初始化 + OpenSpec 生命周期委托 + 双审查关卡 + GitFlow 发布管线
2. **`codeagent-wrapper`**：Go 二进制，桥接 Codex/Claude CLI，供 review-plan/review-code 调用
3. **Git 工具**：`commit`/`rollback`/`clean-branches`/`worktree`
4. **质量关卡技能**：`verify-security`/`verify-quality`/`verify-change`/`verify-module`/`gen-docs`（继承自原 ccg-workflow，逻辑不变，安装命名空间随改名调整）

---

## 入口与启动

```bash
npx ly-workflow        # 一键安装/菜单
npx ly-workflow menu    # 交互式菜单
```

- **主入口**：`bin/ly.mjs` → `src/cli.ts`
- **核心命令**：`init`（`src/commands/init.ts`）、`update`（`src/commands/update.ts`）、`menu`（`src/commands/menu.ts`）

---

## 对外接口

### Slash Commands（14 个）

| 命令 | 用途 |
|------|------|
| `/ly:init` | 生成 CLAUDE.md（原生 `init` 技能）+ `openspec init` + 自动 commit |
| `/ly:explore` | 委托 `opsx:explore` |
| `/ly:propose` | 创建方案前问一次 worktree（不在 worktree 内才问，从当前分支 HEAD 切）+ 问"全自动/手动" → 委托 `opsx:propose` → **方案自审**（commit 前：正向/反向逻辑闭环 + 基线波及 + 通用业务维度过网，逐项结论清单硬约束；机械断链直接修、业务判断类问用户——全自动模式下仍问）→ commit `propose: <change>`（自审修复一并落库）；全自动 = review-plan → apply → review-code 自动化流水线；手动 = 逐步确认 |
| `/ly:apply` | 读取 `routing.implementer`（`claude`（默认）/`codex`/`hermes`/`openclaw`）渲染：claude=当前会话本人读 tasks.md 逐任务实施+验证+勾 checkbox→commit；非 claude=委托 `codeagent-wrapper` + `builder.md` 单次 agentic 调用实施 tasks。全部任务完成后立即 commit `apply: <change-name>`；未全部完成原样呈报转人工（不重试不兜底）（无隔离检测、无 worktree 询问） |
| `/ly:archive` | 委托 `opsx:archive` + 自动 commit |
| `/ly:review-plan` | 审查对象为目标 change 的 `propose:` commit，{{REVIEWER_MODEL}} 分级审查，审查-修复循环直到清零或触发终止条件（全局轮数上限 5 轮，清零优先），清零时统一提交修复 |
| `/ly:review-code` | 审查对象为目标 change 的最近 `apply:` commit，{{REVIEWER_MODEL}} 分级审查，审查-修复循环直到清零或触发终止条件（全局轮数上限 5 轮，清零优先），清零时统一提交修复 |
| `/ly:release` | GitFlow 四场景发版（feature/release/hotfix/dev-offline），SemVer + Conventional Commits 自动推导版本号，用户确认后执行 |
| `/ly:changelog` | Keep a Changelog 格式生成/更新 CHANGELOG.md，按 commit 前缀分组（Added/Fixed/Changed），无对应提交的分组自动省略 |
| `/ly:publish` | npm 包发布四场景（bmc 私域 Nexus/GitHub Packages/npmjs+GitHub Release/CI 自动发布），前置检查→版本号推导→构建→发布→验证 |

不变的 Git 工具：`/ly:commit` `/ly:rollback` `/ly:clean-branches`；`/ly:worktree` 只留 `add`/`list`/`remove`/`prune`/`migrate`（`switch` 子命令已随 v1.6.0 删除——隔离切换统一由 `/ly:propose` 创建方案前触发）。

### 典型工作流

```
/ly:init → /ly:propose "需求描述" → /ly:review-plan → /ly:apply → /ly:review-code → /ly:archive
```

---

## 关键设计决策

1. **`propose` 是编排入口，`apply`/`archive` 现在也各自带一段自动 commit 逻辑，`explore` 仍是纯薄壳**：`propose.md` 包含创建方案前的 worktree 询问（不在 worktree 内才问，从当前分支 HEAD 用 `git worktree add` 切出）、全自动/手动询问、commit 前的方案自审（提出者查逻辑闭环与业务全面性，机械断链直接修、业务判断类问用户）、每步 commit、全自动流水线（review-plan → apply → review-code）等编排逻辑；`apply.md` 只负责在工作区实施 + 立即 commit，`archive.md` 在委托 opsx 技能之后提交文件变动，`explore.md` 只做参数转发+一句转向提示。是否要加编排逻辑按需判断即可，不受任何"必须是薄壳"的原则约束——原有的"委托而非重新封装"原则已废止（2026-08-08）。
2. **审查走 codeagent-wrapper 而非直连 Codex API**：复用已有的 session 管理、进度回调、超时重试。
3. **Go wrapper 只删 Backend 层**：`Backend` interface 保持不变，删除具体实现（Gemini/Grok/Antigravity）不影响执行引擎（并发调度/日志/SSE）。
4. **LICENSE + git 历史不动**：文档整体重写，但版权声明和提交历史保留可追溯性。
5. **`apply` 默认由 Claude 本人实施，外部 Implementer agent 降级为可选后端**：`routing.implementer` 四选一（`claude`（默认）/`codex`/`hermes`/`openclaw`），reviewer 仍三选一（不含 `claude`）——Claude（当前交互会话）是总指挥，不该被选为被调度的审查 backend；实施对速度敏感（默认本人直做，带着 propose 阶段全部上下文直接开干），审查对独立性敏感（必须独立于编排者）。implementer=claude 时 `apply.md` 在安装期渲染为"本人实施"单路径（读 tasks.md 逐任务实施+验证+勾 checkbox + commit，无 wrapper 调用/OVERALL 解析/委托失败分支）；非 claude 值仍渲染 wrapper 委托路径（单次 agentic 调用，PASS 才提交，FAIL 原样呈报转人工，不重试不切回自己实施）。外部后端保留为进阶选项——想保持实施视角多样性/隔离性的用户手动选择。`review-plan`/`review-code` 的审查-修复循环不变，认可的 Critical 仍由 Claude 亲自修复，不委托给 Implementer。

---

## 相关文件

```
src/                      # TypeScript CLI 源码
templates/commands/       # 14 个 slash command
templates/prompts/{codex,claude}/  # 审查/协作角色提示词
templates/skills/         # 质量关卡技能
codeagent-wrapper/        # Go 二进制（codex + claude backend）
```

详见 [src/CLAUDE.md](./src/CLAUDE.md)、[templates/CLAUDE.md](./templates/CLAUDE.md)、[codeagent-wrapper/CLAUDE.md](./codeagent-wrapper/CLAUDE.md)。

---

## 发版规则

1. 更新 `package.json` 版本号
2. 更新 `CHANGELOG.md`（新条目在顶部）
3. 更新本文件的变更记录
4. **wrapper 版本号与 npm 包号统一（每次发版都同步，非仅 Go 改动时）**：`codeagent-wrapper/main.go` 的 `version` 与 `src/utils/installer.ts` 的 `EXPECTED_BINARY_VERSION` 必须与 `package.json` 版本号一致（如 1.5.3），Go 代码改动额外需 bump 这两处并重新构建
5. `pnpm typecheck && pnpm build && pnpm test` 全绿后 commit
6. **发布方式：GitHub Actions 自动发布**，不在本地跑 `npm publish`——打 tag `v<版本号>`（如 `v1.2.0`）并 push，`.github/workflows/release.yml` 监听 `push: tags: ['v*.*.*']` 自动触发发布
