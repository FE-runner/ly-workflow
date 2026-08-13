## Why

`/ly:review-code`/`/ly:review-plan` 的审查-修复循环，每一轮都由 Claude 手动把完整基线 diff 或全部 proposal/design/tasks/specs 内容拼进传给 `codeagent-wrapper --backend codex` 的 TASK 文本里重传——但 Codex backend 实际以 agentic 模式运行（`codex e -C WORKDIR --dangerously-bypass-approvals-and-sandbox`），具备自主 shell/文件读取能力，完全不需要调用方代填全文。同时 Codex 的完整审查结论只在进程结束时一次性输出到 stdout，用户在交互窗口里始终看不到原文，只能看 Claude 转述整理后的摘要，无法核实 Claude"认可/不认可"某条 Critical 的判断是否忠实。另外 `codex/reviewer.md` 里仍是旧的 VALIDATION REPORT 打分制格式，与命令层实际要求的 Critical/Warning/Info 分级格式不一致，存在解析失败风险。此外，现有"每轮修复后立即 commit"的默认行为会在循环还没清零、甚至最终触发熔断/分歧未决转人工时，就已经把中间轮次的改动逐个提交进 git 历史，人工介入时面对的是一堆已提交的中间态 commit，不便于整体回滚或整体评估这次自动修复是否可信。

## What Changes

- `/ly:review-code`/`/ly:review-plan` 第 2 轮起，TASK 内容改为"上一轮 Critical 原文（逐字）+ 路径清单（本轮实际改动的文件 ∪ 上一轮全部 Critical 各自指向的文件）"，指示 Codex 自行读取这些路径的当前内容判断修复是否到位、有无引入新问题，不再重传未变化的基线内容/未变化的 artifact 全文。首轮审查范围判定逻辑不变（沿用现有的 git diff/change 目录判定分支；零 commit 场景下改用 `git diff --cached` + `git diff` + 未跟踪文件清单三条固定命令组合代替原先模糊的"稳定快照"概念），但 TASK 里不再由 Claude 预先把 diff 内容拼成大段文本，改为提示 Codex 自行执行 `git diff`/读取指定路径获取内容。
- `/ly:review-code`/`/ly:review-plan` 的报告模板（每一轮 Codex 调用，包括首轮 Critical 为 0 直接结束的情况，不只是进入了循环体的轮次）新增"Codex 本轮原始发现（逐字）"区块，与 Claude 的认可/不认可判定并排展示，不经 Claude 二次改写。
- 修正 `templates/prompts/codex/reviewer.md` 的过时打分制输出格式（`XX/100`），改为与 `plan-reviewer.md` 一致的 Critical/Warning/Info 分级结构，消除命令层解析失败的隐患。同时 `codex/reviewer.md` 与 `codex/plan-reviewer.md` 都需补充路径契约：每条发现的"位置"字段必须给出至少一个可解析的相对 `WORKDIR` 文件路径，跨文件/范围性问题需列出全部相关路径——这是第 2 轮起增量传递能可靠构造路径清单的前提。
- `/ly:review-plan` 的"spec 未覆盖 proposal 的 What Changes"检查项，明确区分"proposal 未声明任何 capability（无 delta spec 属于正常情况）"与"proposal 声明了 capability 变更但完全没有 delta spec（报 Critical）"——`openspec validate`/`openspec archive` 只校验"该 change 的 delta 总数是否为 0"，不会逐个核对 proposal 声明的每个 capability 是否都有对应 delta spec，也不检查 `skip_specs: true` 是否被误用，因此这条检查是唯一能在方案阶段捕捉"声明了行为变更却完全没写 spec"这类问题的机制。
- **`/ly:review-code`/`/ly:review-plan` 的默认提交行为由"每轮修复后立即 commit"改为"循环期间不提交，仅在循环以正常清零结束时，对全程所有轮次的改动统一提交一次"**。若循环以熔断/无法安全修复/验证失败/分歧未决/审查对象类型持续系统性误判结束，或达到全局轮数上限，命令不提交任何改动，全部留在工作区交由人工处理。`--no-commit` 标志语义调整为"连这次最终的统一提交也不做"。
- **BREAKING**：`--no-commit` 标志的默认对照行为发生变化——原先默认是"每轮都自动提交"，现在默认是"只在清零时提交一次"；`--no-commit` 本身的效果（不自动提交）不变。若有依赖"能在中间轮次的 git 历史里看到每一轮独立 commit"这一行为的下游流程（目前未知有此类流程），需要相应调整。其余命令的外部调用方式（`/ly:review-code`、`/ly:review-plan <change-name>`）不变。

## Capabilities

### New Capabilities
（无）

### Modified Capabilities
- `ly-review-gates`：修改"代码审查读取 git diff 并分级输出发现""方案审查分级输出发现""审查-修复循环与终止条件（review-code / review-plan 共用）"三条 Requirement——第 2 轮起的 TASK 构造方式改为增量传递（Critical 原文 + 路径清单），报告结构新增逐轮展示 Codex 原始发现的区块，"spec 未覆盖 What Changes"检查项区分两种"无 delta spec"情形；重命名并重写"每轮修复默认自动提交, `--no-commit` 关闭" → "循环结束后统一提交, `--no-commit` 关闭最终提交"。

## Impact

- `templates/commands/review-code.md`：步骤 2/3（Codex 调用的 TASK 构造、判定审查范围）、步骤 4（报告模板）、提交逻辑（移出循环体，改为清零后统一提交一次）。
- `templates/commands/review-plan.md`：步骤 3/4（Codex 调用的 TASK 构造）、步骤 5（报告模板）、提交逻辑（同上）。
- `templates/prompts/codex/reviewer.md`：输出格式段落改为 Critical/Warning/Info 分级结构，补充路径契约。
- `templates/prompts/codex/plan-reviewer.md`：补充路径契约，Review Checklist 区分两种"无 delta spec"情形。
- `templates/commands/propose.md`：编排文字中提到"（默认逐轮自动 commit……）"的描述需同步改为"循环结束清零后统一提交一次"。
- `openspec/specs/ly-review-gates/spec.md`：对应 Requirement 的 delta（含一条 RENAMED + MODIFIED）。
- 不涉及 `codeagent-wrapper/` Go 代码改动——纯 prompt/模板层调整，wrapper 的 stdin 协议（`ROLE_FILE`/`TASK`/`OUTPUT`）本身已支持自由文本，无需扩展。
