# restore-review-web-ui — 恢复审查进度 Web UI

## Why

de-fork-slim-v2 按 D9 决策随 Go wrapper 一并移除了 SSE 审查进度 Web UI（server.go，545 行），但其中"浏览器实时看审查进度"是 init 向导向用户提供的实际功能，用户确认仍需要。原 server 是多模型引擎遗产包的一部分被整体退役，其中 Web UI 本身值得以 TS 极简形态恢复。

## What Changes

- **`ly-wrapper` 新增进度 Web UI**：调用后端且未指定 `--lite` 时，wrapper 启动本地 HTTP+SSE 服务（对齐 Go 版行为基线：port 0 随机空闲端口、自动打开浏览器、macOS 用 `open -g` 后台打开不抢焦点），浏览器实时查看审查事件流（session_started/turn_started/cmd_done/reasoning/message/turn_completed）与最终报告；`--lite` 语义恢复为"不要 Web UI"（同时接受环境变量 `CODEAGENT_LITE_MODE=true`，与 Go 版一致）；审查会话结束（进程退出）时服务自动关闭，不残留后台进程
- **init 向导恢复"审查进度展示方式"选项**：终端进度 / Web UI 二选一，写入 `liteMode` 配置（选终端进度 = lite）；现有 `{{LITE_MODE_FLAG}}` 模板渲染与命令 `--lite` 透传链路复用，`ly menu` 的性能设置入口同步可改
- **不恢复**：并发任务调度、拓扑排序、任务日志系统等真正的引擎遗产
- **文档同步**：根 CLAUDE.md 模块职责中 ly-wrapper 描述补 Web UI 一句

## Capabilities

### New Capabilities

- `review-display-mode`: 审查进度展示方式的选择与联动——init 向导选项、liteMode 配置、`{{LITE_MODE_FLAG}}` 渲染、`--lite` 透传到 ly-wrapper 的端到端契约

### Modified Capabilities

（无——ly-wrapper 基线 spec 未定义过 `--lite` 语义（"接受不生效"仅存在于实现与测试，非 spec 级行为），本 change 对 ly-wrapper 为纯新增 Requirement；`--lite` 恢复实际语义以 ADDED 条目落在 ly-wrapper delta 中表达。）

## Impact

- `src/wrapper/web-ui.ts`（新增）、`src/wrapper/core.ts`（onProgress 结构化改造）、`src/ly-wrapper.ts`（接线）、`src/commands/init.ts`（向导选项）、`src/commands/menu.ts`（性能设置项）、`templates/commands/*.md`（`{{LITE_MODE_FLAG}}` 恢复有值渲染——机制已在，确认即可）、根 CLAUDE.md、vitest 测试
- 风险面小：全部为新增路径，`--lite` 时行为与现状完全一致
