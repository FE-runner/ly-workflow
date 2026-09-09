## Purpose

让 ly-workflow 安装器在入口处检测 OpenSpec 依赖（CLI 二进制 + opsx 技能），把"装了 ly-workflow 但 OpenSpec 生命周期命令不可用"的发现时机从第一次命令调用前移到安装期，并为 doctor/status 提供体检项。

## ADDED Requirements

### Requirement: 安装器入口执行 OpenSpec 依赖前置检查
`npx ly-workflow` 默认动作、`ly init`、`ly menu` 三个入口 SHALL 在主流程开始前执行共享的 OpenSpec 依赖前置检查。检查 SHALL 分两级：① openspec CLI 是否存在（执行 `openspec --version` 判定）；② opsx 技能是否已安装（`~/.claude/commands/opsx/` 目录存在，即已跑过 `openspec init --tools claude`）。`ly update`、`ly uninstall` 及其余子命令 SHALL NOT 执行该检查。

#### Scenario: CLI 与技能齐备时静默通过
- **WHEN** 用户执行 `npx ly-workflow`，openspec CLI 存在且 opsx 技能已安装
- **THEN** 检查静默通过（SHALL NOT 输出任何"检查通过"类信息），安装器主流程照常进行

#### Scenario: update 与 uninstall 不执行前置检查
- **WHEN** 用户执行 `ly update` 或 `ly uninstall`
- **THEN** 不出现任何 openspec 依赖检查行为或相关提示

### Requirement: openspec CLI 缺失时询问是否就地安装
前置检查发现 openspec CLI 不存在时，SHALL 提示该依赖缺失并询问用户是否就地执行 `npm install -g @fission-ai/openspec@latest`。用户同意 → 执行安装；安装完成后 SHALL 复用技能检测函数二次判定：opsx 技能已存在（CLI 缺失但技能目录残留的场景）则提示"openspec 已可用"，否则提示"运行 /ly:init 完成 openspec init 后 OpenSpec 生命周期命令可用"。安装失败 SHALL 如实报告错误并继续安装器主流程（SHALL NOT 中断退出）。用户拒绝 → SHALL 明确列出直接依赖 openspec CLI/opsx 技能、缺失时不可用的命令清单（`/ly:init` `/ly:explore` `/ly:propose` `/ly:review-plan` `/ly:archive`），并说明 `/ly:apply`/`/ly:review-code` 仅依赖项目内 change 目录结构、不受全局 CLI 缺失直接影响，以及 Git 工具链与质量关卡照常可用，然后继续安装器主流程。两种情况下 ly-workflow 自身的安装 SHALL NOT 被阻断。

#### Scenario: 用户同意就地安装且安装成功（含技能目录残留边界）
- **WHEN** 检查发现 openspec CLI 缺失，用户同意就地安装，`npm install -g @fission-ai/openspec@latest` 成功
- **THEN** 复用技能检测函数二次判定：opsx 技能已存在（曾装过 openspec 后卸载 CLI 的残留场景）则提示"openspec 已可用"；否则提示"运行 /ly:init 完成 openspec init 后 OpenSpec 生命周期命令可用"，安装器主流程继续

#### Scenario: 非 TTY 环境跳过询问按拒绝口径继续
- **WHEN** 检查发现 openspec CLI 缺失，但当前运行环境非交互终端（CI、管道执行），无法进行确认询问
- **THEN** 跳过安装询问，按"用户拒绝"同等口径输出不可用清单提示后继续安装器主流程，SHALL NOT 挂起等待输入

#### Scenario: 用户拒绝安装
- **WHEN** 检查发现 openspec CLI 缺失，用户拒绝就地安装
- **THEN** 输出依赖 openspec 的命令清单不可用的提示（说明 Git 工具链等其余命令不受影响），安装器主流程继续，不中断、不重复询问

#### Scenario: 就地安装失败不阻断安装器
- **WHEN** 用户同意就地安装但 npm 安装失败（网络错误、权限不足等）
- **THEN** 如实报告 npm 原始错误，按"用户拒绝"同等口径继续安装器主流程

### Requirement: CLI 在但 opsx 技能缺失时非阻断提示
前置检查发现 openspec CLI 存在但 `~/.claude/commands/opsx/` 不存在时，SHALL 输出一次性非阻断提示："检测到 openspec CLI 已安装但 OpenSpec 命令技能未初始化，完成后运行 /ly:init 初始化"，SHALL NOT 询问、SHALL NOT 阻断、SHALL NOT 自动代跑 `openspec init`。

#### Scenario: 技能缺失仅提示不阻断
- **WHEN** openspec CLI 存在但用户尚未在任何项目跑过 `openspec init --tools claude`，执行 `ly init`
- **THEN** 安装器输出一次初始化提示后照常继续主流程，无额外询问

### Requirement: doctor/status 展示 OpenSpec 依赖状态
`ly doctor` 与 `ly status` SHALL 各增加两项结果展示：openspec CLI 是否安装（含检测到的版本号）、opsx 技能是否已初始化。两者均为状态报告项，SHALL NOT 阻断 doctor/status 流程。检查逻辑 SHALL 复用与前置检查相同的核心检测函数（SHALL NOT 各自实现一套判定）。

#### Scenario: doctor 报告 openspec 状态
- **WHEN** 用户执行 `ly doctor`，openspec CLI 已安装（版本 1.7.0）但 opsx 技能未初始化
- **THEN** doctor 输出中 openspec CLI 项显示已安装及版本，opsx 技能项显示未初始化（含"运行 /ly:init"引导），doctor 整体流程不受影响

#### Scenario: status 与 doctor 判定一致
- **WHEN** 同一环境下先后执行 `ly doctor` 与 `ly status`
- **THEN** 两者的 openspec CLI / opsx 技能状态判定一致（同一检测函数产出）
