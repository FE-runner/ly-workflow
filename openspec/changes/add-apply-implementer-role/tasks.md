## 1. 模板变量与安装器

- [ ] 1.1 `src/utils/installer-template.ts`：在 `injectConfigVariables()` 中新增 `{{IMPLEMENTER_MODEL}}` 占位符处理，逻辑同 `{{REVIEWER_MODEL}}`（`routing.implementer || 'hermes'` → 正则替换）
- [ ] 1.2 确认 `installer.ts` 里"prompts 目录按 backend 兜底复制"的逻辑（`srcModelDir` 不存在时回退 `promptsTemplateDir/codex`）覆盖 `hermes`/`openclaw`/`codex` 三个 backend，`builder.md` 能正确装到对应的 `~/.claude/.ly/prompts/<backend>/` 目录下

## 2. init 交互式向导

- [ ] 2.1 `src/commands/init.ts`：`routing.reviewer` 选项列表移除 `claude`（含 `--reviewer` CLI 参数校验、summary 展示逻辑），保留 `codex`（默认/推荐）/`hermes`/`openclaw` 三选一
- [ ] 2.2 `src/commands/init.ts`：新增 `routing.implementer` 交互式选择步骤，紧跟"选择审查模型"之后，提供 `codex`/`hermes`（默认）/`openclaw` 三选一，选择结果持久化到配置
- [ ] 2.3 `src/commands/init.ts`：用户完成"选择实施后端"步骤后，若 `routing.implementer` 与 `routing.reviewer` 取值相同，展示独立性下降的提示（不阻断）
- [ ] 2.4 `src/commands/init.ts`：existingConfig 中若 `routing.reviewer` 历史值为 `claude`，交互式向导不将其作为预选默认值（不展示在候选列表里），要求用户重新选择
- [ ] 2.5 summary 输出（`console.log` 汇总区块）新增展示 `routing.implementer` 的选定值，格式对齐现有 `reviewerModel` 那一行

## 3. update 非交互静默迁移

- [ ] 3.1 确认 `npx ly-workflow update` 走的 `init --force --skip-mcp --skip-prompt` 路径下，`routing.implementer` 缺失时静默写入默认值 `hermes`，不触发交互提示、不中断流程
- [ ] 3.2 该非交互路径下，`routing.reviewer` 历史值为 `claude` 时静默重置为默认值 `codex`，并在升级汇总输出中提示"检测到已移除的 claude 选项，已重置为默认值"

## 4. `/ly:apply` 委托逻辑

- [ ] 4.1 `templates/commands/apply.md`：步骤 2"实施"由固定 `Skill({ skill: "opsx:apply", args })` 改为读取 `routing.implementer` 后，通过 `Bash` 调用 `~/.claude/bin/codeagent-wrapper --backend {{IMPLEMENTER_MODEL}}`，`ROLE_FILE: ~/.claude/.ly/prompts/{{IMPLEMENTER_MODEL}}/builder.md`，`run_in_background: true`，TASK 内容为"阅读 tasks.md，自主实施全部未完成任务"（参照 `review-code.md` 步骤 2 的调用模式与超时设置）
- [ ] 4.2 `templates/commands/apply.md`：新增"读取 Execution Report"步骤——解析末尾 `OVERALL: PASS/FAIL`；`PASS` 进入现有步骤 3（暂存+commit），`FAIL` 或 wrapper 调用超时/非零退出/空响应时原样呈报失败详情并停止，不重试、不切回 Claude 自行实施、不执行任何提交
- [ ] 4.3 `templates/commands/apply.md`：新增"实施后端二进制缺失"处理——若 wrapper 报告对应 CLI 不存在，如实报告"实施后端 <backend> 二进制缺失"并结束，不静默切换其他后端
- [ ] 4.4 `templates/commands/apply.md`：description frontmatter 与正文说明同步更新，反映"委托 Implementer agent 实施"这一变化（不再是"Claude 自己实施"）

## 5. 文档同步

- [ ] 5.1 `templates/CLAUDE.md`：`commands/` 表格中 `apply.md` 一行的说明更新为"委托 `routing.implementer` 对应的外部 agent 实施 tasks（单次 agentic 调用），PASS 后立即 commit（`apply: <change-name>`），FAIL 原样呈报转人工"
- [ ] 5.2 根目录 `CLAUDE.md`：对外接口表格中 `/ly:apply` 一行的说明同步更新；"关键设计决策"章节视需要补充"实施委托给外部 agent，Claude 只做判定/commit"这一条

## 6. 验证

- [ ] 6.1 `pnpm typecheck && pnpm build`：确保 `installer-template.ts`、`init.ts`、`update.ts` 改动类型检查通过
- [ ] 6.2 手动验证：在一个测试项目里跑交互式 `npx ly-workflow init`，确认"选择审查模型"无 `claude` 选项、新增"选择实施后端"步骤且默认 `hermes`、两者选同一 backend 时出现独立性提示
- [ ] 6.3 手动验证：在一个已有 `routing.reviewer: claude` 的旧配置项目上跑 `npx ly-workflow update`（非交互），确认静默重置为 `codex` 且汇总里有提示，且 `routing.implementer` 被静默写入 `hermes`
- [ ] 6.4 手动验证：跑 `/ly:apply` 观察实际生成的 wrapper 调用命令行（`--backend <routing.implementer>` 是否正确注入、`ROLE_FILE` 路径是否解析到装好的 `builder.md`）
