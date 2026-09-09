## Context

见 proposal.md — Why。现状事实：

- `src/cli-setup.ts` 的 `setupCommands()` 是全部命令注册点；默认动作直接调 `showMainMenu()`，`init` 调 `init(options)`，`menu` 调 `showMainMenu()`
- i18n 为内联资源：`src/i18n/index.ts` 中 zh-CN/en 对象字面量（命名空间式），无独立 JSON 文件
- `src/commands/doctor.ts` 已有 `doctor()`（体检，含 Codex mode 检测）与 `status()`（第 169 行起）两个导出
- 测试位于 `src/__tests__/`（vitest）
- openspec 探测方式：`openspec --version` 子进程执行；opsx 技能落盘位置 `~/.claude/commands/opsx/`（本机实测确认该目录即 openspec init 产物）

## Goals / Non-Goals

**Goals:**
- 依赖缺失的发现时机前移到安装器入口
- doctor/status 获得同一事实源的体检项
- 缺失态的用户交互清晰：可装（问一次）、不可用清单（说明白）、不阻断

**Non-Goals:**
- 不做 openspec 版本下限校验（存在性即可，版本兼容问题出现后再说）
- 不自动代跑 `openspec init`（那是项目级初始化，属 `/ly:init` 职责，安装器不越界）
- 不接入 `update`/`uninstall`（见 proposal 不做清单）
- 不改任何 `templates/` 命令模板

## Decisions

### 决策 1：独立 `src/utils/preflight.ts`，导出两级检测函数与编排入口
- `detectOpenspecCli(): Promise<{ installed: boolean; version?: string }>`——子进程跑 `openspec --version`，超时/非零/不存在一律判定未安装（版本号仅用于展示）
- `detectOpsxSkills(): Promise<boolean>`——`fs.existsSync(join(homedir(), '.claude', 'commands', 'opsx'))` 目录判定
- `checkExternalDeps(): Promise<void>`——编排入口，含交互（询问安装/缺失清单提示/静默通过），供 cli-setup 三入口调用
- doctor/status 只消费前两个检测函数，不调编排入口（它们只报告、不交互）
- 备选：塞进 `doctor.ts` 或 `installer.ts`——被否，preflight 是横切关注点，doctor/installer/menu 三个消费方共享一个模块最干净

### 决策 2：三入口的接入点在 action 回调内、i18n 初始化之后
`cli-setup.ts` 三个 action 回调里、现有 `initI18n` 完成后调用 `checkExternalDeps()`——保证提示文案用用户选定的语言。默认动作与 menu 本就调 `showMainMenu()`，检查放在其前一行；init 放在 `init(options)` 前。不放在 `setupCommands()` 顶部全局执行——`doctor`/`diagnose-mcp` 等子命令不该触发检查（spec 的 SHALL NOT 范围）。

### 决策 3：CLI 缺失的安装询问用现有 inquirer confirm 惯例
安装器已有 inquirer 依赖与确认询问模式（init 向导），复用同款 confirm。`npm install -g` 经子进程执行并透传输出，失败捕获后按"拒绝"口径继续（报告原始错误）——两分支最终都返回主流程，编排入口不抛异常中断。

### 决策 4：opsx 技能缺失的提示措辞区分两级失败态
CLI 缺失 = "没装包"（可就地装）；技能缺失 = "装了包没初始化"（引导 /ly:init）。两者文案必须不同——否则用户装了包还看到同一条提示会困惑。技能缺失态 SHALL NOT 询问（无事可问，只剩引导）。

## Risks / Trade-offs

- **[opsx 技能落盘路径可能随 openspec 版本变化]**（`~/.claude/commands/opsx/` 是当前 openspec 1.7.x 的产物位置）→ 检测函数把路径常量收口在一处；若未来 openspec 改了安装位置，只改一个常量
- **[子进程探测在启动路径上增加一次命令执行]**（无 openspec 环境下 `which` 级失败很快；有 openspec 环境 ~几十 ms）→ 可接受；不做缓存——CLI 是一次性短进程，缓存无意义
- **[npm install -g 可能需要额外权限]**（nvm 环境通常无感，系统 node 可能 EACCES）→ 失败不阻断、如实报告，用户可自行处理后再跑

## Migration Plan

纯增量代码 + 文案，无存量状态迁移，无安装产物结构变化。回滚 = revert。

## Open Questions

（无——探索阶段已收敛三方向 A/B/C 的取舍，本方案即 A+B 组合，C（/ly:propose 入口自检）明确不做。）
