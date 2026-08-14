## Context

见 [proposal.md](./proposal.md) 的 Why。当前四个 slash command（propose/apply/review-plan/review-code）在 Git 提交时机上存在一致性缺陷：propose/apply 无条件立即 commit，把工作区提前清空，导致 review 主路径（"审未提交变更"，`git diff HEAD`）空转、退到 `HEAD~1` 兜底，并与 review-plan 的"循环前已脏隔离"互相矛盾。本 design 描述把提交时机统一为"暂存区持有 + 审查后提交"的实现方式。

## Goals / Non-Goals

**Goals:**
- propose/apply 产物默认 `git add` 暂存、不 commit，统一以"暂存区持有"承载审查对象。
- review-plan/review-code 审查范围统一为 `git diff HEAD`（暂存区+工作区），删除历史 commit 兜底（`HEAD~1`/`git show HEAD`）。
- 手动模式在"跳过审查"与"非清零终止"两个场景询问是否提交；自动模式免询问。
- review-plan 的"循环前已脏隔离"删除，产物即合法审查对象。
- init/archive 无条件 commit 不变。

**Non-Goals:**
- 不改变 worktree switch 的路径/分支校验逻辑，只改其续接文案（去掉"自动 commit"字样）。
- 不改变 review 循环的终止条件、增量传递、熔断/分歧判定——只改"审查范围"与"提交动作"。
- 不实现"非清零时只提交产物、不提交修复"的精细切分（git 文件级粒度做不到，见 Risks）。

## Decisions

### D1: review 审查范围统一为 `git diff HEAD`，删除历史 commit 兜底
- **选择**：`/ly:review-code` 首轮分支逻辑简化为两级——有未提交变更 → `git diff HEAD`；零 commit 仓库 → 三条固定命令组合（`git diff --cached` + `git diff` + `??` 清单）。工作区干净（无未提交变更）→ 直接报"无变更"，不再回退 `HEAD~1`/`git show HEAD`。
- **理由**：审查对象原则就是"未提交的变更"。历史 commit 不属于审查范围；propose/apply 不再无条件 commit 后，工作区干净场景应理解为"没有东西可审"，而非"审最近一次 commit"。
- **备选**：保留 `HEAD~1` 兜底作为"审最近一次发布 commit"的用法。否决——与旧"无条件 commit"设计绑定，违背新原则；且独立审查最近 commit 语义含糊（审谁的最后一次提交？）。
- **连带**：零 commit 仓库的三条命令组合保持不变（那是无 HEAD 的唯一合理表达）。

### D2: propose/apply 产物"暂存区持有"，提交时机按模式分支
- **选择**：propose 生成 artifact 后、apply 实施完成后，都 `git add` 对应文件（propose 只 add `openspec/changes/<change-name>/`；apply add 本次实际改动文件），**不立即 commit**。产物驻留暂存区，成为 review 的审查对象。
- **自动模式**：免询问。清零时由 review 循环统一提交（暂存区中的产物+修复一并 `git add` 后 commit）。
- **手动模式**：两个提交询问点——(a) 用户跳过审查时问"是否提交产物"；(b) 审查非清零终止时问"是否提交"。自动模式不设这两个询问（非清零终止时产物留暂存区由用户自行处理）。
- **理由**：暂存区是"已确认但未历史记录"的中间态，语义贴合"待审查的产物"；清零统一提交天然把产物与修复合为一笔提交，避免 review-plan 隔离逻辑的各种边界情况。
- **备选**：审查范围改 `git diff --cached`（只审暂存区）。否决——每轮修复需 add 进暂存区才能被下轮审到，漏 add 即漏审，且"只提交产物"无法实现，复杂度高于收益。

### D3: 清零统一提交 = `git add` 审查目标全部文件 + commit
- **选择**：review-plan/review-code 清零后，先 `git add` 审查目标全部文件（review-plan 为该 change 目录全部 artifact+delta spec；review-code 为审查范围圈定的全部代码文件），再执行一次 commit（信息形如 `fix: review-plan feedback (经 N 轮修复) - <change-name>` / `fix: review-code (经 N 轮修复)`）。
- **理由**：审查目标原始改动 + 循环修复 = 同一待提交单元，整目录 add 比"临时收集循环期间改动文件清单"更可靠（修复可能删/重命名文件）。
- **连带**：review-plan 的"循环开始前已脏隔离"（步骤 1.5 + 提交时跳过）整个删除——产物现在是合法审查对象，不再是"无关脏文件"。若编排方（propose/apply）已暂存产物，清零提交时它们已被 `git add` 覆盖进 index，一并进入 commit。

### D4: review 循环自身约束"非清零不提交"保留；编排方提交决策在循环外
- **选择**：review 循环自身的规则不变——非清零终止（熔断/分歧未决/无法安全修复/验证失败/审查调用失败/轮数上限）时循环 SHALL NOT 提交，改动留工作区。编排方（propose/apply 手动模式）在循环结束后的"非清零询问"是**编排方层面**对暂存区的提交决策，与循环自身的"不提交"约束不冲突（循环不管暂存区里有什么，非清零就不碰 commit）。
- **理由**：职责清晰——循环只对"零不清零就提交"负责；编排方决定"未通过的产物要不要进历史"。

### D5: `--auto` worktree 续接文案去掉"自动 commit"
- **选择**：`/ly:worktree switch <change-name> --auto` 的续接文案从"运行 `/ly:apply` 继续实施（自动 commit），完成后自动依次调用 `/ly:review-code`"改为"运行 `/ly:apply` 继续实施（完成后自动依次调用 `/ly:review-code`）"。
- **理由**：apply 已不再自动 commit，文案中的"自动 commit"成为事实错误。
- **连带**：smoke 场景/文档里若有引用该文案的地方同步调整。

## Risks / Trade-offs

- [**非清零时"只提交产物、不提交修复"不可实现**] → git 的文件级提交粒度无法把同一文件的"产物部分"与"修复部分"切分；`git add` 是覆盖式，暂存区只有最新版。规避：非清零时整体提交（产物+修复一起，如实提醒"修复未经完全验证"），或整体不提交留工作区——二选一，用户通过询问决定。这是"暂存区持有"方案相比"修复放工作区不暂存"方案（B1）在"切分能力"上的固定代价，B1 会在本次设计中作为 review 审查范围的备选记录（D2，被否决）。
- [**用户手工在暂存区放置无关文件**] → propose 在 `git add` 前检查 index，若存在 change 目录外的已暂存内容则停止并要求先处理；review 的 `git add` 只针对审查目标路径，不 `git add -A`。
- [**产物长期滞留暂存区（跳过审查又选不提交）**] → 这是用户显式选择的结果，命令如实报告"产物留在暂存区"并结束，不做自动清理；工作区状态由用户掌控。
- [**`git add` 暂存的产物被后续操作误覆盖**] → 编排顺序固定：propose add → review-plan →（清零提交 / 非清零询问），apply add → review-code →（清零提交 / 跳过/非清零询问）；中间不穿插其他 git 写操作。
- [**行为变化影响既有文档/测试断言**] → 同步更新 templates/CLAUDE.md 命令表与变更记录、CHANGELOG.md；若存在对提交时机断言的测试/文档一并更新。

## Migration Plan

- 无数据迁移。对受影响的 slash command 模板文件实施修改后，同步更新本仓库内的 specs（本 change 的 delta spec 已包含）、templates/CLAUDE.md、CHANGELOG.md。
- 回滚：撤销本 change 的 commits 即可恢复旧的无条件 commit 行为；不存在需要回滚的外部状态。