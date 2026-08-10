## 1. 新增 plan-reviewer 角色提示词

- [ ] 1.1 新建 `templates/prompts/codex/plan-reviewer.md`：方案审查专用人设，明确禁止把"代码库尚未实现该方案条目""tasks.md 任务未勾选"作为 Critical 依据；checklist 聚焦遗漏边界、范围不清晰、proposal/design/tasks/spec 互相矛盾或脱节、风险点交代不清、spec 的 Requirement/Scenario 未覆盖 proposal 的 What Changes
- [ ] 1.2 `templates/commands/review-plan.md` 步骤 3（调用 Codex 审查）的 `ROLE_FILE` 从 `~/.claude/.ly/prompts/codex/reviewer.md` 改为 `~/.claude/.ly/prompts/codex/plan-reviewer.md`
- [ ] 1.3 `templates/commands/review-plan.md` 步骤 2（读取工件）新增读取该 change 目录下 `specs/**/*.md` 的全部 delta spec 文件（不存在则容错跳过；存在多份时全部读取，按文件路径排序后依次拼接，不只取其中一份），并把这些内容一并纳入步骤 3 传给 Codex 的合并输入（`{proposal.md + design.md + tasks.md 合并内容}` 需扩展为包含 specs 内容）——否则 checklist 里"spec 的 Requirement/Scenario 未覆盖 proposal 的 What Changes"这一项 Codex 无从判断（Codex 审查发现的 Critical，本次修复）
- [ ] 1.4 `templates/commands/review-plan.md` 步骤 4.2（修复）措辞新增：修复对象包含该 change 目录下的 delta spec 文件（`specs/**/*.md`）——若认可的 Critical 是"spec 未覆盖 proposal 的 What Changes"这类问题，修复方式就是编辑对应 delta spec 文件，记录改动文件清单时包含该 spec 文件；否则 1.3 新增的"读取 spec"只能发现问题、不能修复问题，循环无法清零（Codex 第二轮审查发现的 Critical，本次修复）

## 2. 新增"审查对象类型持续系统性误判"终止条件

**编号说明（两套独立编号体系，不要混用）**：`openspec/specs/ly-review-gates/spec.md` 里"审查-修复循环与终止条件"Requirement 自身只列出 7 类条件（1 清零、2 熔断、3 无法安全修复、4 验证失败、5 分歧未决、6 提交失败、本次新增为第 7 类），不包含"审查调用失败"与"全局轮数上限"——这两个在 spec 里是独立的 Requirement。而 `templates/commands/review-plan.md`/`review-code.md` 两个命令文件里的"循环终止条件"列表是把全部信号合并展示的完整清单（当前顺序：1 清零、2 熔断、3 分歧未决、4 无法安全修复、5 验证失败、6 审查调用失败、7 提交失败、8 达到全局轮数上限），编号与 spec 不同、顺序也不同。新增的"审查对象类型持续系统性误判"在两处的落地方式分别处理：spec 里插入为第 7 类（"触发终止条件 2 到 7"）；命令文件里追加为合并列表的第 9 类（"触发条件 2-9"），不打乱命令文件现有的 1-8 编号。

- [ ] 2.1 `templates/commands/review-plan.md` 循环终止条件列表末尾新增第 9 类"审查对象类型持续系统性误判"，措辞与 `openspec/specs/ly-review-gates/spec.md` 的 MODIFIED Requirement（第 7 类）保持一致
- [ ] 2.2 `templates/commands/review-code.md` 循环终止条件列表末尾同步新增第 9 类（两命令共用同一套规则）
- [ ] 2.3 两个命令文件里"触发条件 2-8"这类范围描述文字同步改为"触发条件 2-9"（不涉及编号 1-8 本身的重排，只是把新条件追加到末尾；实施前先读取两个文件当前实际内容确认现有编号仍是 1-8，若因其他并行 change 已发生变化，以文件当前实际状态为准调整最终数字，不假设本文档描述的编号一定成立）
- [ ] 2.4 两个命令文件的终止报告模板（"熔断/分歧未决/...结束"那个分支）新增第 9 类对应的展示格式：复用"分歧未决"现有的"额外展示 Codex 各轮原始发现 + Claude 各轮反驳理由"格式，改为展示触发时的连续 3 轮（而不是 2 轮）——明确写清楚"第 9 类终止条件也要求并列展示 3 轮原始发现与反驳理由"，不能只在终止条件列表里加一行文字就算完事（Codex 审查发现的 Warning，本次修复）

## 3. 文档同步

- [ ] 3.1 检查 `templates/CLAUDE.md` 里 `review-plan.md` 的一句话说明是否需要提及"独立角色提示词"这一点
- [ ] 3.2 更新根 `CLAUDE.md` 变更记录，新增本次条目

## 4. 验证

- [ ] 4.1 `openspec validate --changes review-plan-scope-fix --strict` 通过
- [ ] 4.2 走查：`/ly:review-plan` 场景下，若审查到未勾选的 `tasks.md` 任务，`plan-reviewer.md` 的约束是否能让 Codex 不再据此报 Critical（人工核对角色提示词文字表述是否清晰、无歧义）
- [ ] 4.3 走查：连续 3 轮 Critical 均被 Claude 判定为同一类系统性误判时，命令是否正确停止并输出包含 3 轮原始发现与反驳理由的报告
- [ ] 4.4 走查：系统性误判不连续（中间夹一轮真实问题）时，不误触发第 7 类终止条件
- [ ] 4.5 确认 `review-code.md` 未被误改角色提示词引用（仍指向 `reviewer.md`）
- [ ] 4.6 走查：某 change 目录下 `specs/` 存在多个 capability 的 delta spec 文件时，确认全部被按路径排序读取并拼接进 Codex 输入，不遗漏、不重复
- [ ] 4.7 走查：某 change 目录下没有 `specs/` 目录或为空时，命令容错跳过，不报错、不阻断审查流程
- [ ] 4.8 走查：认可的 Critical 指向某个 delta spec 文件时，Claude 能实际编辑该 spec 文件完成修复，下一轮复审确认该问题已清零（验证 1.4 的修复对象扩展是否真正闭环，而非只是文字上允许）
