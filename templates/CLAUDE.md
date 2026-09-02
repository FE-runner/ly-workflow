# templates (ly-workflow 模板库)

> [根目录](../CLAUDE.md) > **templates**

**Last Updated**: 2026-08-08

---

## 目录总览

| 目录 | 用途 | 安装目标 |
|------|------|----------|
| `commands/` | 14 个 slash command | `~/.claude/commands/ly/` |
| `commands/agents/` | 目前为空（旧 agent 已随多模型引擎删除） | — |
| `prompts/codex/` `prompts/claude/` | 审查/角色提示词（只留 codex+claude） | `~/.claude/.ly/prompts/` |
| `skills/` | 质量关卡 + 域知识 + impeccable 工具（逻辑不变，命名空间随改名调整） | `~/.claude/skills/ly/` |
| `rules/` | `ly-skills.md`/`ly-skill-routing.md`/`ly-codegraph.md` | `~/.claude/rules/` |
| `output-styles/` | 8 种输出风格 | `~/.claude/output-styles/` |

## commands/（14 个）

| 命令 | 类型 | 说明 |
|------|------|------|
| `init.md` | 真逻辑 | 生成 CLAUDE.md + `openspec init` + 自动 commit |
| `explore.md` | 薄壳委托 | 直接调用 `opsx:explore`，收敛到方案时提示转 `/ly:propose` |
| `propose.md` | 真逻辑 | 委托 `opsx:propose` + 创建方案前 worktree 询问（从当前分支切出，不在 worktree 内才问，全局一次）+ 全自动/手动两路径（全自动 = review-plan → apply → review-code 自动化流水线；手动 = 逐步确认）；产物每步 commit（`propose: <change-name>`） |
| `apply.md` | 真逻辑 | 读取 `routing.implementer`（`claude`/`codex`/`hermes`/`openclaw`，默认 `claude`）：`claude` = 当前会话 Claude 本人读 tasks.md 逐任务实施+验证+勾 checkbox，无 wrapper 调用；外部后端 = 委托 `codeagent-wrapper` + `builder.md` 单次 agentic 调用实施 tasks，`OVERALL: PASS` 后立即 commit（`apply: <change-name>`），`OVERALL: FAIL`/调用失败原样呈报转人工（不重试不兜底）；不再隔离检测/不再暂存区持有 |
| `archive.md` | 真逻辑 | 委托 `opsx:archive` 归档 + 自动 commit |
| `review-plan.md` | 真逻辑 | Codex 审方案（独立角色提示词 `plan-reviewer.md`，不与 `review-code.md` 共用 `reviewer.md`；审查对象为目标 change 的 `propose:` commit），审查-修复循环（全局轮数上限 5 轮，清零优先；新增第 9 类"审查对象类型持续系统性误判"），循环期间不提交、清零后对审查目标全部文件统一提交（`--no-commit` 关闭） |
| `review-code.md` | 真逻辑 | Codex 审代码，Critical/Warning/Info 分级，审查对象为最近 `apply:` commit（`git log --grep="^apply:"` 定位），审查-修复循环（全局轮数上限 5 轮，清零优先；新增第 9 类"审查对象类型持续系统性误判"，与 `review-plan.md` 共用），循环期间不提交、清零后对审查范围全部文件统一提交（`--no-commit` 关闭） |
| `commit.md` `rollback.md` `clean-branches.md` | Git 工具 | 不变 |
| `worktree.md` | Git 工具 | 默认用户目录 `~/.ly/worktrees/项目名/`（单层平铺，worktree 名 = 开发分支名）；`--local` 项目内选项（强制 gitignore 校验）、创建后 baseline 验证；`switch` 子命令已移除——隔离切换统一由 `/ly:propose` 在创建方案前用 `git worktree add` 从当前分支 HEAD 触发 |
| `release.md` | 真逻辑 | GitFlow 四场景（feature/release/hotfix/dev-offline），SemVer + Conventional Commits 自动推导版本号，用户确认后执行；发版后三分支同步（master/develop/dev-offline），凡合入 master 必须 bump `version.sh` |
| `changelog.md` | 真逻辑 | Keep a Changelog 格式生成/更新 CHANGELOG.md，按 commit 前缀分组（feat→Added、fix→Fixed、其余→Changed），无对应提交的分组省略；顶部插入、同版本号已存在时警告询问 |
| `publish.md` | 真逻辑 | npm 发布四场景（bmc 私域 Nexus/GitHub Packages/npmjs+GitHub Release/CI 自动发布）；前置检查→版本号自动推导→构建→发布→验证；构建失败中止、409 冲突提示改版本号、CI 场景只 push tag 不本地 publish |

## 已删除（v1.0.0 改造）

- `templates/engine/`（model-router + 9 个 strategy 文件）
- `templates/commands-legacy/`（18 个旧版多模型命令）
- `templates/prompts/{gemini,grok,antigravity}/`
- agents：`planner.md` `ui-ux-designer.md` `team-*.md` `init-architect.md` `get-current-datetime.md`

## 已删除（后续）

- `commands/context.md`（`.context/` 决策审计链，小项目场景价值有限、无人维护，移除）及 `commit.md` 中对应的 Context 自动归档阶段；`prompts/codex/*.md` 中的 `.context Awareness` 段一并清理

## 模板变量系统

`injectConfigVariables()` 现只处理：

| 占位符 | 说明 |
|--------|------|
| `{{REVIEWER_MODEL}}` | 审查模型（codex/hermes/openclaw，不含 claude），默认 codex |
| `{{IMPLEMENTER_MODEL}}` | 实施模型（claude/codex/hermes/openclaw，含 claude），默认 claude；`apply.md` 使用，claude 时连同 `LY:IF:IMPLEMENTER_*` 条件块一起渲染"本人实施"路径 |
| `{{LITE_MODE_FLAG}}` | 轻量模式标志 |
| `{{MCP_SEARCH_TOOL}}` / `{{MCP_SEARCH_PARAM}}` | MCP provider 注册表驱动（当前 14 个命令均未使用，代码保留但暂无消费者） |

`{{FRONTEND_PRIMARY}}` `{{BACKEND_PRIMARY}}` `{{GEMINI_MODEL_FLAG}}` `{{GROK_MODEL_FLAG}}` 等旧占位符已随多模型层一并移除。
