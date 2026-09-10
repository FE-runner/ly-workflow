## 1. Web UI 模块（src/wrapper/）

- [ ] 1.0 前置改造 `src/wrapper/core.ts`：`createOutputStreamParser` 新增结构化 `onEvent` 回调（事件名+完整 content，去除 120 字符截断对结构化载荷的影响——截断仅保留在终端展示行）；`core.test.ts` 补结构化回调断言
- [ ] 1.1 新建 `src/wrapper/web-ui.ts`：`startProgressServer(backend)` — HTTP+SSE 服务（port 0 随机端口、`/` 内嵌单页、`/events` SSE 端点）、`broadcast(event, fields)`、`close()`、`openBrowser()`（macOS `open -g`/Linux `xdg-open`/Windows `start`，打开失败静默、URL 已在终端打印兜底）；启动失败降级返回 null（调用方走纯终端进度）
- [ ] 1.2 内嵌 HTML 单页：EventSource 订阅 `/events`，按事件类型（session_started/turn_started/cmd_done/reasoning/message/turn_completed）分区渲染，结束时展示最终报告
- [ ] 1.3 `src/ly-wrapper.ts` 接线：非 lite 时启动服务（终端打印 URL 与关闭方式 `--lite`/`CODEAGENT_LITE_MODE=true`）、结构化 onEvent → broadcast、最终 message → broadcast(done)、进程 close（含超时/非零退出）→ close()；lite 判定 = `--lite`/`-L` 标志 ∥ `CODEAGENT_LITE_MODE=true`（parseArgs 把两个形态都写入 config）
- [ ] 1.4 vitest：lite 判定（`--lite`/`-L`/env）、服务起停与端口监听、broadcast→SSE 事件转发（fetch 流式读取断言）、服务异常不影响主流程；浏览器打开不做自动化断言（URL 输出兜底验证）

## 2. init/menu 选项接回

- [ ] 2.1 `src/commands/init.ts` 改造既有"Step 3/3 性能设置"步骤（已有 liteMode 写入）：核对选项文案与 Web UI 描述匹配，确保语义为"终端进度/Web UI"二选一；存量配置缺失时按 false 处理
- [ ] 2.2 `src/commands/menu.ts` 新增显示设置项（当前无任何性能/显示入口）：可查看并修改 liteMode
- [ ] 2.3 核对 `installer-template.ts` 的 `{{LITE_MODE_FLAG}}` 渲染（liteMode=true → `--lite `，false → 空串）与既有测试，确认端到端联动无需额外改动；如有偏差则修

## 3. 文档与验收

- [ ] 3.1 根 CLAUDE.md 模块职责 ly-wrapper 描述补 Web UI 一句；CHANGELOG 待发版时补（不在本 change 范围）
- [ ] 3.2 `pnpm typecheck && pnpm build && pnpm test` 全绿；`node dist/ly-wrapper.js --backend codex - "$PWD"`（stub backend）验证默认形态自动起服务并打印 URL，`--lite` 形态不起服务
