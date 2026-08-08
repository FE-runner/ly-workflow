# ly-workflow

> Fork 自 [ccg-workflow](https://github.com/fengshao1227/ccg-workflow)（Claude + Codex + Gemini 多模型协作系统），重构为两角色精简工作流。

**Last Updated**: 2026-08-07 (v1.1.0)

---

## 变更记录 (Changelog)

> 完整变更历史请查看 [CHANGELOG.md](./CHANGELOG.md)

### 2026-08-08 — Change 生命周期自动化：审查-修复循环 + worktree switch + propose 总开关
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

1. **7 个 `/ly:*` 命令**：项目初始化 + OpenSpec 生命周期委托 + 双审查关卡
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

### Slash Commands（7 个）

| 命令 | 用途 |
|------|------|
| `/ly:init` | 生成 CLAUDE.md（原生 `init` 技能）+ `openspec init` |
| `/ly:explore` | 委托 `opsx:explore` |
| `/ly:propose` | 问总开关 → 委托 `opsx:propose` → commit → （开关开启时）审查循环 → 询问隔离 worktree |
| `/ly:apply` | 委托 `opsx:apply` + 追加通用 worktree 提示 |
| `/ly:archive` | 委托 `opsx:archive` |
| `/ly:review-plan` | 读取目标 change 的 proposal/design/tasks，Codex 分级审查，审查-修复循环直到清零或触发终止条件 |
| `/ly:review-code` | 读取 git diff，Codex 分级审查，审查-修复循环直到清零或触发终止条件 |

不变的 Git 工具：`/ly:commit` `/ly:rollback` `/ly:clean-branches`；`/ly:worktree` 新增 `switch <change-name> [--auto]` 子命令。

### 典型工作流

```
/ly:init → /ly:propose "需求描述" → /ly:review-plan → /ly:apply → /ly:review-code → /ly:archive
```

---

## 关键设计决策

1. **`propose` 是编排入口，`apply`/`archive`/`explore` 仍是薄壳，但不受任何"必须是薄壳"的原则约束**：`propose.md` 已经包含总开关询问、commit、审查循环调用、worktree 询问等编排逻辑；`apply.md`/`archive.md`/`explore.md` 目前只做参数转发+（apply）一句通用提示，是基于当前范围的独立判断，不是被某条项目原则强制的"薄壳"——原有的"委托而非重新封装"原则已废止（2026-08-08），后续任一命令要不要加编排逻辑，按需判断即可，不需要先论证是否例外。
2. **审查走 codeagent-wrapper 而非直连 Codex API**：复用已有的 session 管理、进度回调、超时重试。
3. **Go wrapper 只删 Backend 层**：`Backend` interface 保持不变，删除具体实现（Gemini/Grok/Antigravity）不影响执行引擎（并发调度/日志/SSE）。
4. **LICENSE + git 历史不动**：文档整体重写，但版权声明和提交历史保留可追溯性。

---

## 相关文件

```
src/                      # TypeScript CLI 源码
templates/commands/       # 7 个 slash command
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
4. Go 代码改动需同步 bump `codeagent-wrapper/main.go` 的 `version` 与 `src/utils/installer.ts` 的 `EXPECTED_BINARY_VERSION`
5. `pnpm typecheck && pnpm build && pnpm test` 全绿后 `npm publish`
