## Context

见 proposal.md。全是字符串常量/文案替换，无架构改动。

## Goals / Non-Goals

**Goals:**
- 展示层文案跟当前 Claude+Codex 两角色定位保持一致；命令清单展示改为动态反映实际安装状态，不再手工维护固定数字（12个静态核心命令+按需展示的技能命令数量）

**Non-Goals:**
- 不碰 `syncMcpToGemini()`、Grok Search MCP（独立功能，见 proposal.md 说明）
- 不改内部标识符（`CcgConfig` 类型、`.ccg` 配置目录等）——CLAUDE.md 已注明这些有意保留 `Ccg` 前缀
- 不改配置文件结构、不改 `ModelRouting` 类型定义（只改菜单项标签文字，不改其背后调用的 `configModelRouting()` 逻辑）

## Decisions

- **逐文件定点替换，不批量 sed 全局 s/ccg/ly/**：用户可见字符串（banner/菜单/help）和内部标识符（`.ccg`目录、`CcgConfig`类型、npm包内部路径 `~/.claude/.ccg/`）混用同一个词 `ccg`，全局替换会误伤内部实现。逐处核对上下文再改。
- **showHelp() 改成运行时读目录，不再手工枚举**：第一版"对照templates/commands/列7个/12个"这条路线被两轮审查证明会跟"技能动态生成命令"这个事实脱节——只要有人往`templates/skills/`加一个`user-invocable:true`的技能，手工列表就又过时。改为：`fs.readdir(commandsDir)`拿到实际文件列表，用`existingCommandNames`（installer.ts里已有的、区分"installer-data.ts静态命令"和"skill生成命令"的那个Set）分组展示——核心命令列名字，技能命令只展示数量（如"20个前端设计工具命令，含polish/audit/animate等"），不逐个硬编码名字。这样列表永远跟实际安装状态一致。
- **doctor.ts 标题只改字面文案（"CCG Doctor"→"ly-workflow Doctor" 或类似），不改函数名/变量名**——保持内部实现不动，只动 `console.log` 里的字符串。
- **品牌文案范围划一条明确边界，不是"改到哪算哪"**：`src/`下所有CLI直接输出（console.log、i18n活跃key、命令描述）都在范围内，包括`i18n/index.ts`里非死key但含"CCG"品牌名的菜单标题/init描述/卸载确认文案（第三轮审查发现的缺口）。**明确排除**`templates/prompts/**`（codex/claude审查角色提示词，体量大、属于prompt内容而非CLI UI文案，属于下一个独立change的范围）和内部标识符（`.ccg`目录、`CcgConfig`类型）。这条边界写进本文件是为了防止"品牌盘点"这个子任务无限扩大到把整个仓库过一遍。

## Risks / Trade-offs

[风险] 手动逐处改，可能漏改某个隐藏的 banner/文案 → 缓解：验证阶段用宽口径grep（含裸`CCG`、`/ccg`不带冒号、`ccg `带空格等变体）复查，结果里每一条要么改掉、要么明确写进排除清单说明原因（`templates/prompts/**`、`syncMcpToGemini`/`GrokSearch`、`.ccg`目录/`CcgConfig`类型），不能是"搜出来的东西比任务列表多但没人管"
[风险] i18n 死 key 清理时误删还在用的 key → 缓解：删前用 grep 确认 `i18n.t('...welcome')` / `i18n.t('...subtitle')` 全局零引用
[风险] showHelp()改成动态读目录，如果`commandsDir`在某些环境下不存在或读取失败 → 缓解：`fs.readdir`包在try/catch里，读取失败时降级显示"运行 `ly init` 后查看已安装命令"提示，不让help命令本身崩溃
