## ADDED Requirements

### Requirement: 进度 Web UI（--lite 关闭时启动）
未指定 `--lite`/`-L` 标志且未设置环境变量 `CODEAGENT_LITE_MODE=true` 时，ly-wrapper 发起后端调用必须（SHALL）启动一个本地 HTTP+SSE 进度服务：监听随机空闲端口（port 0），自动用系统默认浏览器打开页面（macOS SHALL 以 `open -g` 后台打开，不抢占焦点）；页面实时展示审查事件流（会话开始/命令执行/思考/消息）并在审查结束后展示最终报告。服务启动时 wrapper 必须（SHALL）在终端打印服务 URL 与关闭方式（`--lite` 标志 / `CODEAGENT_LITE_MODE=true` 环境变量），使不希望弹浏览器的用户可立即自行关闭。后端进程退出（含超时/非零退出）时服务必须（SHALL）自动关闭，SHALL NOT 残留后台进程。

#### Scenario: 默认调用启动 Web UI 并自动开浏览器
- **WHEN** 命令模板以不含 `--lite` 的形态调用 `ly-wrapper --progress --backend codex - "$WORKDIR"`
- **THEN** wrapper 启动本地 SSE 服务并在随机端口上自动打开浏览器，审查事件实时出现在页面中，审查结束后页面显示最终报告，wrapper 进程退出时服务随之关闭

#### Scenario: lite 模式不启动 Web UI
- **WHEN** 调用带有 `--lite` 或 `-L` 标志（或环境变量 `CODEAGENT_LITE_MODE=true`）
- **THEN** wrapper 不启动任何 HTTP 服务，进度仅通过终端 `[PROGRESS]` 行展示（与瘦身后的现状一致）

#### Scenario: 异常退出不残留服务
- **WHEN** 后端进程超时被 kill 或以非零状态退出
- **THEN** SSE 服务与浏览器会话一并结束，本机无残留监听端口

### Requirement: --lite 标志语义为关闭 Web UI
`--lite` 标志的语义必须（SHALL）恢复为"不启动进度 Web UI、减少日志"（与 Go 版 lite 模式一致），SHALL NOT 再是"接受但不生效"的无操作标志。

#### Scenario: 模板透传 --lite 生效
- **WHEN** init 配置选择"终端进度"（liteMode=true），审查命令模板渲染出 `--lite` 标志
- **THEN** ly-wrapper 收到 `--lite` 后不启动 Web UI，仅终端展示进度
