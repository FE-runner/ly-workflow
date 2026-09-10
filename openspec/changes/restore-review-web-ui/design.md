# restore-review-web-ui 设计

## Context

Go 版 Web UI（git 历史 `de-fork-slim-v2~9:codeagent-wrapper/server.go`，545 行）行为基线：SSE 服务监听 port 0 随机端口、自动 `open -g` 打开浏览器（macOS 后台不抢焦点）、SSE 事件 `{session_id, backend, content, content_type(reasoning/command/message), done}`、单会话单面板、进程退出时 Stop。lite 门控：`--lite/-L` 标志或 `CODEAGENT_LITE_MODE=true` 环境变量。TS 侧现状：`src/wrapper/core.ts` 的 `createOutputStreamParser` 已有进度回调钩子，但其 `onProgress` 当前只产出 `[PROGRESS] <event> k=v` 字符串行（`message`/`reasoning` 内容被 120 字符截断），并非结构化对象——需先改造为结构化载荷（见 D-A）。`--lite` 已被 parseArgs 接受但为无操作；init 的 `{{LITE_MODE_FLAG}}` 渲染机制（installer-template）与 `liteMode` 配置字段仍在位（de-fork-slim-v2 保留了渲染链路，只删了 wrapper 的消费端）。

## Goals / Non-Goals

**Goals:**
- TS 极简 Web UI：单文件模块（~150 行）实现 HTTP+SSE 服务 + 内嵌单页（无外部依赖）
- 与 Go 版行为对齐的关键点：随机端口、自动开浏览器（`open -g`）、lite 门控、进程退出即关
- init/menu 选项接回，端到端联动恢复

**Non-Goals:**
- 不恢复多会话面板、并发任务监控（Go 版为多模型引擎设计的能力）
- 不恢复任务日志系统
- 不引入前端框架/构建步骤（页面用内嵌 HTML 字符串）

## Decisions

### D-A: Web UI 作为 wrapper 内独立模块，事件源为改造后的结构化进度回调

**前置改造**：`src/wrapper/core.ts` 的进度回调从 `[PROGRESS]` 字符串行改为结构化载荷——`createOutputStreamParser` 的 opts 增加结构化 `onEvent(event: { name: string, sessionId?: string, contentType?: string, content?: string })`（保留现有字符串 `onProgress` 供终端展示，两者并存），`message`/`reasoning` 的 120 字符截断仅应用于终端展示行，结构化载荷传完整内容。

`src/wrapper/web-ui.ts` 导出 `startProgressServer(backend): { url, port, broadcast(event, fields), close() }`；`ly-wrapper.ts` 在非 lite 模式下启动，把结构化 onEvent 与最终 message 接到 `broadcast`；进程 close 事件触发 `close()`。事件载荷对齐 Go 版 ContentEvent 形态（session_id/backend/content/content_type/done）。

**事件映射表**（core.ts emit → SSE 事件）：

| core.ts 事件 | 载荷 | 页面行为 |
|---|---|---|
| session_started | {id} | 会话面板建立 |
| turn_started | — | 轮次标记 |
| cmd_done | {cmd, exit} | 命令区追加 |
| reasoning | {text} | 思考区追加（完整内容） |
| message | {text} | 结论区追加（完整内容） |
| session_completed / turn_completed | — | 轮次/会话完成标记 |
| wrapper 内部 broadcast(done) | {message, sessionId} | 展示最终报告，页面置为结束态 |

页面结束信号 = 后端进程 close 时 wrapper 发出的 `done` 事件（而非 session_completed——turn.completed 每轮都发，resume 多轮场景会多次出现），session_completed 仅作展示标记。

**SSE 载荷键名约定**：最终 SSE 事件统一 snake_case（`session_id`/`backend`/`content`/`content_type`/`done`，对齐 Go 版 ContentEvent）；结构化 onEvent 的 camelCase `sessionId` 仅存在于 wrapper 内部，进 SSE 前转换。`content_type` 映射：reasoning→`reasoning`、message→`message`、cmd_done→`command`。

**备选否决**：独立进程跑服务（多余的生命周期管理）；把页面做成独立构建产物（files 白名单复杂化，内嵌字符串最简）。

### D-B: lite 门控双通道，语义对齐 Go 版

`--lite` 标志（parseArgs 已解析，改为写入 config.lite）与环境变量 `CODEAGENT_LITE_MODE=true` 任一命中即不启动 Web UI。"减少日志"仅保留语义、不实际削减——wrapper 现状日志面已极窄（一行启动信息 + 进度行），无可削减对象。init 渲染的 `{{LITE_MODE_FLAG}}` 只产 `--lite `，env 通道留给手工调用方。

### D-C: 浏览器打开用平台命令直调

macOS `open -g <url>`、Linux `xdg-open`、Windows `start`（cmd）。打开失败静默（URL 已打印到终端，用户可手动点）。

### D-D: init/menu 选项

init 向导在"性能设置"相关步骤加"审查进度展示方式"（终端进度=lite / Web UI），写 `liteMode`；`ly menu` 显示设置项同步可改。`installer-template.ts` 的 `{{LITE_MODE_FLAG}}` 渲染逻辑确认在位（liteMode=true → `--lite `），无需改动即联动。

## Risks / Trade-offs

- [SSE 服务与审查主流程耦合，服务异常影响审查] → 服务内部全部 try/catch，启动失败降级为纯终端进度并打警告，SHALL NOT 让审查失败
- [浏览器自动打开干扰当前工作] → 沿用 Go 版 `open -g`（后台、不抢焦点）
- [存量用户升级后审查自动弹浏览器，属行为突变] → wrapper 启动 Web UI 时必须在终端打印 URL 与关闭方式（`--lite` / `CODEAGENT_LITE_MODE=true` / init 改配置），首次可见即可自行关闭；不额外做一次性升级提示（终端常驻提示已足够低成本）
- [内嵌 HTML 页面能力有限] → 定位是"实时进度预览"，非全功能控制台；保持极简

## Migration Plan

单分支一次实施；默认值 liteMode=false（Web UI 开启）与 Go 版默认行为一致。回滚 = revert。

## Open Questions

无。
