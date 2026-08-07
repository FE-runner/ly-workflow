## Purpose

提供五个薄壳 `/ly:*` 命令，直接委托给 Claude Code 原生 `init` 技能以及 OpenSpec 原生 `explore`/`propose`/`apply`/`archive` 技能，让用户拿到统一前缀的命令集，而不附加任何自定义编排逻辑。

## Requirements

### Requirement: init 命令串联 CLAUDE.md 生成与 OpenSpec 初始化
`/ly:init` 必须（SHALL）按顺序执行两步：（1）调用原生 `init` 技能生成/更新 CLAUDE.md；（2）确保 `openspec` CLI 已安装，然后运行 `openspec init` 搭建 `openspec/` 目录结构。两步都不得静默跳过；如果 `openspec` CLI 未安装，命令必须先安装它再继续。

#### Scenario: 全新项目, 既无 CLAUDE.md 也无 openspec/ 目录
- **WHEN** 用户在既无 CLAUDE.md 也无 `openspec/` 目录的项目中运行 `/ly:init`
- **THEN** 命令通过原生 `init` 技能生成 CLAUDE.md, 同时通过 `openspec init` 初始化 `openspec/`

#### Scenario: openspec CLI 未安装
- **WHEN** 用户运行 `/ly:init` 且 PATH 中找不到 `openspec` 命令
- **THEN** 命令先全局安装 `@fission-ai/openspec`, 再运行 `openspec init`

### Requirement: Explore/Propose/Apply/Archive 命令是纯委托
`/ly:explore`、`/ly:propose`、`/ly:apply`、`/ly:archive` 必须（SHALL）分别只调用对应的一个原生 OpenSpec 技能（依次为 `opsx:explore`、`opsx:propose`、`opsx:apply`、`opsx:archive`），原样转发 `$ARGUMENTS`。四者都不得包含自定义的多模型分派、环境校验，或超出底层技能本身的输出后处理逻辑。

#### Scenario: propose 命令原样转发参数
- **WHEN** 用户运行 `/ly:propose "add dark mode"`
- **THEN** 命令以未经改动的参数 `"add dark mode"` 调用 `opsx:propose` 技能

#### Scenario: archive 命令不附加额外行为
- **WHEN** 用户运行 `/ly:archive`
- **THEN** 命令调用 `opsx:archive` 技能, 前后不附加任何额外步骤
