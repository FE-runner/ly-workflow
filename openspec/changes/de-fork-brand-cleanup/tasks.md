## 1. 品牌残留清理

- [x] 1.1 `README.md` 导语改为："源自 [ccg-workflow](https://github.com/fengshao1227/ccg-workflow) 的二次开发重构，现为独立项目：Claude Code 自己完成聊天/分析/规划/实施，Codex 只在两个节点做审查关卡——方案审查、代码审查。最大化复用 OpenSpec 原生工作流。"
- [x] 1.2 `package.json` description 去掉 " (forked from ccg-workflow)" 后缀
- [x] 1.3 `CONTRIBUTING.md` 标题与正文 "CCG" → "ly-workflow"
- [x] 1.4 `SECURITY.md` 两处 "CCG hook scripts"/"CCG hooks" → "LY hook scripts"/"LY hooks"
- [x] 1.5 `.github/ISSUE_TEMPLATE/bug_report.md`："Report a bug in CCG workflow" → "Report a bug in ly-workflow"；"CCG version" → "ly-workflow version"；版本示例 "1.7.75" → "1.7.4"
- [x] 1.6 根 `CLAUDE.md` 头部 "Fork 自 ccg-workflow（…）" 改为溯源式表述（保留一句溯源，风格与 README 一致）

## 2. LICENSE 双版权行

- [x] 2.1 `LICENSE` 保留 `Copyright (c) 2025 fengshao1227` 原行不动，下方新增 `Copyright (c) 2025 yang.li12`

## 3. 验证

- [x] 3.1 `grep -ri "ccg"` 全仓扫描（排除 node_modules/dist/openspec/changes/archive）：剩余命中仅允许出现在 CHANGELOG.md 溯源说明与 CLAUDE.md/README.md 的溯源句（"ccg-workflow" 全名指涉）中，不得再出现独立的 "CCG"/"ccg" 标识或 "Fork 自/forked from" 表述
- [x] 3.2 `pnpm build` 通过（package.json 变更不破坏构建），`pnpm typecheck` 通过
- [x] 3.3 `git diff` 复核：LICENSE 原 fengshao1227 版权行未被改动，CHANGELOG.md 头部溯源说明未被改动，migration.ts 无变更
