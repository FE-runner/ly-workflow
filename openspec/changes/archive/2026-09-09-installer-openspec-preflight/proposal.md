## Why

ly-workflow 的 OpenSpec 生命周期链（init/propose/apply/review-*/archive）硬依赖全局 openspec CLI 及其安装的 opsx 技能，但 `npx ly-workflow` 安装器没有任何前置检查——用户可以装完 ly-workflow 却在第一次调 `/ly:propose` 时才发现 Skill 失败，报错时机晚且信息生硬。`/ly:init` 模板虽有拦截引导，但用户必须先跑 init 才能受益；且 `ly doctor`/`ly status` 的体检范围完全不含 openspec。

## What Changes

- **新增共享前置检查 `checkExternalDeps()`**（`src/utils/preflight.ts`）：两级检测——① openspec CLI 是否存在（`openspec --version`）；② opsx 技能是否已装（`~/.claude/commands/opsx/` 目录存在，即跑过 `openspec init --tools claude`）
- **三个安装器入口接入**：`npx ly-workflow`（默认动作）、`ly init`、`ly menu` 在主流程开始前执行该检查——CLI 缺失时提示并询问是否就地 `npm install -g @fission-ai/openspec@latest`（用户拒绝则明确列出哪些 `/ly:*` 命令不可用后继续安装）；CLI 在但 opsx 技能缺失时非阻断提示"完成后运行 /ly:init"；全部就绪静默通过（不输出任何检查通过信息）
- **doctor/status 补检查项**：`ly doctor` 与 `ly status` 各增加 openspec CLI 与 opsx 技能两项体检结果展示（非阻断，只报告状态）
- **不做**：`ly update`/`ly uninstall` 不接入（update 时已装过；uninstall 无意义）；不做 openspec 版本下限校验；不自动静默安装（全局安装是改用户机器的动作，必须询问）

## Capabilities

### New Capabilities

- `installer-preflight-checks`：安装器入口的外部依赖前置检查——openspec CLI + opsx 技能两级检测、三入口接入时机、缺失态的用户交互（询问安装/非阻断提示/静默通过）与 doctor/status 的检查项展示

### Modified Capabilities

（无——现有 spec 均不涉及安装器入口的前置检查行为）

## Impact

- 新增：`src/utils/preflight.ts`（共享检查函数）+ 对应测试（`src/__tests__/`）
- 修改：`src/cli-setup.ts`（默认动作/init/menu 三处接入）、`src/commands/doctor.ts`（doctor + status 两个函数补检查项）、`src/i18n/index.ts`（preflight 相关文案，zh-CN/en 双语）
- 文档同步：根 `CLAUDE.md`（变更记录 + 模块职责提及）、`CHANGELOG.md`、`README.md`（若提及依赖/安装前提）
- 版本号：按发版规则三处同步 bump（package.json / codeagent-wrapper/main.go / src/utils/installer.ts）
- 不涉及：`templates/`（无命令模板改动）、`codeagent-wrapper/` 逻辑（仅版本号常量）、MCP 配置
