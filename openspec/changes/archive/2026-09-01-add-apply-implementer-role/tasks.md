## 1. 模板变量与安装器

- [x] 1.1 `src/utils/installer-template.ts`：在 `injectConfigVariables()` 中新增 `{{IMPLEMENTER_MODEL}}` 占位符处理，逻辑同 `{{REVIEWER_MODEL}}`（`routing.implementer || 'hermes'` → 正则替换）
- [x] 1.2 确认 `installer.ts` 里"prompts 目录按 backend 兜底复制"的逻辑（`srcModelDir` 不存在时回退 `promptsTemplateDir/codex`）覆盖 `hermes`/`openclaw`/`codex` 三个 backend，`builder.md` 能正确装到对应的 `~/.claude/.ly/prompts/<backend>/` 目录下（沙箱验证：hermes/openclaw 安装的角色提示词列表均含 builder；claude 目录有自己的 6 个文件、不含 builder，但 claude 已不再是合法可选值，不影响本次改动）

## 2. init 交互式向导

- [x] 2.1 `src/commands/init.ts`：`routing.reviewer` 选项列表移除 `claude`（含 `--reviewer` CLI 参数校验、summary 展示逻辑），保留 `codex`（默认/推荐）/`hermes`/`openclaw` 三选一
- [x] 2.2 `src/commands/init.ts`：新增 `routing.implementer` 交互式选择步骤，紧跟"选择审查模型"之后，提供 `codex`/`hermes`（默认）/`openclaw` 三选一，选择结果持久化到配置
- [x] 2.3 `src/commands/init.ts`：用户完成"选择实施后端"步骤后，若 `routing.implementer` 与 `routing.reviewer` 取值相同，展示独立性下降的提示（不阻断）
- [x] 2.4 `src/commands/init.ts`：existingConfig 中若 `routing.reviewer` 历史值为 `claude`，交互式向导不将其作为预选默认值（不展示在候选列表里），要求用户重新选择
- [x] 2.5 summary 输出（`console.log` 汇总区块）新增展示 `routing.implementer` 的选定值，格式对齐现有 `reviewerModel` 那一行

## 3. update 非交互静默迁移

- [x] 3.1 确认 `npx ly-workflow update` 走的 `init --force --skip-mcp --skip-prompt` 路径下，`routing.implementer` 缺失时静默写入默认值 `hermes`，不触发交互提示、不中断流程
- [x] 3.2 该非交互路径下，`routing.reviewer` 历史值为 `claude` 时静默重置为默认值 `codex`，并在升级汇总输出中提示"检测到已移除的 claude 选项，已重置为默认值"

## 4. `/ly:apply` 委托逻辑

- [x] 4.1 `templates/commands/apply.md`：步骤"实施"由固定 `Skill({ skill: "opsx:apply", args })` 改为读取 `routing.implementer` 后，通过 `Bash` 调用 `~/.claude/bin/codeagent-wrapper --backend {{IMPLEMENTER_MODEL}}`，`ROLE_FILE: ~/.claude/.ly/prompts/{{IMPLEMENTER_MODEL}}/builder.md`，`run_in_background: true`，TASK 内容为"阅读 tasks.md，自主实施全部未完成任务"（参照 `review-code.md` 步骤 2 的调用模式与超时设置）
- [x] 4.2 `templates/commands/apply.md`：新增"读取 Execution Report"步骤——解析末尾 `OVERALL: PASS/FAIL`；`PASS` 进入现有步骤（暂存+commit），`FAIL`、wrapper 调用超时/非零退出/空响应、或无法解析出 `OVERALL` 标记时原样呈报失败详情并停止，不重试、不切回 Claude 自行实施、不执行任何提交（额外覆盖了 review-plan 首轮发现的"无法解析 OVERALL"边界情况）
- [x] 4.3 `templates/commands/apply.md`：新增"实施后端二进制缺失"处理，以及"`routing.implementer` 配置值非法（不在 codex/hermes/openclaw 内）"的显式拒绝（额外覆盖了 review-plan 首轮发现的边界情况），均如实报错并结束，不静默回退
- [x] 4.4 `templates/commands/apply.md`：description frontmatter 与正文说明同步更新，反映"委托 Implementer agent 实施"这一变化（不再是"Claude 自己实施"）

## 5. 文档同步

- [x] 5.1 `templates/CLAUDE.md`：`commands/` 表格中 `apply.md` 一行的说明、模板变量表格新增 `{{IMPLEMENTER_MODEL}}`
- [x] 5.2 根目录 `CLAUDE.md`：对外接口表格中 `/ly:apply` 一行的说明同步更新；"关键设计决策"章节补充第 5 条"实施委托给外部 agent，Claude 只做判定/commit"

## 6. 验证

- [x] 6.1 `pnpm typecheck && pnpm build && pnpm test`：全部通过（78 passed | 13 skipped），并为 `injectConfigVariables`/`createDefaultRouting` 补充了 implementer 相关用例
- [ ] 6.2 手动验证（需要真人交互，本次会话未自动化执行；inquirer 的 list 选择无法在无 TTY 环境下模拟）：在一个测试项目里跑交互式 `npx ly-workflow init`，确认"选择审查模型"无 `claude` 选项、新增"选择实施后端"步骤且默认 `hermes`、两者选同一 backend 时出现独立性提示——已通过阅读 `runModelStep` 源码确认选项列表与默认值逻辑正确，但未获得真人交互的端到端确认
- [x] 6.3 沙箱验证（`HOME` 指向临时目录，构造 `routing.reviewer=claude`、无 `routing.implementer` 的旧配置，跑 `node dist/cli.mjs init --force --skip-mcp --skip-prompt`）：确认静默重置为 `codex`、`routing.implementer` 静默写入 `hermes`，且输出"⚠ 检测到已移除的 claude 选项，已重置为默认值"提示
- [x] 6.4 用 `injectConfigVariables` 直接验证 `apply.md` 模板注入结果：`{{IMPLEMENTER_MODEL}}` 正确替换 `--backend` 与 `ROLE_FILE` 路径；未配置 `routing.implementer` 时默认注入 `hermes`
