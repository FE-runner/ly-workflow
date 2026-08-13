## Why

`/ly:review-code`/`/ly:review-plan` 的审查-修复循环，每一轮都由 Claude 手动把完整基线 diff 或全部 proposal/design/tasks/specs 内容拼进传给 `codeagent-wrapper --backend codex` 的 TASK 文本里重传——但 Codex backend 实际以 agentic 模式运行（`codex e -C WORKDIR --dangerously-bypass-approvals-and-sandbox`），具备自主 shell/文件读取能力，完全不需要调用方代填全文。同时 Codex 的完整审查结论只在进程结束时一次性输出到 stdout，用户在交互窗口里始终看不到原文，只能看 Claude 转述整理后的摘要，无法核实 Claude"认可/不认可"某条 Critical 的判断是否忠实。另外 `codex/reviewer.md` 里仍是旧的 VALIDATION REPORT 打分制格式，与命令层实际要求的 Critical/Warning/Info 分级格式不一致，存在解析失败风险。

## What Changes

- `/ly:review-code`/`/ly:review-plan` 第 2 轮起，TASK 内容改为"上一轮 Critical 原文（逐字）+ 本轮实际改动的文件路径清单"，指示 Codex 自行读取这些路径的当前内容判断修复是否到位、有无引入新问题，不再重传未变化的基线内容/未变化的 artifact 全文。首轮审查范围判定逻辑不变（沿用现有的 git diff/change 目录判定分支），但 TASK 里不再由 Claude 预先把 diff 内容拼成大段文本，改为提示 Codex 自行执行 `git diff`/读取指定路径获取内容。
- `/ly:review-code`/`/ly:review-plan` 的报告模板（每一轮，不只终止时）新增"Codex 本轮原始发现（逐字）"区块，与 Claude 的认可/不认可判定并排展示，不经 Claude 二次改写。
- 修正 `templates/prompts/codex/reviewer.md` 的过时打分制输出格式（`XX/100`），改为与 `plan-reviewer.md` 一致的 Critical/Warning/Info 分级结构，消除命令层解析失败的隐患。同时 `codex/reviewer.md` 与 `codex/plan-reviewer.md` 都需补充路径契约：每条发现的"位置"字段必须给出至少一个可解析的相对 `WORKDIR` 文件路径，跨文件/范围性问题需列出全部相关路径——这是第 2 轮起增量传递能可靠构造路径清单的前提。
- **BREAKING**：无。这是审查循环内部实现方式的调整，不改变命令的外部调用方式（`/ly:review-code`、`/ly:review-plan <change-name>`、`--no-commit` 标志均不变）。

## Capabilities

### New Capabilities
（无）

### Modified Capabilities
- `ly-review-gates`：修改"代码审查读取 git diff 并分级输出发现""方案审查分级输出发现""审查-修复循环与终止条件（review-code / review-plan 共用）"三条 Requirement——第 2 轮起的 TASK 构造方式改为增量传递（Critical 原文 + 改动文件路径），报告结构新增逐轮展示 Codex 原始发现的区块。

## Impact

- `templates/commands/review-code.md`：步骤 2/3（Codex 调用的 TASK 构造）、步骤 4（报告模板）。
- `templates/commands/review-plan.md`：步骤 3/4（Codex 调用的 TASK 构造）、步骤 5（报告模板）。
- `templates/prompts/codex/reviewer.md`：输出格式段落改为 Critical/Warning/Info 分级结构。
- `openspec/specs/ly-review-gates/spec.md`：对应 Requirement 的 delta。
- 不涉及 `codeagent-wrapper/` Go 代码改动——纯 prompt/模板层调整，wrapper 的 stdin 协议（`ROLE_FILE`/`TASK`/`OUTPUT`）本身已支持自由文本，无需扩展。
