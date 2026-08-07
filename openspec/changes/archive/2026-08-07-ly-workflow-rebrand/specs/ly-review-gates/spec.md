## Purpose

提供两个由 Codex 支撑的审查关卡——一个用于在实施前审查 OpenSpec change 的方案, 一个用于在实施后审查代码变更——统一使用现有的 `codeagent-wrapper` 二进制（`--backend codex`），替代旧的双模型（Codex + Gemini）交叉审查机制。

## ADDED Requirements

### Requirement: 方案审查解析目标 change 且排除已归档项
`/ly:review-plan` 必须（SHALL）按以下优先级解析目标 change：（1）通过 `$ARGUMENTS` 传入的显式 change 名称；（2）若未指定, 且 `openspec/changes/` 下恰好只有一个 change 目录时, 使用该目录；（3）若存在多个 change 目录且未指定, 询问用户要审查哪一个。枚举候选目录时必须（SHALL）排除 `openspec/changes/archive/` 目录及其内容——已归档的 change 不是可选目标。解析完成后, 必须读取该 change 的 `proposal.md`、`design.md`、`tasks.md`（存在的部分）, 将其合并内容作为审查上下文传给以 `codex/reviewer.md` 角色提示词调用的 `codeagent-wrapper --backend codex`。审查必须聚焦方案的合理性——遗漏的边界情况、范围不清晰、风险点——而非逐行代码风格。

#### Scenario: change 有 proposal 和 tasks 但没有 design
- **WHEN** 用户对一个有 `proposal.md` 和 `tasks.md` 但没有 `design.md` 的 change 运行 `/ly:review-plan`
- **THEN** 命令审查现有的工件, 不因缺失 `design.md` 而报错

#### Scenario: 不存在活跃 change
- **WHEN** 用户运行 `/ly:review-plan` 且无法解析出任何 change 目录
- **THEN** 命令询问用户要审查哪个 change, 而不是凭空猜测

#### Scenario: 存在多个 change 且未显式指定
- **WHEN** 用户不带参数运行 `/ly:review-plan`, 且 `openspec/changes/` 下存在多个非归档的 change 目录
- **THEN** 命令询问用户要审查哪一个, 而不是任意挑一个

#### Scenario: 显式指定了 change 名称
- **WHEN** 用户运行 `/ly:review-plan <change-name>`
- **THEN** 命令直接审查该指定 change 目录, 不再询问用户消歧

#### Scenario: 只剩已归档的 change
- **WHEN** 用户不带参数运行 `/ly:review-plan`, `openspec/changes/` 下有一个活跃 change 和一个存放历史归档 change 的 `archive/` 目录
- **THEN** `archive/` 目录及其内容被排除在候选解析之外, 因此那个唯一的活跃 change 被直接选中, 不触发消歧询问

### Requirement: 代码审查读取 git diff 并分级输出发现
`/ly:review-code` 必须（SHALL）按以下方式确定审查范围：若存在未提交变更, 使用 `git diff HEAD`（覆盖已跟踪的修改和已暂存的新增）；否则回退到最近一次 commit 的 diff。由于 `git diff HEAD` 不会显示未跟踪文件, 命令必须额外列出未跟踪文件（用 `git status --porcelain` 过滤出 `??` 条目）并把其内容并入审查上下文, 确保新建但未 `git add` 的文件不会被静默漏审。若仓库尚无任何 commit（`git rev-parse HEAD` 执行失败）, 命令必须回退为审查已暂存内容（`git diff --cached`）加未跟踪文件内容, 不得尝试执行 `git diff HEAD` 或 `git diff HEAD~1`。命令必须以 `codex/reviewer.md` 角色提示词调用 `codeagent-wrapper --backend codex`, 并将发现严格分为三个严重度层级输出：Critical、Warning、Info。

#### Scenario: 存在未提交变更
- **WHEN** 用户在工作区存在未提交变更时运行 `/ly:review-code`
- **THEN** 审查范围是 `git diff HEAD`, 发现按 Critical/Warning/Info 分级输出

#### Scenario: 已跟踪的修改与新建的未跟踪文件同时存在
- **WHEN** 用户运行 `/ly:review-code`, 工作区里既有已跟踪文件的修改, 也有一个新建的未跟踪文件
- **THEN** 审查上下文同时包含 `git diff HEAD` 的输出和该未跟踪文件的内容——未跟踪文件不会被静默遗漏

#### Scenario: 工作区干净但有历史提交
- **WHEN** 用户在没有未提交变更、但存在至少一次历史提交时运行 `/ly:review-code`
- **THEN** 审查范围回退为 `git diff HEAD~1`

#### Scenario: 仓库只有一个 commit（不存在 HEAD~1）
- **WHEN** 用户在没有未提交变更、且仓库恰好只有一个 commit 时运行 `/ly:review-code`
- **THEN** 命令审查该单个 commit 的完整内容（例如 `git show HEAD`）, 而不是因缺失 `HEAD~1` 而报错

#### Scenario: 仓库尚无任何 commit
- **WHEN** 用户在一个完全没有 commit 的仓库中运行 `/ly:review-code`（`git rev-parse HEAD` 会失败）
- **THEN** 命令回退为审查已暂存内容（`git diff --cached`）加未跟踪文件内容, 而不是因缺失 `HEAD` 引用而报错

#### Scenario: 无发现
- **WHEN** codex 审查员没有返回任何问题
- **THEN** 命令明确说明未发现问题, 而不是保持沉默
