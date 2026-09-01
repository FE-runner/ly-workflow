## MODIFIED Requirements

### Requirement: init 可选择审查后端（codex/hermes/openclaw，不含 claude）
`npx ly-workflow init` 的"选择审查模型"步骤必须（SHALL）提供 `codex`（默认）/`hermes`/`openclaw` 三个选项供用户选择；选择结果持久化为 `routing.reviewer`（有效值为这三个之一）。后续 `/ly:review-code`/`/ly:review-plan` 必须（SHALL）使用该值作为审查后端。若用户未显式修改, 默认必须是 `codex`（与现有行为一致）。`claude` 不再是合法的可选值——Claude（当前交互会话）已经是流程的总指挥，不应再被选为被调度的审查 backend。

#### Scenario: 默认后端为 codex
- **WHEN** 用户运行 `npx ly-workflow init` 且不修改"选择审查模型"步骤
- **THEN** `routing.reviewer` 保持默认值 `codex`, `/ly:review-code`/`/ly:review-plan` 以 `--backend codex` 运行

#### Scenario: 用户选择 hermes 作为审查后端
- **WHEN** 用户在 init 的"选择审查模型"步骤选择 `hermes`
- **THEN** `routing.reviewer` 为 `hermes`, 后续审查调用走 `--backend hermes`, wrapper 以 hermes 的 one-shot 模式执行

#### Scenario: 用户选择 openclaw 作为审查后端
- **WHEN** 用户在 init 的"选择审查模型"步骤选择 `openclaw`
- **THEN** `routing.reviewer` 为 `openclaw`, 后续审查调用走 `--backend openclaw`（embedded/local 模式）, 不要求启动 gateway

#### Scenario: 存量配置为 claude 时交互式向导要求重新选择
- **WHEN** 用户在 `routing.reviewer` 历史值为 `claude` 的项目中运行交互式 `npx ly-workflow init`
- **THEN** "选择审查模型"步骤不再展示 `claude` 选项，也不把它作为预选默认值，用户必须从 `codex`/`hermes`/`openclaw` 中重新选择

#### Scenario: 存量配置为 claude 时非交互升级路径静默重置
- **WHEN** 用户在 `routing.reviewer` 历史值为 `claude` 的项目中运行非交互 `npx ly-workflow update`
- **THEN** 升级流程静默将 `routing.reviewer` 重置为默认值 `codex`, 并在汇总中提示"检测到已移除的 claude 选项, 已重置为默认值", 不中断升级、不要求交互输入
