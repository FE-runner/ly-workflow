## Context

ly-workflow 现有 11 个 slash command，全量安装在 `~/.claude/commands/ly/`。命令模板放在 `templates/commands/` 目录，每个命令对应一个 `.md` 文件，通过 `src/utils/installer-data.ts` 中的 `cmd()` 函数注册。添加新命令的流程是：创建 `.md` 模板 → 在 `installer-data.ts` 加一行注册 → 更新文档。无需修改 installer.ts（自动从 templates 目录发现）、menu.ts（help 从 `getWorkflowConfigs()` 动态读取）或 init.ts。

三个新命令的内容已存在于升级到 v2.0.0 的 liyang-gitflow/liyang-changelog/liyang-npm-publish skill 中（位于 `/Users/ly/codes/learn/liyang-skills/src/`），此处将其转化为 ly-workflow 命令模板格式。

## Goals / Non-Goals

**Goals:**
- 三个命令模板 `release.md`、`changelog.md`、`publish.md` 可被 `npx ly-workflow init` 正常安装
- 每个命令有完整的 guide 内容，Claude 读取后可按步骤执行对应操作
- 命令注册到 `installer-data.ts` 的 `CORE_CONFIGS` 数组，与其他核心命令一样无条件安装

**Non-Goals:**
- 不在 init 向导中增加可选项（三个命令全量安装，不按需跳过）
- 不新增 npm 依赖或 Go wrapper backend
- 不修改 `src/types/index.ts`、`src/i18n/`、`src/commands/init.ts`
- 不改变现有 11 个命令的任何行为

## Decisions

### 1. 命令注册方式：直接加入 `CORE_CONFIGS` 数组

**选择**：在 `installer-data.ts` 的 `CORE_CONFIGS` 数组中添加 3 条 `cmd(...)` 调用，category 使用 `release`。

**替代方案**：单独创建 `RELEASE_CONFIGS` 数组并合并到 `WORKFLOW_CONFIGS`。不采用——目前 `WORKFLOW_CONFIGS` 就是 `CORE_CONFIGS` 的直接引用，没有"可选命令"机制，加一个新数组无必要。

### 2. 命令模板格式：自包含 markdown（纯指令式，不包含 frontmatter 描述流程参数）

**选择**：参考现有简单命令（如 `commit.md`）的格式——frontmatter 只有 `description`，正文是指令式步骤描述。不包含复杂的步骤编号和参数表（这些是给 Claude 读的自然语言指令，不是 shell 脚本）。

**理由**：ly-workflow 的命令模板本质是 Claude 的 system prompt 片段——Claude 读到后用自然语言理解并在会话中执行，不像 Makefile 或 CI 配置那样需要精确的参数解析。

### 3. 命令不调用外部工具/MCP

**选择**：三个命令全部使用标准 shell 命令（git、npm/pnpm、gh cli）+ Claude 的自然语言执行能力。不依赖 codeagent-wrapper 或其他 MCP 工具。

**理由**：现有 git 工具命令（commit、rollback、clean-branches）都是纯 shell 操作模式，不需要通过 Go wrapper 调用外部 agent。review-plan/review-code 需要 codeagent-wrapper 是因为要驱动外部 AI agent 做审查判断，而 release/changelog/publish 是纯操作型任务。

### 4. 版本号推导规则：三个命令共享相同逻辑描述

**选择**：SemVer 推导规则（基于 Conventional Commits 前缀）在三处分别内联书写（不提取共享模块），但内容保持一致。

**理由**：每个命令模版是独立可读的完整指令——Claude 读取单个命令时应获得完整上下文，不依赖"先读另一个命令模版"。共享模块化在 ly-workflow 的模板系统中没有先例（每个命令模板彼此独立），引入共享引用会增加安装器的复杂度（需要跨文件变量注入），收益有限。

### 5. 命令分类：`release` 而非 `git` 或 `opsx`

**选择**：使用新 category `release`，order 从 40 开始（接在 review 分类之后）。

**理由**：这三个命令虽然部分涉及 git 操作，但本质是"发布管线"操作——它们的流程远超 git 分支管理（还涉及版本号、changelog、npm registry）。放在独立的 `release` 分类下语义更清晰。

## Risks / Trade-offs

- **三个命令内容较长**（合计约 500+ 行 markdown）→ 安装体积略增，但 `.md` 文本可高比例压缩，实际增量极小
- **命令执行依赖环境**（如 `/ly:publish` 依赖 npm token、`/ly:release` 假设项目有 `version.sh`）→ 属于个人预设命令的固有特性，命令正文已注明前提条件
- **版本号推导仅建议非强制**→ SemVer 自动分析可能因 commit message 不规范而误判（如 `fix:` 实际是重构），但用户始终可以覆盖，不会产生错误版本号