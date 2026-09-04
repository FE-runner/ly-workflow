# ly-workflow

> 源自 [ccg-workflow](https://github.com/fengshao1227/ccg-workflow) 的二次开发重构，现为独立项目：Claude Code 自己完成聊天/分析/规划/实施，Codex 只在两个节点做审查关卡——方案审查、代码审查。最大化复用 OpenSpec 原生工作流。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

## 安装

```bash
npx ly-workflow
```

## 命令

| 命令 | 用途 |
|------|------|
| `/ly:init` | 生成 CLAUDE.md + 初始化 OpenSpec 目录结构 |
| `/ly:explore` | 想清楚再动手（委托 `opsx:explore`） |
| `/ly:propose` | 提出方案，生成 proposal/design/tasks（委托 `opsx:propose`），commit 前由提出者自审（逻辑闭环 + 业务全面性） |
| `/ly:apply` | 按 `routing.implementer` 实施 tasks：`claude`（默认）= 当前会话本人实施；`codex`/`hermes`/`openclaw` = 委托 `codeagent-wrapper` 单次 agentic 调用 |
| `/ly:review-plan` | Codex 审查当前方案的合理性、遗漏边界、风险点 |
| `/ly:review-code` | Codex 审查代码变更，Critical/Warning/Info 分级输出 |
| `/ly:archive` | 归档完成的 change（委托 `opsx:archive`） |
| `/ly:release` | GitFlow 四场景发版（feature/release/hotfix/dev-offline），SemVer 自动推导版本号 |
| `/ly:changelog` | 按 commit 前缀分组生成 Keep a Changelog 格式的 CHANGELOG.md |
| `/ly:publish` | npm 包发布四场景（bmc 私域 Nexus / GitHub Packages / npmjs + GitHub Release / CI 自动发布） |
| `/ly:commit` `/ly:rollback` `/ly:clean-branches` `/ly:worktree` | Git 工具 |

## 典型工作流

```
/ly:init
/ly:propose "要做什么"
/ly:review-plan        # Codex 审方案
/ly:apply
/ly:review-code        # Codex 审代码
/ly:archive
```

## 架构

- **实施**：`routing.implementer` 默认 `claude`——Claude Code 本人写代码；可选切换 `codex`/`hermes`/`openclaw` 委托外部 agent 实施
- **审查**：两个关卡都走 `codeagent-wrapper --backend <routing.reviewer>`（默认 `codex`），复用其 session 管理与进度回调
- **发布**：打 tag `v*.*.*` push 触发 GitHub Actions 自动发 npm 包，`codeagent-wrapper/` 变更自动重建各平台二进制
- **生命周期**：直接委托 OpenSpec 原生技能（`opsx:*`），不重新封装

详见 [CLAUDE.md](./CLAUDE.md)。

## Credits

Based on [ccg-workflow](https://github.com/fengshao1227/ccg-workflow) — Claude + Codex + Gemini 多模型协作系统。

## License

MIT
