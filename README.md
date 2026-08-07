# ly-workflow

> Fork 自 [ccg-workflow](https://github.com/fengshao1227/ccg-workflow)。Claude Code 自己完成聊天/分析/规划/实施，Codex 只在两个节点做审查关卡——方案审查、代码审查。最大化复用 OpenSpec 原生工作流。

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
| `/ly:propose` | 提出方案，生成 proposal/design/tasks（委托 `opsx:propose`） |
| `/ly:apply` | 按 tasks 实施（委托 `opsx:apply`） |
| `/ly:review-plan` | Codex 审查当前方案的合理性、遗漏边界、风险点 |
| `/ly:review-code` | Codex 审查代码变更，Critical/Warning/Info 分级输出 |
| `/ly:archive` | 归档完成的 change（委托 `opsx:archive`） |
| `/ly:commit` `/ly:rollback` `/ly:clean-branches` `/ly:worktree` | Git 工具 |
| `/ly:context` | 项目上下文管理（`.context/` 目录） |

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

- **实施**：Claude Code 自己写代码，不分派给其他模型
- **审查**：两个关卡都走 `codeagent-wrapper --backend codex`，复用其 session 管理与进度回调
- **生命周期**：直接委托 OpenSpec 原生技能（`opsx:*`），不重新封装

详见 [CLAUDE.md](./CLAUDE.md)。

## Credits

Based on [ccg-workflow](https://github.com/fengshao1227/ccg-workflow) — Claude + Codex + Gemini 多模型协作系统。

## License

MIT
