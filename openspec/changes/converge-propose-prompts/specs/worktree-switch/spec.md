## REMOVED Requirements

### Requirement: 按 change 名切换或创建隔离 worktree
**Reason**: `/ly:propose` 已在创建方案前直接从当前分支 HEAD 用 `git worktree add` 切出隔离 worktree（见 `worktree-create-before-propose`），"等 change 生成后按 change 名定位/创建 worktree"的 `switch` 用途消失；其 `--auto` 自动续接审查承诺已被"全自动流水线（review-plan → apply → review-code 同会话连续执行）"取代。`git worktree add <path> -b <branch>`（从任意基线切出，不含 change 相关校验）其余流程继续由 `/ly:worktree add` 承载。
**Migration**: 创建/定位隔离开发环境使用 `/ly:propose` 创建方案前的 worktree 询问（`git worktree add`），或直接 `git worktree add`；不再有 `switch <change-name>` 命令。

### Requirement: 已在隔离环境内时默认不创建，需用户明确确认
**Reason**: worktree 创建询问已前移到 propose 创建方案前并收敛为单点（已隔离则直接跳过询问，见 `worktree-create-before-propose`），`switch` 场景下的"默认不创建需确认"不再适用。
**Migration**: 已在 worktree 内时不再触发任何 worktree 询问；需要新隔离环境时在裸工作区通过 propose 前置询问或直接 `git worktree add`。

### Requirement: 输出续接命令但不自动执行；baseline 失败默认阻断输出
**Reason**: 该行为现由 propose 的前置 worktree 创建流程承载（创建方案前。新建后打印续接命令、baseline 失败默认不打印需显式继续），`switch` 不再存在。
**Migration**: 续接命令与 baseline 失败阻断规则迁至 `worktree-create-before-propose` 的"切换后复用 add 后续流程"。

### Requirement: `--auto` 标志只改变续接命令文案，不改变执行方式
**Reason**: `--auto` 承诺的"自动依次调用 `/ly:review-code`"已被全自动流水线（`ly-propose-flow` 的"全自动路径 = 自动流水线直到审完代码"）取代，`switch` 与 `--auto` 一并移除。
**Migration**: 后续自动阶段改为 propose（选全自动时）同会话连续执行 review-plan → apply → review-code；不再通过 `switch --auto` 文本续接。