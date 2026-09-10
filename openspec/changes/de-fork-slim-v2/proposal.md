# de-fork-slim-v2 — 去上游化瘦身 + Go→TS 全 TS 化重构

## Why

ly-workflow fork 自 ccg-workflow，携带了大量与"两角色精简工作流"定位无关的上游遗产：多模型编排引擎的 Go 基建（并发调度/SSE server/logger）、通用领域知识库、角色扮演风格、MCP 配置管理、Codex 主导模式、旧任务系统的 hooks，以及面向开源社区的姿态文档。这些遗产使项目体积虚胖（Go wrapper 非测试代码 ~4900 行，实际在用约 500 行）、维护面大（Go/TS 双语言 + 跨平台二进制构建 + GitHub Release 下载校验机制），且部分遗产（Codex Mode 的"Codex 作为主导者编排多模型"）与项目现有架构直接矛盾。本项目定位为个人独立项目，需要收敛到纯 workflow 功能并统一为全 TS 实现。

## What Changes

> 决策账本（探索阶段已与用户逐项确认）：D1 砍 domains / D2 砍 output-styles / D3 砍 MCP 配置功能 / D4 砍 Codex Mode / D5 砍 hooks / D6 砍 impeccable+scrapling+orchestration+tools / D7 留 release 三件套 / D8 砍 migration.ts / D9 wrapper 全 TS 化。

- **BREAKING 移除上游遗产资产**（D1/D2/D4/D5/D6）：
  - 删除 `templates/skills/domains/`（域知识库，62 文件 ~464K）与 `templates/hooks/skill-router.js`（其注入器）
  - 删除 `templates/output-styles/`（7 个角色扮演风格）
  - 删除 `templates/codex/` 整个 Codex Mode（AGENTS.md 多模型编排指令、agents/ly-*.toml 子代理、hooks.json + ly-workflow.py、config.toml）及 installer 中对应的安装函数与 menu 入口（`templates/prompts/codex/` 角色词**保留**，属 workflow 核心）
  - 删除 `templates/hooks/` 其余文件（session-start.js / subagent-context.js / workflow-state.js / task-utils.js）——它们全部服务于 v1.0.0 转 OpenSpec 后已无任何写入方的 `.ly/tasks/` 旧任务状态系统
  - 删除 `templates/skills/` 下的 `impeccable/`、`scrapling/`、`orchestration/`、`tools/`（`SKILL.md`、`run_skill.js`、`domains/` 之外的去留随本条一并定：全部移除，`templates/skills/` 目录不再存在）
  - 删除 `templates/rules/ly-skill-routing.md`（domains 的关键词路由表，D1 连带物）；`templates/rules/ly-skills.md` 移除对 orchestration skill 路径的引用（D6 连带断链）；`templates/rules/ly-codegraph.md` 不涉及被删资产，保留
- **BREAKING 移除 MCP 配置功能**（D3）：删除 `src/commands/config-mcp.ts`、`src/commands/diagnose-mcp.ts`、`src/utils/installer-mcp.ts`、`src/utils/mcp.ts` 及 menu/init/update 中对应入口
- **BREAKING Go wrapper → TS 独立脚本**（D9）：删除 `codeagent-wrapper/` Go 工程，重写为 `src/wrapper/`（构建产物 `dist/ly-wrapper.js`，安装到 `~/.claude/bin/ly-wrapper`，node shebang）。保留调用契约：单任务 / stdin 传 prompt / 流式输出转发 / OVERALL+SESSION_ID 解析 / resume 续聊 / 超时 kill / 四 backend（codex/claude/hermes/openclaw）参数构造 / 后端缺失报错。抛弃并发调度、拓扑排序、SSE server、logger 系统。二进制名 `codeagent-wrapper` → `ly-wrapper`，命令模板调用路径同步更新
- **BREAKING 移除 Go 二进制分发机制**：删除 `src/utils/installer.ts` 中 GitHub Release 下载 + `EXPECTED_BINARY_VERSION` 版本门禁 + 多源 fallback；wrapper 随 npm 包分发（`dist/ly-wrapper.js`）；删除 `.github/workflows/build-binaries.yml` 与 release.yml 中的 Go 构建
- **BREAKING 移除已装遗产的安装侧注册**：installer 不再安装/保留任何可选 skill 分类；`cli-skill-category-lifecycle` 相关需求整体退役
- **新增遗产清理能力**：update/uninstall 路径清理用户机器上已装的上游遗产产物（domains、hooks 及 `~/.claude/settings.json` 中注册的 ly hook、output-styles、MCP 配置、Codex Mode 文件、旧 `codeagent-wrapper` 二进制）
- **删除 `src/utils/migration.ts`**（D8）：v1.4 一次性迁移逻辑退役（含最后一个代码层 ccg 字符串残留）
- **删除社区开源姿态文档**：`CONTRIBUTING.md`、`CODE_OF_CONDUCT.md`、`SECURITY.md` 及 `.github` 下 issue/PR 模板（保留 `.github/workflows/`）
- **保留不变**：14 个 `/ly:*` 命令（含 release 三件套，D7）、`templates/prompts/` 角色词、init/update/menu/doctor 安装器骨架、OpenSpec 生命周期流程、审查-修复循环行为

## Capabilities

### New Capabilities

- `ly-wrapper`: TS 版 wrapper（ly-wrapper）的调用契约——四 backend 参数构造、stdin prompt、流式输出、OVERALL/SESSION_ID 解析、resume 续聊、超时 kill、后端缺失报错、随 npm 包分发到 `~/.claude/bin/ly-wrapper`
- `upstream-legacy-cleanup`: 安装器 update/uninstall 对用户机器上已装上游遗产产物（domains/hooks（含 settings.json 注册项）/output-styles/MCP 配置/Codex Mode/旧 codeagent-wrapper 二进制）的清理行为

### Modified Capabilities

- `ly-review-gates`: 审查命令调用的 wrapper 由 `codeagent-wrapper` 更名为 `ly-wrapper`（requirement 文本中的调用方式同步更新，行为语义不变）
- `ly-lifecycle-commands`: apply 委托路径中的 wrapper 名称更新为 `ly-wrapper`
- `optional-implementer-agent`: apply 委托实施路径中的 wrapper 名称更新为 `ly-wrapper`（委托行为语义不变）
- `cli-skill-category-lifecycle`: 可选 skill 分类整体退役，原"跳过分类时清理已装产物"等需求标记 REMOVED（其清理职责由 `upstream-legacy-cleanup` 承接）

## Impact

- **代码**：`src/wrapper/`（新增）、`src/utils/installer.ts`（删下载机制/分类安装/codex mode/MCP）、`src/commands/{menu,init,update,doctor}.ts`（删对应入口）、删除 `src/commands/{config,diagnose}-mcp.ts`、`src/utils/{mcp,installer-mcp,migration}.ts`、`codeagent-wrapper/` 整目录；相关测试同步删改
- **模板**：删除 `templates/{skills,output-styles,codex,hooks}/`；`templates/commands/*.md` 中 wrapper 调用路径改名
- **构建/发布**：`package.json` files 白名单收敛、`build.config.ts` 增加 wrapper entry；`.github/workflows/{build-binaries.yml,release.yml}` 删 Go 构建矩阵；不再需要 Go 工具链
- **分发**：npm 包自带 wrapper 脚本；用户机器上的旧 Go 二进制与已装遗产由 cleanup 能力负责回收
- **文档**：根 CLAUDE.md/README 的模块职责、发版规则（Go 版本号同步条款失效）同步改写
