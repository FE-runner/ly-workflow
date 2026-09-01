## Context

`/ly:apply` 现在固定调用 `Skill({ skill: "opsx:apply" })`，由当前 Claude 会话自己读 `tasks.md`、写代码、跑验证（`templates/commands/apply.md`）。审查关卡（`/ly:review-plan`/`/ly:review-code`）已经支持把审查委托给外部 backend——`routing.reviewer`（`codex`/`claude`/`hermes`/`openclaw` 四选一，`src/commands/init.ts:382-388`），通过 `codeagent-wrapper --backend <reviewer>` 单次 agentic 调用（`templates/commands/review-code.md` 步骤 2），角色提示词走 `ROLE_FILE: ~/.claude/.ly/prompts/{{REVIEWER_MODEL}}/reviewer.md`。审查者只发现问题，接受/拒绝与修复始终是 Claude 自己做。

`templates/prompts/codex/builder.md` 是老版多模型引擎（已删除）遗留的"Implementation Agent"角色提示词，从未被任何命令引用——但其 Output Format（`## Execution Report` + 逐任务 PASS/FAIL + 末尾 `OVERALL: [PASS/FAIL]`）已经是现成的、可直接复用的契约。安装器对 `hermes`/`openclaw` 走 codex 目录兜底复制（`installer.ts:326-343`：`srcModelDir` 不存在时回退到 `promptsTemplateDir/codex`），所以 `builder.md` 已经会被装到这两个 backend 的 prompts 目录下，不需要新建文件。

参见 `proposal.md` 了解为什么要做这个改动（对称架构 + 省 Claude token + 总指挥定位）。

## Goals / Non-Goals

**Goals:**
- `/ly:apply` 的实施步骤可以委托给独立于当前 Claude 会话的外部 agent（`routing.implementer`），单次 agentic 调用完成全部 tasks。
- 保持与 review 关卡一致的失败处理哲学：不静默降级、不静默重试、不静默切换 backend。
- `routing.reviewer`/`routing.implementer` 都不再允许选 `claude`——避免"总指挥"和"被调度的 backend"混为一个身份。

**Non-Goals:**
- 不改动 `/ly:review-plan`/`/ly:review-code` 的审查-修复循环——认可的 Critical 仍由 Claude 亲自修复，不委托给 Implementer agent。
- 不给 apply 引入类似 review 的"审查-修复循环"或重试机制——单次调用，PASS 就提交，FAIL 就转人工。
- 不处理 `routing.implementer` 与 `routing.reviewer` 相同时的强制阻断——只提示，不禁止。
- 不改动 `worktree`/`propose`/`archive`/`commit` 相关命令的既有逻辑。

## Decisions

### 1. 单次 agentic 调用，不逐任务拆分（选项 A，而非 Claude 逐任务编排）
`/ly:apply` 委托 Implementer agent 时，一次调用把整份 `tasks.md` 交给它自主完成，而不是 Claude 逐个任务拼 prompt、等结果、再拼下一个。

理由：省 Claude token 的关键在于减少 Claude 侧的 prompt 构造与结果解析次数——真正吃 token 的"读文件/写代码/跑测试/迭代修 bug"发生在 Implementer agent 自己的进程里，与 Claude 的上下文预算无关。逐任务拆分会把这些开销重新转嫁成 N 次 Claude-Implementer 往返，抵消掉委托的收益。

代价：Claude 对实施过程的可见性降到跟审查一样低，只能读最终 Execution Report，无法中途纠偏。这是刻意接受的权衡（对应 proposal 里"总指挥不再动手"的定位）。

### 2. PASS/FAIL 单轮判定，不引入重试或审查-修复循环
Implementer agent 返回 `OVERALL: FAIL`（或 wrapper 调用超时/非零退出/空响应）时，`/ly:apply` 直接原样呈报并停止，不自动重试、不自动切回 Claude 自行实施。

理由：
- 自动重试会引入多轮调用，抵消单次调用省 token 的初衷，且没有像 review 循环那样的"Critical 清零"这种收敛信号可依赖（builder.md 的 Output Format 只有粗粒度的 PASS/FAIL，没有分级问题清单可供逐条判断收敛）。
- 隐式切回 Claude 自行实施会让"这段代码到底是谁写的"变得不透明，且这次改动的前提就是 Claude 不再亲自实施——留一个隐藏兜底会架空这个前提。
- 失败后仍然可以走既有的 `/ly:review-code`/人工介入路径，不是死胡同，只是需要人工决定"换个 backend 重跑"还是"手动接手"。

替代方案考虑过："验证失败重试 1-2 轮"（讨论中提到的折中方案）——放弃，因为 Critical 分级驱动的收敛机制在 review 循环里是必要的（问题可枚举、可逐条认可/拒绝），但 apply 的 PASS/FAIL 是不可分级的粗粒度信号，重试逻辑无法像 review 循环那样精确判断"改好了没有"，容易变成盲目重跑。

### 3. `routing.implementer` 与 `routing.reviewer` 都不允许选 `claude`
两个配置项的可选值都从"含 claude"收窄为 `codex`/`hermes`/`openclaw` 三选一。

理由：Claude（当前交互会话）本身已经是总指挥（出方案、裁决审查意见、亲自修复、commit、终止判断）。如果 reviewer/implementer 又能选"claude"这个 wrapper backend，本质上是同一个底层模型换一个独立 CLI 进程跑——审查/实施的"独立性"收益有限，还容易让人误解"当前会话"和"被调度的 claude backend"是不是同一个东西。移除后，两个配置项的语义更清晰：总指挥是当前会话，backend 选项都是"跟总指挥不同的外部工具"。

代价：这是一次 **BREAKING** 变更——已有配置 `routing.reviewer=claude` 的项目需要迁移（见 Migration Plan）。

### 4. `routing.implementer` 必选，无"不委托"选项；默认值 `hermes`
不像最初讨论过的"默认 `claude` 即维持现状"方案，最终定稿是 `routing.implementer` 必选（三选一），因为 review-fix 循环仍由 Claude 亲自完成，"默认值退化为不委托"这个折中已经不再必要——apply 委托本身就是纯增量能力，只是"委托给谁"没有默认关闭的选项。默认值选 `hermes`（而不是与 `routing.reviewer` 默认值相同的 `codex`），避免两者默认值撞在一起触发独立性提示。

### 5. 新增 `{{IMPLEMENTER_MODEL}}` 模板变量，复用 `{{REVIEWER_MODEL}}` 的注入模式
`src/utils/installer-template.ts` 现有 `injectConfigVariables()` 对 `{{REVIEWER_MODEL}}` 的处理方式（`routing.reviewer || 'codex'` → 正则替换）原样复制一份给 `{{IMPLEMENTER_MODEL}}`（`routing.implementer || 'hermes'`），`templates/commands/apply.md` 里 `ROLE_FILE: ~/.claude/.ly/prompts/{{IMPLEMENTER_MODEL}}/builder.md` 复用同一套占位符机制，不新增额外的模板处理逻辑。

## Migration Plan

- **交互式路径**（用户主动运行 `npx ly-workflow init`）：`routing.reviewer` 选项列表不再含 `claude`；若既有配置值是 `claude`，向导不把它作为预选项、也不留在候选列表里，用户必须重新选择。`routing.implementer` 是全新字段，正常走"选择实施后端"步骤。
- **非交互路径**（`npx ly-workflow update` 内部跑 `init --force --skip-mcp --skip-prompt`）：
  - `routing.reviewer` 历史值为 `claude` → 静默重置为默认值 `codex`，升级汇总里提示"检测到已移除的 claude 选项，已重置为默认值"。
  - `routing.implementer` 缺失 → 静默写入默认值 `hermes`，不提示（因为这是新字段，不是"重置"，没有历史值需要说明）。
- 两条路径都不需要用户在升级过程中手动编辑配置文件；`routing.implementer` 从缺失到写入默认值全程自动完成。

## Risks / Trade-offs

- **[risk] Claude 对实施过程可见性降到最低，出问题只能等最终报告** → mitigation：失败时原样呈报，转人工；`/ly:review-code` 仍会对最终代码做独立审查，不依赖 apply 阶段的可见性来兜底质量。
- **[risk] BREAKING 变更影响存量 `routing.reviewer=claude` 用户** → mitigation：非交互 `update` 路径静默重置且给出提示，不阻断升级；交互式 `init` 路径强制用户显式重新选择，不会静默用一个用户没见过的值覆盖。
- **[risk] `routing.implementer` 与 `routing.reviewer` 选同一个 backend，独立性名义上下降** → mitigation：向导给出提示但不阻断（尊重用户判断，某些场景下"同一个 backend 但不同角色提示词"仍有可用性，只是不如选不同 backend 独立）。
- **[risk] builder.md 的 Output Format 是粗粒度 PASS/FAIL，无法像 review 的 Critical 分级那样精细判断"改坏了什么"** → mitigation：这是刻意的范围控制（见 Decision 2），FAIL 统一转人工，不试图自动诊断失败原因。
