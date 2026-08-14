# templates (ly-workflow 模板库)

> [根目录](../CLAUDE.md) > **templates**

**Last Updated**: 2026-08-08

---

## 目录总览

| 目录 | 用途 | 安装目标 |
|------|------|----------|
| `commands/` | 11 个 slash command | `~/.claude/commands/ly/` |
| `commands/agents/` | 目前为空（旧 agent 已随多模型引擎删除） | — |
| `prompts/codex/` `prompts/claude/` | 审查/角色提示词（只留 codex+claude） | `~/.claude/.ly/prompts/` |
| `skills/` | 质量关卡 + 域知识 + impeccable 工具（逻辑不变，命名空间随改名调整） | `~/.claude/skills/ly/` |
| `rules/` | `ly-skills.md`/`ly-skill-routing.md`/`ly-codegraph.md` | `~/.claude/rules/` |
| `output-styles/` | 8 种输出风格 | `~/.claude/output-styles/` |

## commands/（11 个）

| 命令 | 类型 | 说明 |
|------|------|------|
| `init.md` | 真逻辑 | 生成 CLAUDE.md + `openspec init` + 自动 commit |
| `explore.md` | 薄壳委托 | 直接调用 `opsx:explore`，收敛到方案时提示转 `/ly:propose` |
| `propose.md` | 真逻辑 | 委托 `opsx:propose` + 全自动/手动两条路径编排（commit → 各自的审查循环 + worktree 询问） |
| `apply.md` | 真逻辑 | 执行前隔离检测（固定路径+分支双重匹配）+ 委托 `opsx:apply` 实施 tasks + 自动 commit |
| `archive.md` | 真逻辑 | 委托 `opsx:archive` 归档 + 自动 commit |
| `review-plan.md` | 真逻辑 | Codex 审方案（独立角色提示词 `plan-reviewer.md`，不与 `review-code.md` 共用 `reviewer.md`；读取 proposal/design/tasks/specs），审查-修复循环（全局轮数上限 5 轮，清零优先；新增第 9 类"审查对象类型持续系统性误判"），默认每轮自动 commit（`--no-commit` 关闭） |
| `review-code.md` | 真逻辑 | Codex 审代码，Critical/Warning/Info 分级，审查-修复循环（全局轮数上限 5 轮，清零优先；新增第 9 类"审查对象类型持续系统性误判"，与 `review-plan.md` 共用），默认每轮自动 commit（`--no-commit` 关闭） |
| `commit.md` `rollback.md` `clean-branches.md` | Git 工具 | 不变 |
| `worktree.md` | Git 工具 | 默认用户目录 `~/.ly/worktrees/项目名/`；新增隔离检测、`--local` 项目内选项（强制 gitignore 校验）、创建后 baseline 验证；`switch` 定位已注册路径时新增分支校验（不匹配则拒绝，不直接定位） |

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
| `{{REVIEWER_MODEL}}` | 审查模型（codex/claude/hermes/openclaw），默认 codex |
| `{{LITE_MODE_FLAG}}` | 轻量模式标志 |
| `{{MCP_SEARCH_TOOL}}` / `{{MCP_SEARCH_PARAM}}` | MCP provider 注册表驱动（当前 12 个命令均未使用，代码保留但暂无消费者） |

`{{FRONTEND_PRIMARY}}` `{{BACKEND_PRIMARY}}` `{{GEMINI_MODEL_FLAG}}` `{{GROK_MODEL_FLAG}}` 等旧占位符已随多模型层一并移除。
