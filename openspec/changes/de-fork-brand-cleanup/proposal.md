## Why

项目已大幅二次开发（v1.0.0 架构重写、品牌更名 ly-workflow、内部标识已清理），GitHub fork 关系正通过 support 工单申请 detach。但仓库内仍有多处 fork 时代残留：README/CLAUDE.md 的 "Fork 自" 导语、package.json description 的 "(forked from ccg-workflow)"（随 npm 发布，`npm view` 可见）、以及 CONTRIBUTING.md/SECURITY.md/bug_report.md 模板中漏网两轮品牌清理（v1.1.0、v1.4.2）的 "CCG" 字样。品牌独立化需要仓库内文字与平台层 detach 同步收敛。

## What Changes

- `README.md` 导语："Fork 自 ccg-workflow…" 改为保留一句溯源的独立项目表述："源自 ccg-workflow 的二次开发重构，现为独立项目：…"
- `package.json` description：去掉 "(forked from ccg-workflow)" 括号注，其余不变
- `CONTRIBUTING.md`：标题与正文残留的 "CCG" → "ly-workflow"
- `SECURITY.md`：两处 "CCG hook scripts"/"CCG hooks" → "LY hooks"（与实际安装路径 `~/.claude/hooks/ly/` 对应）
- `.github/ISSUE_TEMPLATE/bug_report.md`："Report a bug in CCG workflow" → ly-workflow；版本示例 "1.7.75"（上游版本体系）改为本项目当前版本示例
- 根 `CLAUDE.md` 头部："Fork 自 ccg-workflow（…），重构为…" 改为溯源式表述
- `LICENSE`：保留原 `Copyright (c) 2025 fengshao1227`，下方新增 `Copyright (c) 2025 yang.li12`（MIT 双版权行标准做法）
- **明确不动**：LICENSE 原 fengshao1227 版权行、`CHANGELOG.md` 开头 "Forked from ccg-workflow at v3.2.3" 溯源说明、`openspec/changes/archive/` 历史记录（历史事实）、`src/utils/migration.ts`（v1.4.2 决策不动）

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

（无——纯文档/元数据/品牌措辞改动，无 spec 级行为变更，`skip_specs: true`）

## Impact

- **改动文件**：`README.md`、`package.json`（仅 description 字段）、`CONTRIBUTING.md`、`SECURITY.md`、`.github/ISSUE_TEMPLATE/bug_report.md`、`CLAUDE.md`、`LICENSE`
- **无代码逻辑改动**：不触及 `src/` 运行时逻辑、`codeagent-wrapper/`、templates 功能内容
- **无依赖/构建影响**：description 变更随下次发布生效，不影响已发布的 1.7.4
- **平台层**：GitHub fork detach 走 support 工单，与本 change 并行、互不依赖
