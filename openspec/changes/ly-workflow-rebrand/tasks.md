## 1. Go wrapper 瘦身（codeagent-wrapper）

- [ ] 1.1 删除 `backend.go` 中 `GeminiBackend`/`GrokBackend`/`AntigravityBackend` 三个 struct 及各自 `BuildArgs`/`Command` 方法
- [ ] 1.2 删除 `config.go` 中 `GeminiModel`/`GrokModel` 等相关字段，及 backend 注册表里对应条目
- [ ] 1.3 清理 `main.go` 中帮助文本/flag 说明里对 gemini/grok/antigravity 的引用
- [ ] 1.4 清理 `executor.go` 中 gemini 专属分支（如 Windows stdin pipe 特殊处理）与 grok 专属分支
- [ ] 1.5 清理 `parser.go`/`filter.go`/`server.go` 中对应的 gemini/grok/antigravity 条件逻辑
- [ ] 1.6 更新 `backend_test.go`：删除三个 backend 的测试用例，保留 codex/claude 的
- [ ] 1.7 更新 `main_test.go`/`logger_test.go` 中涉及 gemini/grok/antigravity 的测试用例
- [ ] 1.8 全局搜索确认 `Gemini|Grok|Antigravity`（大小写不敏感）在 `codeagent-wrapper/` 下零残留
- [ ] 1.9 `go build ./...` 和 `go test ./...` 全绿
- [ ] 1.10 bump 版本号：`codeagent-wrapper/main.go` 的 `version` 常量 + `src/utils/installer.ts` 的 `EXPECTED_BINARY_VERSION`，两处保持一致

## 2. 删除多模型引擎与旧命令（templates/）

- [ ] 2.1 删除 `templates/engine/` 整个目录（model-router.md、phase-guide.md、9 个 strategy 文件）
- [ ] 2.2 删除命令：`spec-init.md` `spec-research.md` `spec-plan.md` `spec-impl.md` `spec-review.md` `go.md`
- [ ] 2.3 删除 agents：`planner.md` `ui-ux-designer.md` `team-architect.md` `team-qa.md` `team-reviewer.md` `init-architect.md` `get-current-datetime.md`
- [ ] 2.4 删除 `templates/prompts/gemini/` `templates/prompts/grok/` `templates/prompts/antigravity/` 三个整目录
- [ ] 2.5 确认 `templates/prompts/claude/` `templates/prompts/codex/` 未被误删，保留完整

## 3. 新增 /ly:* 命令（templates/commands/）

- [ ] 3.1 新建 `init.md`：调用原生 `init` 技能生成 CLAUDE.md，再 bash 检测/安装 `openspec` CLI 并执行 `openspec init`
- [ ] 3.2 新建 `explore.md`：委托 `opsx:explore`，转发 `$ARGUMENTS`
- [ ] 3.3 新建 `propose.md`：委托 `opsx:propose`，转发 `$ARGUMENTS`
- [ ] 3.4 新建 `apply.md`：委托 `opsx:apply`，转发 `$ARGUMENTS`
- [ ] 3.5 新建 `archive.md`：委托 `opsx:archive`，转发 `$ARGUMENTS`
- [ ] 3.6 新建 `review-plan.md`：按优先级解析目标 change（显式参数 > 唯一存在的change > 多个候选时询问用户），读取 proposal/design/tasks（缺失的容错跳过），调用 `codeagent-wrapper --backend codex` + `codex/reviewer.md` 角色（路径 `~/.claude/.ly/prompts/codex/reviewer.md`），输出方案级发现
- [ ] 3.7 新建 `review-code.md`：判定 diff 范围（`git diff HEAD` 优先；无未提交变更且有历史提交则 `git diff HEAD~1`；仅单个commit无`HEAD~1`时改用 `git show HEAD`），调用 `codeagent-wrapper --backend codex` + `codex/reviewer.md` 角色（路径同上），输出 Critical/Warning/Info 分级结果，无发现时明确说明

## 4. 类型与配置简化（src/）

- [ ] 4.1 `src/types/index.ts`：`ModelType` 收窄为 `'codex' | 'claude'`
- [ ] 4.2 `src/types/index.ts`：`ModelRouting` 删除 `frontend` 字段，简化 `backend`/`review` 语义
- [ ] 4.3 `src/commands/init.ts`：安装向导删除模型路由选择步骤（Step 2/4 相关交互）
- [ ] 4.4 `src/utils/installer-template.ts`：删除或简化 `{{FRONTEND_PRIMARY}}` `{{FRONTEND_MODELS}}` `{{GEMINI_MODEL_FLAG}}` `{{GROK_MODEL_FLAG}}` 等占位符及其替换逻辑
- [ ] 4.5 `src/utils/config.ts:77` `createDefaultRouting()`：删除 `frontend` 分支，`geminiModel`/`grokModel` 字段一并移除
- [ ] 4.6 `src/commands/update.ts`：删除或大幅简化 `askReconfigureRouting()`（`update.ts:93` 起）——不再提供 Antigravity/Gemini/Grok 多选框，`update.ts:100/124-169` 相关 frontend/backend 交互整段移除；`geminiModel`/`grokModel` 读写一并删除
- [ ] 4.7 `src/commands/menu.ts`：删除"配置模型路由"菜单项（`menu.ts:169` 选项 6）及 `configModelRouting()` 函数（`menu.ts:447` 起，含 `geminiModel`/`grokModel` 选择逻辑），菜单其余选项序号相应前移
- [ ] 4.8 `src/i18n/` 下清理 `menu:options.configModel` 等仅服务于模型路由配置的文案 key（中英文两份）
- [ ] 4.9 `src/utils/installer-data.ts`（命令注册表）：移除已删命令条目，新增 7 个 `/ly:*` 命令条目
- [ ] 4.10 更新 `src/utils/__tests__/` 下相关测试（`injectConfigVariables.test.ts`、`installer.test.ts` 等）以匹配新占位符集合与命令列表；补充/更新 `config.test.ts`、`update.ts` 相关测试以反映路由简化
- [ ] 4.11 `pnpm typecheck` 通过

## 5. 项目改名（ccg-workflow → ly-workflow）

- [ ] 5.1 `package.json`：`name` 改为 `ly-workflow`，`bin` 命令入口改为 `ly`
- [ ] 5.2 `src/cli.ts`/`src/cli-setup.ts`：CLI 实例名与命令前缀 `ccg` → `ly`
- [ ] 5.3 全局搜索替换安装路径引用：`~/.claude/.ccg/` → `~/.claude/.ly/`，`commands/ccg/` → `commands/ly/`，`agents/ccg/` → `agents/ly/`，`skills/ccg/` → `skills/ly/`（涉及 `installer.ts`/`installer-template.ts`/`installer-mcp.ts` 等）
- [ ] 5.4 `bin/ccg.mjs` 重命名/替换为新入口脚本，`package.json` bin 字段同步

## 6. 文档重写

- [ ] 6.1 确认 `LICENSE` 文件未被改动（保留原作者版权声明）
- [ ] 6.2 确认 git 历史未被 rebase/squash（本次改动全部以新 commit 形式追加）
- [ ] 6.3 重写根 `CLAUDE.md`：反映新架构（两角色工作流 + OpenSpec 集成）、新命令列表、新项目名
- [ ] 6.4 重写 `src/CLAUDE.md`、`templates/CLAUDE.md`、`codeagent-wrapper/CLAUDE.md`（后者更新 Backend 表格、去除 gemini/grok/antigravity 相关章节）
- [ ] 6.5 重写 `README.md`：新项目名、新命令表、底部保留一行 "Based on ccg-workflow" credit
- [ ] 6.6 新起 `CHANGELOG.md`：首条注明 "Forked from ccg-workflow"，记录本次改动为首个版本条目
- [ ] 6.7 视需要重写/简化 `CONTRIBUTING.md`（若协作流程有变化）；`SECURITY.md`/`CODE_OF_CONDUCT.md`/issue 模板按实际情况保留或简化
- [ ] 6.8 全局搜索确认改名后残留：`grep -ril "ccg-workflow\|ccg_workflow\|/ccg:\|\.ccg/" --exclude-dir={.git,node_modules,dist}` 结果应仅剩 LICENSE、CHANGELOG.md 的 "Forked from" 注明行、CLAUDE.md 里对旧架构的历史说明（如有意保留）

## 7. 收尾验证

- [ ] 7.1 本地重装一次：`npx ./` 或等效方式验证 7 个 `/ly:*` 命令安装到 `~/.claude/commands/ly/`
- [ ] 7.2 手动跑一遍完整生命周期：`/ly:init` → `/ly:propose` → `/ly:review-plan` → `/ly:apply` → `/ly:review-code` → `/ly:archive`
- [ ] 7.3 确认旧 `/ccg:*` 命令已从安装目录清除（不残留死文件）
- [ ] 7.4 `pnpm build` + `pnpm test` 全绿
