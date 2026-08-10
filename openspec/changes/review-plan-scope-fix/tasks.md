## 1. 新增 plan-reviewer 角色提示词

- [ ] 1.1 新建 `templates/prompts/codex/plan-reviewer.md`：方案审查专用人设，明确禁止把"代码库尚未实现该方案条目""tasks.md 任务未勾选"作为 Critical 依据；checklist 聚焦遗漏边界、范围不清晰、proposal/design/tasks/spec 互相矛盾或脱节、风险点交代不清、spec 的 Requirement/Scenario 未覆盖 proposal 的 What Changes
- [ ] 1.2 `templates/commands/review-plan.md` 步骤 3（调用 Codex 审查）的 `ROLE_FILE` 从 `~/.claude/.ly/prompts/codex/reviewer.md` 改为 `~/.claude/.ly/prompts/codex/plan-reviewer.md`

## 2. 新增"审查对象类型持续系统性误判"终止条件

- [ ] 2.1 `templates/commands/review-plan.md` 循环终止条件列表新增第 7 类，措辞与 `openspec/specs/ly-review-gates/spec.md` 的 MODIFIED Requirement 保持一致
- [ ] 2.2 `templates/commands/review-code.md` 循环终止条件列表同步新增第 7 类（两命令共用同一套规则）
- [ ] 2.3 两个命令文件的"触发条件 2-8"这类范围描述文字同步改为"触发条件 2-7"（原表述里的编号需要跟随新增条件调整；若与 `worktree-review-flow-refinement` change 里"20→5 轮"相关的编号改动有冲突，以本 change 落地时两个文件的实际内容为准逐一核对，不假设对方已完成）

## 3. 文档同步

- [ ] 3.1 检查 `templates/CLAUDE.md` 里 `review-plan.md` 的一句话说明是否需要提及"独立角色提示词"这一点
- [ ] 3.2 更新根 `CLAUDE.md` 变更记录，新增本次条目

## 4. 验证

- [ ] 4.1 `openspec validate --changes review-plan-scope-fix --strict` 通过
- [ ] 4.2 走查：`/ly:review-plan` 场景下，若审查到未勾选的 `tasks.md` 任务，`plan-reviewer.md` 的约束是否能让 Codex 不再据此报 Critical（人工核对角色提示词文字表述是否清晰、无歧义）
- [ ] 4.3 走查：连续 3 轮 Critical 均被 Claude 判定为同一类系统性误判时，命令是否正确停止并输出包含 3 轮原始发现与反驳理由的报告
- [ ] 4.4 走查：系统性误判不连续（中间夹一轮真实问题）时，不误触发第 7 类终止条件
- [ ] 4.5 确认 `review-code.md` 未被误改角色提示词引用（仍指向 `reviewer.md`）
