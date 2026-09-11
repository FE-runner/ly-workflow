## Purpose

安装器（update/uninstall 路径）对用户机器上已安装的 ly-workflow 上游遗产产物（domains 域知识、hooks、output-styles、MCP 配置、Codex Mode 文件、旧 Go 版 codeagent-wrapper 二进制）的清理行为契约。这些产物来自 v2.0 瘦身前的历史安装，瘦身后再安装时不再产生；本能力保证历史安装被主动回收，避免用户机器上残留死代码与每次会话白跑的 hook。

## Requirements

### Requirement: update 路径清理已装上游遗产产物
运行 update（或重新 init）时，安装器必须（SHALL）清理以下历史安装产物（存在才清，不存在跳过）：
- `~/.claude/skills/ly/domains/` 目录（域知识库）
- `~/.claude/hooks/ly/` 下的 hook 文件（session-start.js / subagent-context.js / workflow-state.js / task-utils.js / skill-router.js）及 `~/.claude/settings.json` 中指向这些 hook 的注册项（subagent-context 等 PreToolUse 条目）
- `~/.claude/output-styles/` 中由 ly-workflow 安装的风格文件
- `~/.claude/skills/ly/` 下历史版本安装的分类产物（`impeccable/`、`tools/`、`orchestration/`、`scrapling/`、`SKILL.md`、`run_skill.js` 及其他旧布局残留）——按已知产物清单识别；`~/.claude/commands/ly/` 下由分类生成器生成的历史命令文件按生成器指纹识别清理，用户自定义的同名文件 SHALL NOT 被误删
- `~/.claude/rules/ly-skill-routing.md`（domains 关键词路由表，随 domains 退役）
- MCP 配置功能写入的注册项：`~/.claude.json` 中 `mcpServers` 里由本工具注册的 server 条目及其同步副本（`~/.codex/config.toml`、`~/.gemini/settings.json`、`~/.contextweaver/` 等按功能实际同步目标）——按"由本工具注册的 server 名/来源标识"识别，其他来源的 MCP 注册 SHALL NOT 触碰
- `~/.codex/` 下由 Codex Mode 安装的文件（AGENTS.md 中的 LY 管理区块、hooks.json、hooks/ly-workflow.py、agents/ly-*.toml、config.toml 中的 LY 管理区块、`.ly-version` 标记文件）
- `~/.claude/bin/codeagent-wrapper` 旧 Go 二进制

清理必须（SHALL）在汇总中逐项如实报告（清理了什么 / 本就不存在跳过了什么）。

#### Scenario: 老用户升级时历史遗产被清理
- **WHEN** 用户机器上存在 v2.0 之前安装的 domains、hooks、output-styles、Codex Mode 文件与旧 codeagent-wrapper 二进制，运行 update
- **THEN** 上述产物被逐项清理，settings.json 中不再残留指向已删除 hook 文件的注册项，汇总报告列出每项清理结果

#### Scenario: 全新机器上无历史产物
- **WHEN** 用户在从未安装过旧版的机器上运行 update
- **THEN** 清理步骤全部按"本就不存在"跳过，不报错，汇总中如实说明

### Requirement: settings.json hook 注册项清理不误删无关内容
清理 `~/.claude/settings.json` 中的 hook 注册项时，安装器必须（SHALL）仅移除指向 ly-workflow 已删除 hook 文件的条目（按路径/来源识别），SHALL NOT 触碰用户其他 hook（如其他工具注册的 PreToolUse/Stop 条目）。settings.json 中其余键值保持原样。

#### Scenario: 与其他工具的 hook 共存
- **WHEN** 用户 settings.json 中同时存在 ly-workflow 的 subagent-context.js 条目与其他工具的 hook 条目，运行 update
- **THEN** 仅 ly-workflow hook 条目被移除，其他工具的 hook 条目原样保留

### Requirement: 清理幂等且失败不阻断
清理行为必须（SHALL）幂等：对同一台机器重复运行结果一致。单项清理失败（权限不足等）SHALL 在汇总中如实报告该失败，SHALL NOT 静默跳过，也 SHALL NOT 中断安装器主流程。

#### Scenario: 重复运行 update
- **WHEN** 用户连续两次运行 update
- **THEN** 第二次运行时清理项全部按"已不存在"跳过，结果与第一次清理完成后的状态一致

#### Scenario: 单项清理失败不阻断
- **WHEN** 某个历史产物因文件权限问题无法删除
- **THEN** 汇总报告说明该项清理失败及原因，安装器主流程继续完成
