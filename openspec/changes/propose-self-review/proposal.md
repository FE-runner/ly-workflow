## Why

`/ly:propose` 生成的方案由 opsx:propose 一次产出，产出后直接进入外部审查（review-plan）——需求逻辑闭环（What Changes→design→tasks 链条断链、孤儿任务）与业务全面性（漏掉的业务场景/维度）在方案定稿前没有任何一道检查。外部审查者不具备 propose 讨论上下文，查"业务不全面"只能按通用模板撒网，效果差且 Warning 泛滥；而方案提出者（当前会话 Claude）上下文最全，恰是查这类问题的最佳人选，但现状没有给它这个职责。

## What Changes

- `/ly:propose` 编排新增**方案自审**步骤：在 `opsx:propose` 产物生成之后、`propose: <change-name>` commit 之前执行，由方案提出者（当前会话）自审
- 自审包含四项检查：
  1. **正向闭环**：每条 What Change 都有 design 决策与 tasks 任务接得上（design.md 缺失时容错跳过该段，直接对接 tasks）
  2. **反向闭环**：每个 task 可溯源到至少一条 What Change（孤儿任务 = 拆解时私自扩的范围）
  3. **基线波及**：Modified Capabilities 逐条对照 `openspec/specs/<capability>/spec.md` 的现有 Requirements，问"本次改动会不会波及这条"，方案只字未提的波及即为遗漏
  4. **通用业务维度过网**：权限、失败路径、并发、兼容/迁移等维度逐项过一遍，"不适用"必须写明理由，禁止 silent skip
- 发现问题分两类处理：**机械断链**（漏任务、范围未同步）由提出者直接改 artifact；**业务判断类**（"这个场景要不要支持"）列为开放问题，用 AskUserQuestion 问用户——**全自动模式下仍然问**（作为流水线的人工确认点，与"需要人工介入"同级）
- 防走过场硬约束：自审必须产出**逐项结论清单**（每项标注：通过 / 不适用+理由 / 已修复 / 待用户决策），不得以"检查过了，无问题"一句带过
- 自审修复随 `propose:` commit 一次干净提交（自审先于 commit 执行，commit 内容 = 产物 + 自审修复）
- `/ly:review-plan`、`plan-reviewer.md`、审查-修复循环、`codeagent-wrapper` **全部不动**——闭环与全面性主责移到自审，外部审查保持现状（一致性与风险视角）

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `ly-propose-flow`: 新增 Requirement——propose 产物生成后、commit 前执行方案自审（四项检查 + 两类发现处理 + 逐项结论清单硬约束 + 全自动模式下业务判断类仍询问）；现有"产物每步 commit"Requirement 的执行时序描述同步（commit 前含自审环节）

## Impact

- **模板**：`templates/commands/propose.md`（新增自审步骤 + checklist 内嵌，主要改动）
- **文档**：`README.md`、`CLAUDE.md`、`templates/CLAUDE.md` 的 propose 描述同步
- **不改动**：`review-plan.md`、`prompts/codex/plan-reviewer.md`、循环机制、`codeagent-wrapper`、`src/` TypeScript 源码、npm 依赖
