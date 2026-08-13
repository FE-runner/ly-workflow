# ly-workflow

> Fork 自 [ccg-workflow](https://github.com/fengshao1227/ccg-workflow)（Claude + Codex + Gemini 多模型协作系统），重构为两角色精简工作流。

**Last Updated**: 2026-08-13 (v1.4.3)

---

## 变更记录 (Changelog)

> 完整变更历史请查看 [CHANGELOG.md](./CHANGELOG.md)

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
| `/ly:init` | 生成 CLAUDE.md（原生 `init` 技能）+ `openspec init` + 自动 commit |
| `/ly:explore` | 委托 `opsx:explore` |
| `/ly:propose` | 问"全自动/手动" → 委托 `opsx:propose` → commit → 两条路径各自的审查循环 + worktree 询问编排 |
| `/ly:apply` | 执行前隔离检测（固定路径+分支双重匹配，不匹配问 worktree）→ 委托 `opsx:apply` + 自动 commit + 追加通用 worktree 提示 |
| `/ly:archive` | 委托 `opsx:archive` + 自动 commit |
| `/ly:review-plan` | 读取目标 change 的 proposal/design/tasks，Codex 分级审查，审查-修复循环直到清零或触发终止条件（全局轮数上限 5 轮，清零优先），默认每轮自动 commit（`--no-commit` 关闭） |
| `/ly:review-code` | 读取 git diff，Codex 分级审查，审查-修复循环直到清零或触发终止条件（全局轮数上限 5 轮，清零优先），默认每轮自动 commit（`--no-commit` 关闭） |

不变的 Git 工具：`/ly:commit` `/ly:rollback` `/ly:clean-branches`；`/ly:worktree` 的 `switch <change-name> [--auto]` 子命令新增分支校验（定位已注册路径时确认注册分支严格等于 `<change-name>`）。

### 典型工作流

```
/ly:init → /ly:propose "需求描述" → /ly:review-plan → /ly:apply → /ly:review-code → /ly:archive
```

---

## 关键设计决策

1. **`propose` 是编排入口，`init`/`apply`/`archive` 现在也各自带一段自动 commit 逻辑，`explore` 仍是纯薄壳**：`propose.md` 包含总开关询问、commit、审查循环调用、worktree 询问等编排逻辑；`init.md`/`apply.md`/`archive.md` 在委托对应 opsx 技能之后补了一段"提交本次产生的文件变动"，`explore.md` 只做参数转发+一句转向提示。是否要加编排逻辑按需判断即可，不受任何"必须是薄壳"的原则约束——原有的"委托而非重新封装"原则已废止（2026-08-08）。
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
5. `pnpm typecheck && pnpm build && pnpm test` 全绿后 commit
6. **发布方式：GitHub Actions 自动发布**，不在本地跑 `npm publish`——打 tag `v<版本号>`（如 `v1.2.0`）并 push，`.github/workflows/release.yml` 监听 `push: tags: ['v*.*.*']` 自动触发发布
