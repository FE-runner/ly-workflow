# src (ly-workflow TypeScript CLI)

> [根目录](../CLAUDE.md) > **src**

**Last Updated**: 2026-08-07

---

## 模块职责

CLI 工具的全部 TypeScript 实现：安装/更新 `ly-workflow` 到 `~/.claude/`，从 `templates/` 读取素材经模板变量替换后写入目标位置，MCP 配置管理，中英双语交互界面。

打包产物由 `unbuild` 输出到 `dist/`，由 `bin/ly.mjs` 加载，通过 `npx ly-workflow` 调用。

---

## 入口与启动

| 文件 | 角色 |
|------|------|
| `src/cli.ts` | CLI 主入口，`cac('ly')` |
| `src/cli-setup.ts` | 命令注册 |
| `bin/ly.mjs` | npm bin 脚本 |

## 命令

| 命令 | 实现文件 |
|------|----------|
| `ly` / `ly init` | `commands/init.ts` |
| `ly menu` | `commands/menu.ts` |
| `ly update` | `commands/update.ts` |
| `ly doctor` / `ly status` | `commands/doctor.ts` |
| `ly diagnose-mcp` | `commands/diagnose-mcp.ts` |

## 核心类型（`types/index.ts`）

| 类型 | 说明 |
|------|------|
| `ModelType` | `'codex' \| 'claude'` |
| `ModelRouting` | `{ reviewer: ModelType }` — 只控制审查阶段用哪个模型 |
| `LyConfig` | 完整配置结构 |

## utils/installer.ts 要点

- `installWorkflows()`：安装 7 个 `/ly:*` 命令到 `~/.claude/commands/ly/`
- Backend 只需 codex/claude，无 frontend/backend 双模型分派逻辑
- `EXPECTED_BINARY_VERSION`：需与 `codeagent-wrapper/main.go` 的 `version` 保持一致

## 构建

```bash
pnpm typecheck   # tsc --noEmit
pnpm build       # unbuild → dist/cli.mjs + dist/index.mjs
pnpm test        # vitest run
```
