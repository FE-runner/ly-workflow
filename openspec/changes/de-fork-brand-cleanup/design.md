## Context

残留清单已在探索阶段逐文件盘点确认（README/package.json/CONTRIBUTING/SECURITY/bug_report.md/CLAUDE.md/LICENSE 共 7 处文件层痕迹）。用户已定两项措辞决策：README 保留一句溯源；LICENSE 加自有版权行。GitHub fork detach 走 support 工单，与本 change 解耦。

## Goals / Non-Goals

**Goals:** 仓库内文字与元数据不再自称 fork；CONTRIBUTING/SECURITY/issue 模板的 CCG 漏网残留清零；LICENSE 双版权行。

**Non-Goals:** 不删历史溯源（CHANGELOG 头部、archive）；不动 migration.ts；不改任何运行时代码；不在本 change 内处理 GitHub 平台 detach。

## Decisions

1. **README 溯源措辞**（用户已选）："源自 ccg-workflow 的二次开发重构，现为独立项目：…"——比彻底不提更诚实，且与 LICENSE/CHANGELOG 的保留策略一致。
2. **LICENSE 双版权行**（用户已选）：原行不动（MIT 义务），下方加 `Copyright (c) 2025 yang.li12`。
3. **CCG 残留统一替换为项目实际标识**：CONTRIBUTING → "ly-workflow"；SECURITY.md 的 "CCG hooks" → "LY hooks"（对应 `~/.claude/hooks/ly/` 实际路径）；bug_report.md 标题 → "Report a bug in ly-workflow"，版本示例 "1.7.75" → "1.7.4"（本项目版本体系）。
4. **description 去括号注但保留语义**：`"Claude Code + OpenSpec + Codex review gates — a lean two-role dev workflow"`，溯源交给 README/LICENSE。
5. **验证方式**：`grep -ri "ccg"` 在活文件（排除 CHANGELOG 溯源、archive、migration.ts、LICENSE 原行、node_modules/dist）应零命中；`pnpm build` 确认 package.json 变更不破坏构建。

## Risks / Trade-offs

- [README 溯源句仍提及 ccg-workflow，grep 验证会命中] → 明确豁免清单写进任务验证条件，属有意保留
- [description 变更需下次发版才在 npm 生效] → 接受，不为文案单独发版

## Open Questions

（无——措辞两项决策已由用户确认。）
