## Purpose

审查进度展示方式（终端进度 / Web UI）的选择契约：init 向导提供选项、写入 liteMode 配置、经 `{{LITE_MODE_FLAG}}` 模板变量渲染进审查命令、以 `--lite` 标志透传到 ly-wrapper——四层联动的端到端行为。

## Requirements

### Requirement: init 向导提供审查进度展示方式选项
`npx ly-workflow init` 向导必须（SHALL）提供"审查进度展示方式"步骤：终端进度（对应 liteMode=true）与 Web UI（浏览器实时预览，liteMode=false）二选一；选择结果写入 ly-workflow 配置的 `liteMode` 字段。`ly menu` 的性能/显示设置入口必须（SHALL）可查看并修改该值。存量配置缺失该字段时按 `false`（Web UI 开启）处理。

#### Scenario: init 选择 Web UI
- **WHEN** 用户在 init 向导中选择"Web UI（浏览器实时预览）"
- **THEN** 配置写入 `liteMode: false`，此后审查命令模板渲染时不带 `--lite` 标志

#### Scenario: menu 修改展示方式
- **WHEN** 用户在 `ly menu` 的显示设置中将进度展示方式改为"终端进度"
- **THEN** 配置 `liteMode` 更新为 `true`，此后审查命令模板渲染出 `--lite` 标志

### Requirement: 展示方式经模板渲染与 --lite 透传到 wrapper
`{{LITE_MODE_FLAG}}` 模板变量必须（SHALL）按 liteMode 配置渲染：liteMode=true 时输出 `--lite `（含尾随空格），false 时输出空串。审查命令（review-plan/review-code 及外部 implementer 的 apply 调用）最终必须（SHALL）把该标志透传给 ly-wrapper，由其决定是否启动进度 Web UI。

#### Scenario: 端到端联动
- **WHEN** 配置 liteMode=false，用户运行 `/ly:review-plan <change>`
- **THEN** 命令构造的 wrapper 调用不含 `--lite`，ly-wrapper 启动进度 Web UI 并自动打开浏览器

#### Scenario: 渲染格式约束
- **WHEN** liteMode=true 时模板渲染 `{{LITE_MODE_FLAG}}--backend codex ...`
- **THEN** 渲染结果为 `--lite --backend codex ...`（标志与后续参数间保持一个空格，不产生粘连或多余空格）
