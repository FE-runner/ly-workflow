## Why

`/ly:review-plan` 与 `/ly:review-code` 共用同一份 Codex 角色提示词（`codex/reviewer.md`），其人设与 checklist 是"资深代码审查员"（SQL 注入、N+1、race condition 等）。审查方案文档（proposal/design/tasks/spec）时，这份角色人设的惯性会让 Codex 把"代码库尚未实现该方案条目"“tasks.md 某任务未勾选”当作 Critical 去报——但方案审查阶段代码本就不该已经实现，未勾选/未落地是正常态，不是方案缺陷。一次真实的 `/ly:review-plan` 会话第十轮仍出现 4 个 Critical，且理由清一色是"代码库没实现"，Claude 全部判定不认可；由于现有熔断/分歧未决判定要求"文件+类别+锚点"三者匹配同一个 Critical，而 Codex 每轮换着不同的任务条目报同一类误判，锚点不完全一致导致这些判定始终不触发，循环持续空转到远超"正常场景 2-3 轮"的轮次，代码库状态不会因为再跑一轮而改变，继续循环没有意义。

## What Changes

- 新增 `templates/prompts/codex/plan-reviewer.md`：专供 `/ly:review-plan` 使用的 Codex 角色提示词，明确禁止把"代码库尚未实现方案条目""tasks.md 任务未勾选"当作 Critical（这是方案阶段的正常状态），只审查方案文档本身的逻辑缺陷——遗漏边界、范围不清晰、proposal/design/tasks/spec 四份文档互相矛盾或脱节、风险点交代不清、spec 的 Requirement/Scenario 未覆盖 proposal 的 What Changes。
- `templates/commands/review-plan.md` 调用 Codex 时的 `ROLE_FILE` 从 `~/.claude/.ly/prompts/codex/reviewer.md` 改为 `~/.claude/.ly/prompts/codex/plan-reviewer.md`。`templates/commands/review-code.md` 不变，继续使用原 `reviewer.md`。
- `/ly:review-plan` 与 `/ly:review-code` 共用的循环终止条件新增一类"审查对象类型持续系统性误判"：不要求前后几轮 Critical 的文件/类别/锚点完全匹配，只要连续 3 轮的 Critical 都被 Claude 判定为同一大类系统性误判（例如都是"拿实现状态当方案缺陷"这类跑偏类型），命中即停止循环转人工，不必等到命中现有的熔断/分歧未决/全局轮数上限这些要求精确匹配的窄条件。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `ly-review-gates`：
  - "方案审查分级输出发现" Requirement 补充说明 `/ly:review-plan` 使用专属角色提示词 `plan-reviewer.md`（而非与 `/ly:review-code` 共用的 `reviewer.md`），并新增约束：不得将"代码库尚未实现该方案条目"作为 Critical 依据。
  - "审查-修复循环与终止条件（review-code / review-plan 共用）" Requirement 新增第 7 类终止条件："审查对象类型持续系统性误判"（连续 3 轮 Critical 同属一类系统性误判即停止）。

## Impact

- 新增：`templates/prompts/codex/plan-reviewer.md`
- `templates/commands/review-plan.md`：`ROLE_FILE` 引用变更；循环终止条件列表新增第 7 类
- `templates/commands/review-code.md`：循环终止条件列表新增第 7 类（与 review-plan 共用同一套规则，需同步）
- `openspec/specs/ly-review-gates/spec.md`：对应 Requirement 增补
