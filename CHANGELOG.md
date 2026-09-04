# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> Forked from [ccg-workflow](https://github.com/fengshao1227/ccg-workflow) at v3.2.3. History before this point lives in that project's own CHANGELOG.

---
---
---

## [1.7.4] - 2026-09-04

### Added
- **`/ly:propose` 方案自审步骤**：`opsx:propose` 产物生成后、`propose:` commit 前由方案提出者（当前会话 Claude）自审，补上"需求逻辑闭环 + 业务全面性"在方案定稿前的检查缺口——外部审查者无 propose 讨论上下文，查业务不全面只能撒网；提出者上下文最全且具备直接修改权，机械问题当场修、业务问题当场问。四项检查：正向闭环（每条 What Change → design 决策 → tasks 任务）、反向闭环（每个任务可溯源，孤儿任务处理）、基线波及（Modified Capabilities 逐条对照基线 Requirements）、通用业务维度过网（权限/失败路径/并发/兼容迁移，不适用必须写明理由）。
- **发现二分处理**：机械断链（漏任务、范围未同步）直接改 artifact 不询问；业务判断类（"这个场景要不要支持"）列开放问题用 AskUserQuestion 问用户——**全自动流水线模式下仍然问**（作为流水线的人工确认点，与"需要人工介入"同级）；用户拒绝回答时停止编排转人工。
- **防走过场硬约束**：自审必须产出逐项结论清单（通过 / 不适用+理由 / 已修复 / 待用户决策 四值结论），禁止"自审通过，无问题"一句带过，silent skip 视为未执行。
- **spec**：`ly-propose-flow` 新增 2 个 Requirement（自审四项检查 + 逐项清单硬约束）+ 4 个 Scenario，MODIFIED"产物每步 commit"Requirement 同步自审时序。

### Changed
- **`propose:` commit 时序**：自审在快照比对定名之后、index 检查与 commit 之前执行，自审修复随 `propose: <change-name>` commit 一次干净落库（产物与自审修复同一待提交单元，review-plan 审查对象天然含自审结果）。
- **职责分工固化**：闭环与全面性主责移到自审（上下文敏感），`/ly:review-plan`/`plan-reviewer.md`/审查-修复循环/`codeagent-wrapper` 全部不动（独立视角敏感，维持一致性 + 风险审查）。

## [1.7.3] - 2026-09-02

### Changed
- **README 同步**：命令表补上 v1.7.1 起缺失的 `/ly:release`/`/ly:changelog`/`/ly:publish` 三条发布管线命令；`/ly:apply` 描述修正为按 `routing.implementer` 路由（原仍写 v1.6.x 的"委托 `opsx:apply`"）；架构节补充 claude 默认实施、reviewer 可配置与 tag 触发 CI 自动发包的说明。

## [1.7.2] - 2026-09-02

### Added
- **`routing.implementer` 合法值扩为四选一**：`claude`（新默认）/`codex`/`hermes`/`openclaw`——reviewer 白名单不变（仍不收 `claude`），拆分出独立 `VALID_IMPLEMENTER_BACKENDS` 白名单与 `isValidImplementerBackend()` 校验（`ModelRouting.implementer` 类型收窄为 `ImplementerBackend`）。实施对速度敏感、审查对独立性敏感，"实施默认本人直做、外部模型只保留为可选实施后端与审查关卡"成为更合理的默认。
- **init 向导**："选择实施后端"步骤四选一，`Claude (recommended)` 置顶为默认（原 `Hermes`）；`ly menu` 模型路由入口同步补 Claude 选项、(recommended) 标记迁移；`{{IMPLEMENTER_MODEL}}` 缺失 fallback 与 `createDefaultRouting()` 公共 API 默认值均由 `hermes` 改为 `claude`。
- **`/ly:apply` claude 分支**：`apply.md` 新增安装期条件块（`<!-- LY:IF:IMPLEMENTER_EXTERNAL -->` / `<!-- LY:IF:IMPLEMENTER_CLAUDE -->`），implementer=claude 时渲染"本人实施"单路径版本——当前会话 Claude 直接读 tasks.md 逐任务实施+验证+勾 checkbox → commit，无 wrapper 调用、无 OVERALL 解析、无委托失败分支；非 claude 值仍渲染现有 wrapper 委托路径。条件块未闭合/未知标记显式报错不静默保留（`injectConfigVariables`）。

### Changed
- **update 非交互补齐值 `hermes` → `claude`**：`--skip-prompt` 路径检测到 `routing.implementer` 缺失时静默写 `claude`；存量合法值（含 v1.7.0 写入的 `hermes`）一律尊重不改写。
- **决策 5 心智模型更新**：Claude 是默认实施者 + 循环 Critical 亲自修复者；外部 implementer 后端降级为进阶选项（想保持实施视角多样性/隔离性的用户手动选择）。

### Fixed
- **`--implementer` CLI help 与 `templates/CLAUDE.md` apply.md 描述同步**：help 文本补上 `claude` 选项与默认值说明（原仍写三选一，误导用户以为 claude 不可选）；apply.md 命令表描述区分"claude=本人实施 / 外部后端=委托 wrapper"双路径。

## [1.7.0] - 2026-09-01

### Added
- **`routing.implementer` 可选实施后端**：`npx ly-workflow init` 新增"选择实施后端"步骤（`codex`/`hermes`（默认）/`openclaw` 三选一，必选）；`/ly:apply` 不再由 Claude 自己实施代码，改为委托 `codeagent-wrapper --backend <routing.implementer>`（`ROLE_FILE: builder.md`）以单次 agentic 调用实施全部 tasks——与审查关卡对称，Claude 只做判定（PASS 后 commit，FAIL 原样呈报转人工，不重试不兜底）。`routing.implementer` 与 `routing.reviewer` 选同一个 backend 时给出独立性下降提示（不阻断）。
- `npx ly-workflow update`（非交互 `--skip-prompt` 路径）在 `routing.implementer` 缺失时静默补齐默认值 `hermes`。

### Changed
- **BREAKING：`routing.reviewer` 移除 `claude` 选项**，收窄为 `codex`（默认）/`hermes`/`openclaw` 三选一——Claude（当前交互会话）本身是总指挥，不应再被选为被调度的审查/实施 backend。存量配置为 `claude` 的项目：交互式 `npx ly-workflow init` 不再预选该值、要求重新选择；非交互 `npx ly-workflow update` 静默重置为默认值 `codex` 并在汇总中提示。
- `ly menu` 的"模型路由配置"入口同步移除 `claude`、补齐三选一，新增 `routing.implementer` 编辑入口，历史配置读取统一收口为白名单校验（`isValidRoutingBackend`）。
- `/ly:review-plan`/`/ly:review-code` 的审查-修复循环不变：认可的 Critical 仍由 Claude 亲自修复，不委托给 Implementer agent。

## [1.6.0] - 2026-09-01

### Changed
- **worktree 询问前置单点**：`/ly:propose` 的 worktree 询问从"方案提交后/审查循环终止后"（原 6a/6b 共四处）前移到**创建方案前、全局只问一次**——不在任何 worktree 内时询问，选"是"则从**当前分支 HEAD** 用 `git worktree add -b <开发分支名>` 切出（目录 `~/.ly/worktrees/<项目名>/<开发分支名>`，单层平铺，worktree/分支锁定为开发分支名、不随 change 重命名），打印续接命令后结束会话，change 后续在隔离区内生成；已在 worktree 内 → 跳过该询问（隔离已存在）。
- **`/ly:worktree switch` 子命令整体删除（含 `--auto`）**：worktree 命令树只留 `add`/`list`/`remove`/`prune`/`migrate`；`/ly:apply` 的隔离检测（固定路径+分支匹配+不匹配问 switch）与"worktree 反查"优先级一并移除，apply 只在当前工作区实施。
- **propose/apply 每步 commit**：`opsx:propose` 生成方案后立即 commit `propose: <change-name>`；`opsx:apply` 实施完成后立即 commit `apply: <change-name>`；不再"暂存区持有、审查循环/跳过审查时才提交"。
- **全自动 = 自动流水线直到审完代码**：选全自动时 `/ly:propose` 同一会话连续自动执行 review-plan（清零）→ apply（立即 commit）→ review-code（清零），任一环节非清零终止即停止并报告；`/ly:archive` 仍手动。
- **审查对象 = 最近一次相关 commit**：review-plan 审 `propose:` commit、review-code 审 `apply:` commit（`git log --grep` 按前缀定位最近一期），审查范围 = 相关 commit 差异 + `git diff HEAD` + 未跟踪清单；无相关 commit 时退化为未提交 diff。

### Removed
- `/ly:worktree switch` 子命令与 `--auto` 标志
- apply 隔离检测、`propose.md` 原 6a/6b 的四处 worktree 询问与 switch 结果统一判定规则

## [1.5.5] - 2026-08-18

### Changed
- **worktree 询问收敛到 propose 单点**：`/ly:apply` 的隔离检测询问与 switch 分支、`/ly:worktree switch` 自身"已在 worktree 内默认不创建"的强制确认均移除——全局 worktree 新建/切换询问只在 `/ly:propose` 两条路径各一处出现

## [1.5.4] - 2026-08-18

### Changed
- **退役 v1.4.0 目录迁移**：config 缺失 + ~/.ly 残留时反复触发的一次性迁移（打印 "Migration completed/Skipped"、个别安装卡死）已整体移除；v1.4.1+ 目录结构未变，迁移不再需要
- banner/状态行清理：CCG 旧 logo → LY、slogan "Claude Code + Codex Review" → "Claude Code + AI Review"、状态行新增 `reviewer: <routing.reviewer>` 且超宽自动拆行
- **审查后端名动态化**：报告/日志中原有的 "Codex 原文"/"Codex 各轮原始发现" 等流程代号改为 `{{REVIEWER_MODEL}}`（实际后端名），ROLE_FILE 同步指向 `prompts/<backend>/...`，prompts 补齐 hermes/openclaw 角色文件

### Fixed
- `needsMigration` 跳过阈值放宽（config.toml 存在即跳过）
- 逐轮执行日志硬性约束：Warning/Info 禁省略号压缩、清零轮判定须写明依据
- 二进制下载仅保留 GitHub Release 源（删除陈旧 Cloudflare CDN）并加版本门禁，不再静默安装旧 build

## [1.5.3] - 2026-08-18

### Changed
- **wrapper 版本号与 npm 包号统一**：`codeagent-wrapper` version / `EXPECTED_BINARY_VERSION` 由 6.1.0 改为 `1.5.3`，此后每次发版同步（发布规则第 4 条已更新）——消除 5.14.0/6.x 与 npm 1.5.x 双版本脱节带来的困惑（精确字符串匹配校验，降号无兼容风险）

### Fixed
- `installer` 二进制下载后版本门禁：优先源 CDN 镜像（github.20031227.xyz）滞留旧 build，下载"成功"后不再校验导致旧版被静默安装；现每源下载后 `--version` 与 `EXPECTED_BINARY_VERSION` 比对，不符则删除并转下一源，均失败显式报错
- `uninstall` 补删 `~/.claude/rules/ly-fast-context.md`（`writeFastContextPrompt` 单独写入，原固定文件名清单漏删）
- `skill-router.js` 模板清理 v3.0 多模型时代残留的 gemini/双模型（both）分支（wrapper 已无 gemini backend），`MODEL_ACTIONS` 补 hermes/claude/openclaw；hermes/openclaw 无 prompts 目录时 ROLE_FILE 回退到 codex 角色提示词

## [1.5.2] - 2026-08-18

### Fixed
- `migration.ts` 迁移日志模板字符串清理 v1.4.2 残留的 `~/.ccg/...` 品牌路径（实际操作为 `~/.ly/` → `~/.claude/.ly/`，日志显示与实际不符）；迁移时跳过 macOS Finder 系统文件 `.DS_Store`，不再将其复制到新配置目录（`68225cf`）

## [1.5.1] - 2026-08-18

### Fixed
- `/ly:review-plan` 模板 command 行补上与 review-code 一致的 `{{LITE_MODE_FLAG}}` 占位符：此前该模板缺占位符，`--lite` 未被注入，init 选定 lite 模式（"不要 web"）后 review-plan 运行时 `liteMode=false` 仍拉起 web server——与 review-code 行为不一致（`8e5b1c9`）

## [1.5.0] - 2026-08-14

### Added
- 审查后端可选扩展为四值：`codex`（默认）/`claude`/`hermes`/`openclaw`——init 向导的"选择审查模型"步骤新增 Hermes 与 OpenClaw 两个选项，`routing.reviewer` 持久化四值
- `codeagent-wrapper` 新增 `HermesBackend`（`hermes -z` one-shot 纯文本输出、`-r` 续聊）与 `OpenClawBackend`（`openclaw agent --local -m --json` embedded 输出、`--session-id` 续聊），`--backend hermes`/`--backend openclaw` 可用

### Changed
- 修复 `{{REVIEWER_MODEL}}` 断线：`/ly:review-code`/`/ly:review-plan` 模板里的 `--backend codex` 改为 `--backend {{REVIEWER_MODEL}}`——init 选定的审查后端真正生效（此前选了 Claude 也无效，占位符只存在于文档）
- `codeagent-wrapper` parser 新增"非 JSON 行收集为 message"的文本兜底分支：外部 CLI（如 hermes `-z`）输出的纯文本不再被静默丢弃；并识别 openclaw `--json` 的多行 JSON blob（提取 `payloads[].text` 与 `sessionId`）；未知 JSON 事件 `{"item":null}` 不再误判为 message
- `/ly:review-code`/`/ly:review-plan` 审查-修复循环第 2 轮起改为 **resume 续聊**：首轮 wrapper 返回的 `SESSION_ID` 记录在案，第 2 轮起以 `--backend <后端> resume <session_id> -` 调用，使审查 agent 保留轮间记忆（同一流程内复用，不跨命令/跨项目）；未取得 session_id 时退化为独立调用并如实说明

### Fixed
- 修复 parser 对未知 JSON 事件的处理：`{"item":null}` 等空事件不再被当作纯文本拼入 message

## [1.4.4] - 2026-08-14

### Changed
- **提交时机改造**：`/ly:propose` 与 `/ly:apply` 不再无条件立即 commit——产物默认 `git add` 暂存到暂存区，作为后续审查循环的审查对象；自动模式下审查循环清零统一提交（免询问），手动模式下在"明确跳过审查"或"审查循环非清零终止"时询问是否提交（仅提交暂存区中的产物，循环产生的未暂存修复保留在工作区）。`/ly:init`/`/ly:archive` 的无条件自动 commit 保持不变。
- `/ly:review-code` 审查范围判定从四层优先级简化为两级：有未提交变更 → `git diff HEAD`；零 commit 仓库 → 三条固定命令组合（`git diff --cached` + `git diff` + `??` 未跟踪清单）。工作区彻底干净时直接报告"无变更可审查"并结束，**删除** `git diff HEAD~1` / `git show HEAD` 历史 commit 兜底分支（审查对象原则上是未提交的变更，历史 commit 不属于审查范围）。
- `/ly:review-plan` 删除"循环开始前已脏文件的隔离跳过"逻辑（步骤 1.5 及其提交时引用）：`/ly:propose` 产物现在是合法审查对象，清零统一提交对 target change 目录全部 artifact 与 delta spec 文件 `git add` 后一并提交，不再把循环前的未提交产物当无关脏文件跳过。
- 两个审查命令清零后的统一提交由"仅暂存并提交循环期间实际改动的文件"改为"先 `git add` 审查目标全部文件（原始改动 + 循环修复一并暂存），再执行一次 commit"——审查目标原始改动与修复是同一待提交单元，不再依赖循环期间临时收集的文件清单。
- `/ly:worktree switch --auto` 续接文案移除"自动 commit"字样（改为"运行 `/ly:apply` 继续实施（完成后自动依次调用 `/ly:review-code`）"）——apply 已不再自动 commit。
---

## [1.4.3] - 2026-08-13

### Changed
- `/ly:review-code`/`/ly:review-plan` 审查-修复循环第 2 轮起改为增量传递：TASK 只传"上一轮 Critical 原文 + 路径清单（本轮改动文件 ∪ 上一轮全部 Critical 指向的文件）"，指示 Codex 自行读取判断，不再整段重传完整基线 diff/全部方案文档；首轮 TASK 同样只传基线引用/路径清单，不预先拼贴全文；零 commit 场景取消"构造快照"这一步，改用 `git diff --cached` + `git diff` + 未跟踪文件清单三条固定命令组合
- 报告模板改为每一轮（含首轮 Critical 为 0 的情况）都展示"Codex 本轮原始发现（逐字）"区块与 Claude 的认可/不认可判定，不再只在"分歧未决"终止场景才展示；最终报告的 Critical 摘要改为用人话概括问题和已做的改动，逐字原文作为补充材料并存
- `/ly:review-code`/`/ly:review-plan` 默认提交行为由"每轮修复后立即 commit"改为"循环期间不提交，仅在正常清零结束后对全程改动统一提交一次"；非清零终止（熔断/无法安全修复/验证失败/分歧未决/审查对象类型持续系统性误判/达到轮数上限）不产生任何提交，改动留在工作区；`--no-commit` 语义调整为"连这次最终统一提交也不做"；`/ly:review-plan` 场景下新增提交隔离规则——跳过循环开始前就已存在未提交改动的文件，避免把无关改动一并提交
- `/ly:review-plan` 的"spec 未覆盖 proposal 的 What Changes"检查项，区分"proposal 未声明任何 capability（无 delta spec 属于正常情况）"与"proposal 声明了 capability 但完全没有 delta spec（报 Critical）"——`openspec validate`/`openspec archive` 只校验 delta 总数是否为 0，不逐个核对每个声明的 capability 是否有对应 delta spec，这条检查是唯一能捕捉该问题的机制

### Fixed
- `templates/prompts/codex/reviewer.md` 输出格式仍是过时的 VALIDATION REPORT 打分制（`XX/100`），与命令层实际要求的 Critical/Warning/Info 分级格式不一致，统一改为分级结构并补充路径契约（每条发现的"位置"字段必须给出可解析的文件相对路径，跨文件问题需列出全部相关路径）

---

## [1.4.2] - 2026-08-13

### Changed
- `/ly:worktree` 默认 worktree 目录从项目同级的 `../.ly/<项目名>/` 改为用户目录 `~/.ly/worktrees/<项目名>/`，跨项目集中管理；`add`/`switch` 路径计算与文档同步更新，`--local` 项目内 `.worktrees/` 选项不变
- 清理内部代码标识符、运行时文件名/marker 字符串（`.ccg-version`、`ccg-fast-context.md`、`ccg-grok-search.md`、`<!-- CCG:START -->` 等）及模板内容里残留的 `Ccg`/`CCG`/`ccg` 品牌名，统一改为 `Ly`/`LY`/`ly`；`src/utils/migration.ts` 按范围决策不动

### Fixed
- `templates/hooks/skill-router.js` 域知识自动注入功能因硬编码旧路径（`skills/ccg/`）静默失效，改名后随之修复
- `src/utils/installer.ts` 里 Codex mode 卸载数组的文件名与实际安装产物不一致的问题，随重命名一并修复

---

## [1.4.1] - 2026-08-10

### Added
- `/ly:review-plan` 新增独立角色提示词 `templates/prompts/codex/plan-reviewer.md`：明确禁止把"代码库尚未实现该方案条目""tasks.md 任务未勾选"作为 Critical 依据（这是方案审查阶段的正常状态），checklist 聚焦文档本身的逻辑缺陷；`/ly:review-code` 不受影响，继续使用原 `reviewer.md`
- `/ly:review-plan` 读取工件范围扩展到该 change 目录下的全部 delta spec 文件（`specs/**/*.md`），使 Codex 能判断"spec 是否覆盖 proposal 的 What Changes"；修复对象同步扩展到这些 spec 文件
- `/ly:review-code`/`/ly:review-plan` 共用的终止条件新增第 9 类"审查对象类型持续系统性误判"：连续 3 轮 Critical 均被判定为同一大类系统性误判（不要求锚点匹配）即停止转人工，解决之前"Codex 每轮换锚点重复报同一类误判，现有熔断/分歧未决因锚点不匹配收不住"导致循环空转到轮数上限的问题

---

## [1.4.0] - 2026-08-10

### Added
- `/ly:propose` 总开关改为"全自动 vs 手动逐步确认"两条路径：手动路径新增两处 worktree 询问点（方案提交后、审查循环终止后）与一处"要不要跑 review-plan 审查"询问
- 无论全自动还是手动路径，审查循环以"清零"之外的任一终止原因结束时都问一次 worktree（不带 `--auto`），非正常终止统一处理为"退出自动模式，回到人工确认"
- `/ly:apply` 执行前新增隔离检测：目标 change 名按固定优先级解析（显式参数 → 当前 worktree 反查 → 唯一未归档 change → 询问用户），已在该 change 的受控目标 worktree（固定路径 + 注册分支双重匹配）内跳过询问，不在或不匹配则先问一次要不要切换
- `/ly:worktree switch` 定位到"目标路径已注册"时新增校验该路径当前分支是否严格等于目标 change 名，不匹配则拒绝执行、不直接定位——堵住"固定路径被占用导致 `/ly:apply` 侧新增保护被绕过"这个口子
- `switch` 的续接命令统一按"是否带 `--auto`"和"是否有 baseline 失败摘要"组合出四种续接提示文案，确保"先处理 baseline"和"完成后自动审查"两个约束在交叉场景下都不丢失

### Changed
- `/ly:review-code`/`/ly:review-plan` 的全局轮数上限默认值从 20 轮降到 5 轮，并明确"清零优先于轮数上限"——第 N 轮（含第 5 轮）若结果本身是清零，按清零处理，不因命中轮数上限而误报
- `/ly:worktree switch` 的目标路径解析统一以 `git rev-parse --git-common-dir` 反推的主仓库位置为基准，不依赖调用发生时所处 worktree 的相对路径

### Known Limitations
- 本次隔离检测的目标是防误操作，不是防故意绕过：不校验目标分支 `HEAD` 是否真的包含该 change 当前的 artifact，也不强制 `/ly:worktree switch` 的续接命令必须经过 `/ly:apply`（续接提示仍是建议性引导）

---

## [1.3.0] - 2026-08-10

### Added
- `/ly:init` 生成 CLAUDE.md + `openspec init` 后自动 commit（`CLAUDE.md`、`openspec/`）
- `/ly:apply` 委托 `opsx:apply` 实施 tasks 后自动 commit 本次实际改动的文件
- `/ly:archive` 委托 `opsx:archive` 归档后自动 commit `openspec/` 下的文件移动

### Changed
- `/ly:review-code`/`/ly:review-plan` 的每轮自动 commit 由"需显式传 `--commit-each-round`"改为默认行为，新增 `--no-commit` 用于关闭
- `/ly:propose` 调用 review-plan、`/ly:worktree switch --auto` 的续接提示同步去掉现已冗余的 `--commit-each-round` 标志

---



### Changed
- `/ly:explore` 加一句转向提示：`opsx:explore` 原生支持讨论中直接创建 proposal/design/spec，但这样会跳过 `/ly:propose` 的编排（总开关、commit、review-plan 审查循环、worktree 询问）；讨论收敛到"要落地方案"时改为提示用户切换 `/ly:propose`，explore 本身不接管 artifact 创建

---

## [1.2.0] - 2026-08-08

### Added
- `/ly:review-code`/`/ly:review-plan` 新增审查-修复循环：Critical 清零或触发终止条件（熔断/分歧未决/无法安全修复/验证失败/审查调用失败/达到全局轮数上限，默认 20 轮）才停止；Codex 报告的 Critical 不再是自动生效的裁决，Claude 先判断是否认可，不认可则不修复但要写反驳理由，同一问题连续两轮分歧则触发"分歧未决"转人工
- `/ly:review-plan` 补上 Critical/Warning/Info 三级分级输出（此前是不分级的问题清单）
- `/ly:review-code`/`/ly:review-plan` 新增 `--commit-each-round` 标志，由循环自身在每轮修复+验证通过后逐轮提交
- `/ly:worktree` 新增 `switch <change-name> [--auto]` 子命令：按 OpenSpec change 名一键定位或创建隔离 worktree，含分支拓扑祖先校验（已注册 worktree 直接定位跳过）、命名合法性校验、baseline 失败默认阻断续接命令；`--auto` 让续接命令要求新会话实施完自动跑审查循环
- 新 spec：`openspec/specs/worktree-switch/spec.md`、`openspec/specs/ly-propose-flow/spec.md`

### Changed
- `/ly:propose` 从零逻辑委托壳升级为编排入口：调用 `opsx:propose` 前先问一次总开关（是否走自动化收尾），commit 不受开关影响永远执行；开关开启时依次调用 `/ly:review-plan --commit-each-round`，审查循环以 Critical 清零结束后询问是否 `/ly:worktree switch --auto`
- `/ly:apply` 委托完成后追加一句不含具体 change 名的通用 worktree 切换提示
- 废止"薄壳不附加自定义逻辑"这条项目级原则——`propose` 已是编排入口，`apply`/`archive`/`explore` 仍是薄壳但不再受该原则约束
- `openspec/specs/ly-review-gates/spec.md`、`openspec/specs/ly-lifecycle-commands/spec.md` 同步合并本次 delta

---

## [1.1.0] - 2026-08-07

### Fixed
- CLI 展示层残留旧品牌名 "CCG - Claude + Codex + Gemini" 及 `/ccg:` 前缀，统一改为反映当前两角色定位的文案；`showHelp()` 改为运行时读目录动态展示已装命令，不再手工枚举
- 跳过安装 impeccable skill 分类时的卸载/清理逻辑不完整：补上按分类过滤复制源、清理历史遗留目录、清理对应命令文件（用生成器指纹校验避免误删用户自定义同名文件），并在 `InstallResult` 中补充清理结果字段用于展示

### Added
- 新 spec：`openspec/specs/cli-skill-category-lifecycle/spec.md` — 描述可选 skill 分类的完整生命周期管理

## [1.0.0] - 2026-08-07

### Changed
- **BREAKING**: renamed project `ccg-workflow` → `ly-workflow`, CLI/slash-command prefix `ccg` → `ly`
- Simplified from a three-model collaboration system (Gemini frontend / Codex backend / Claude orchestrator) to a two-role workflow: Claude Code does chat/analysis/planning/implementation itself, Codex only reviews
- Command set now delegates lifecycle steps directly to native OpenSpec skills (`opsx:explore`/`propose`/`apply`/`archive`) instead of re-wrapping them
- `codeagent-wrapper` (Go binary) now only supports `codex` and `claude` backends

### Added
- `/ly:review-plan` — Codex reviews an OpenSpec change's plan (proposal/design/tasks) for soundness before implementation
- `/ly:review-code` — Codex reviews git diff (including untracked files), grades findings Critical/Warning/Info
- `/ly:init` — generates CLAUDE.md and initializes `openspec/` in one command
- `/ly:explore`, `/ly:propose`, `/ly:apply`, `/ly:archive` — thin delegators to native `opsx:*` skills

### Removed
- `templates/engine/` (model-router + 9 strategy files) and its dispatch logic
- `spec-init`/`spec-research`/`spec-plan`/`spec-impl`/`spec-review`/`go` commands
- `templates/commands-legacy/` (18 legacy multi-model commands) and its install mechanism (`LEGACY_CONFIGS`, `getLegacyCommandIds()`, init wizard's "legacy compatibility" option, update's auto-preserve logic)
- `GeminiBackend`/`GrokBackend`/`AntigravityBackend` from `codeagent-wrapper`
- `templates/prompts/{gemini,grok,antigravity}/`
- Model routing wizard steps (frontend/backend model selection); replaced with a single reviewer-model choice (codex/claude)
