## Context

见 proposal.md「Why」。当前仓库 `templates/commands/` 共 12 个现役核心命令：`go.md`（驱动 `templates/engine/` 里的 model-router + 9 个 strategy 文件做多模型分派）、5 个 `spec-*.md`（CCG 自研的 OpenSpec 包装层）、以及 `clean-branches`/`commit`/`context`/`init`/`rollback`/`worktree` 共 6 个不涉及模型路由的工具命令。除此之外，`templates/commands-legacy/` 还有 18 个可选安装的旧版多模型命令（`workflow`/`plan`/`execute`/`team*`/`frontend`/`backend`/`codex-exec`/`feat`/`analyze`/`debug`/`optimize`/`test`/`review`/`enhance`），由 `installer-data.ts` 的 `LEGACY_CONFIGS` 注册，`init.ts` 向导提供"旧版兼容"选项主动安装，且 `update()` 检测到既有安装含旧版命令时会自动继续保留安装——这条自动保留路径若不清除，`ly-workflow` 升级时会把旧多模型命令原样带回来，直接违背本次变更目的。`codeagent-wrapper` 是无第三方依赖的 Go 二进制，`Backend` 接口（`backend.go`）已用一致的模式接入 5 个后端（codex/claude/gemini/antigravity/grok），删除三个只需移除对应 struct + 注册表条目，执行引擎（executor/parser/logger/server）不涉及具体后端类型，天然隔离。

## Goals / Non-Goals

**Goals:**
- 终态命令集共 12 个：删除 6 个核心命令（`spec-init`/`spec-research`/`spec-plan`/`spec-impl`/`spec-review`/`go`），重写 1 个（`init`），新增 6 个（`explore`/`propose`/`apply`/`archive`/`review-plan`/`review-code`），保持不变 5 个（`clean-branches`/`commit`/`context`/`rollback`/`worktree`）
- `templates/commands-legacy/` 18 个旧版命令及其安装机制（`LEGACY_CONFIGS`、`getLegacyCommandIds()`、`init.ts` 的"旧版兼容"选项、`update()` 的自动保留逻辑）全部移除，终态不存在任何可选装的旧多模型命令入口
- Go wrapper 只保留 codex + claude 两个 backend，其余代码零改动
- 项目改名落地到所有安装路径、CLI 入口、文档
- 文档整体重写但保留 LICENSE 原文与 git 历史

**Non-Goals:**
- 不改造 codeagent-wrapper 的执行引擎、SSE Web UI、日志系统
- 不为质量关卡技能（verify-*）、域知识秘典、impeccable 工具集的**内容/逻辑**做任何调整——但它们的**安装命名空间**随整体改名统一变化（`~/.claude/skills/ccg/` → `~/.claude/skills/ly/`），这属于第 5 节"项目改名"的路径替换范围，不是单独的功能改动
- 不追求向后兼容旧的 `/ccg:*` 命令名（此次是 BREAKING 改名，不做别名兼容层）

## Decisions

### 1. 命令实现为纯委托 vs 重新封装
`init`/`explore`/`propose`/`apply`/`archive` 直接在 markdown 命令内容里写"调用 Skill 工具执行 opsx:xxx，参数传 $ARGUMENTS"，不新增中间逻辑。
- **理由**：用户明确要求"执行的还是他们的命令"，且 CCG 已有先例（`spec-init.md` 证明命令 = prompt 模板这一机制完全可行，只是这次故意做得更薄）。
- **备选**：像现有 `spec-*.md` 一样加环境校验/多模型检测——放弃，因为不再需要多模型校验，加校验只是重新引入已决定去掉的复杂度。

### 2. review-plan / review-code 走 codeagent-wrapper 而非直接调用 Codex API
沿用现有 `codeagent-wrapper --backend codex` + `~/.claude/.ly/prompts/codex/reviewer.md` 角色文件的调用方式（参考 `model-router.md` 原有调用模板的思路，路径已随改名调整为 `.ly`），只是从"双模型并行"改成"单模型单次调用"。
- **理由**：wrapper 已处理好 session 管理、进度回调、超时重试，重新实现这些没有收益。
- **备选**：直接用 Bash 调 `codex` CLI 原生命令——放弃，会丢失 wrapper 的输出解析（parser.go 已支持 stream-json 解析 session_id/agent_message）。

### 3. Go wrapper 删除范围精确到 Backend 层，不动执行引擎
只删 `backend.go` 里 `GeminiBackend`/`GrokBackend`/`AntigravityBackend` 三个 struct + `BuildArgs` 函数，及 `config.go` 里 `GeminiModel`/`GrokModel` 字段和 `main.go`/`executor.go`/`parser.go`/`filter.go`/`server.go` 中对应的条件分支（如 gemini 的 stdin pipe 特殊处理、grok 的 fallback 路径解析）。
- **理由**：`Backend` interface 本身就是为多后端设计的干净抽象，删除具体实现不影响接口契约或执行引擎；风险集中、改动可精确定位。
- **备选**：整体重写 wrapper 为 codex-only 单体程序——放弃，工作量大且执行引擎的并发/日志/SSE 能力仍有价值（review-code 可能是长任务，需要进度反馈）。

### 4. 文档重写但保留 LICENSE + git 历史（二次开发型 fork 惯例）
README/CONTRIBUTING/CHANGELOG/SECURITY/CODE_OF_CONDUCT/issue 模板整篇重写为 ly-workflow 视角；LICENSE 文件原样保留；git commit 历史不重写。CHANGELOG.md 新起一份，首条注明 fork 来源。
- **理由**：这是架构层面的大改（二次开发），旧文档描述的多模型协作系统已不存在，增量更新只会产生名实不符的文档；但 LICENSE 修改涉及协议合规，git 历史重写会破坏可追溯性，两者是硬底线，与文档重写不冲突。

### 5. Capabilities 命名：`ly-lifecycle-commands` / `ly-review-gates`
按新命令的两个行为簇拆成两个 capability spec，而非每个命令一个 spec 文件。
- **理由**：5 个委托命令行为高度同构（"调用对应 opsx 技能"），拆成 5 个 spec 文件会有大量重复样板；2 个审查命令共享"调 codeagent-wrapper + codex reviewer"机制但输入输出契约不同，值得单独一个 capability。

## Risks / Trade-offs

- **[风险] 删除 Go backend 代码可能遗漏某个隐藏引用** → 缓解：实施阶段先跑 `go build ./...` + `go test ./...` 确认编译和现有测试全绿，再逐个搜索 `Gemini|Grok|Antigravity` 确认零残留
- **[风险] 命令改名是 BREAKING，已安装旧版本的用户 `/ccg:*` 命令会失效** → 缓解：这是用户自己的 fork，非公开分发产品，可接受；不做兼容层
- **[风险] review-plan 在没有活跃 OpenSpec change 时行为未定义** → 缓解：spec 中已明确要求此时询问用户而非猜测（见 `ly-review-gates` spec 的对应 scenario）
- **[权衡] 放弃双模型交叉验证的审查质量** → 可接受：用户明确选择单 Codex 审查以换取简单性，这是产品决策不是技术限制

## Migration Plan

1. 先完成 Go wrapper 瘦身 + 测试（风险最集中，独立可验证）
2. 再完成 templates/ 删除与新增（命令层，依赖 wrapper 改动完成后才能验证 review-plan/review-code 实际调用）
3. 再完成 src/ 类型简化与安装器调整
4. 最后统一改名（package.json、路径引用、文档）——放最后是因为改名影响面最广，前面步骤稳定后一次性改名减少返工
5. 无需回滚策略：这是本地 fork 开发，未发布给外部用户，出问题直接改代码即可，不涉及线上迁移
