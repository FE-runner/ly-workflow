## 1. init.ts / update.ts 展示文案

- [ ] 1.1 `init.ts:188-189` 首屏 banner 从 "CCG - Claude + Codex + Gemini" / "Multi-Model Collaboration Workflow" 改为反映 Claude 主导+Codex 审查两角色定位的文案
- [ ] 1.2 `init.ts:993` `console.log`里`/ccg:${cmd}`前缀改为`/ly:${cmd}`
- [ ] 1.3 `update.ts:294` 同样的`/ccg:${cmd}`前缀改为`/ly:${cmd}`

## 2. menu.ts 展示层

- [ ] 2.1 `menu.ts:104-105` header 里的 "Claude + Codex + Gemini" / "Multi-Model Collaboration" 同步改成两角色文案
- [ ] 2.2 `menu.ts:164` 菜单项1描述"安装 CCG 工作流"去掉旧品牌名
- [ ] 2.3 `menu.ts:169` 菜单项6标签 "前端/后端模型切换" 改为准确描述（实际只是切换 reviewer: codex/claude），中英文都改
- [ ] 2.4 `menu.ts:176` 分组标题字面量`'CCG'`改为不带品牌名的分组名（如"帮助与卸载"）
- [ ] 2.5 `menu.ts:178` "移除 CCG 配置"去掉旧品牌名
- [ ] 2.6 `menu.ts:812` uninstall 结果里 `/ccg:${cmd}` 前缀改为 `/ly:${cmd}`

## 3. showHelp() 改为动态读目录（见 design.md 决策）

- [ ] 3.1 `showHelp()`（`menu.ts:242-292`）改用`fs.readdir(commandsDir)`读实际已装命令文件，替换掉手工列的`/ccg:spec-*`系列
- [ ] 3.2 用`installer.ts`里已有的`existingCommandNames`思路区分"核心命令"（对照`templates/commands/*.md`静态文件名）和"技能生成命令"（目录里其余文件）
- [ ] 3.3 核心命令逐个列名字+描述；技能命令只展示数量和分类概览（如"20个前端设计工具命令"），不逐个硬编码
- [ ] 3.4 `fs.readdir`失败时降级提示"运行 `ly init` 后查看已安装命令"，不让`ly menu`崩

## 4. doctor.ts 标题

- [ ] 4.1 `doctor.ts:152` "CCG Doctor" 改为 ly-workflow 对应命名
- [ ] 4.2 `doctor.ts:231` "CCG Status" 同样处理

## 5. cli-setup.ts help（区分两类调用场景，不能用同一种改法）

- [ ] 5.1 `cli-setup.ts:25-33`：全局装完后的裸命令示例，`ccg xxx` 改为 `ly xxx`
- [ ] 5.2 `cli-setup.ts:60-67`：临时运行示例，`npx ccg xxx` 改为 `npx ly-workflow xxx`（不是`npx ly`——npx 后接 npm 包名，不是 bin 名）
- [ ] 5.3 `cli-setup.ts:19` banner "CCG - Claude + Codex + Gemini" 同步改
- [ ] 5.4 `cli-setup.ts:33` "Uninstall CCG (non-interactive)" 去掉旧品牌名
- [ ] 5.5 `cli-setup.ts:179` `codex-mode` 用法提示里的 `ccg codex-mode` 改为 `ly codex-mode`
- [ ] 5.6 `cli-setup.ts:143` "Check CCG installation health" 去掉品牌名
- [ ] 5.7 `cli-setup.ts:148` "Show CCG installation status" 去掉品牌名
- [ ] 5.8 `cli-setup.ts:182-183,190` `uninstall`命令描述"Uninstall CCG workflows from ~/.claude/..."及输出"✓ CCG uninstalled"去掉品牌名

## 6. diagnose-mcp.ts 提示

- [ ] 6.1 `diagnose-mcp.ts:39` `npx ccg fix-mcp` 改为 `npx ly-workflow fix-mcp`
- [ ] 6.2 `diagnose-mcp.ts:83` `npx ccg diagnose-mcp` 改为 `npx ly-workflow diagnose-mcp`

## 7. installer.ts 用户可见输出

- [ ] 7.1 `installer.ts:246` 模板缺失时的命令占位符：`# /ccg:${cmd}` 改为 `# /ly:${cmd}`，"This command is part of CCG multi-model collaboration system." 改为不引用旧品牌/旧架构的描述
- [ ] 7.2 `installer.ts:763` 二进制下载失败提示"多模型协作命令 (/ccg:workflow, /ccg:plan 等)"——这两个命令名本身已不存在，改为准确列出实际依赖该二进制的命令（`review-plan`/`review-code`）

## 8. i18n 死 key 清理 + 活跃品牌文案

- [ ] 8.1 grep 确认 `i18n.t(` 调用里没有引用 `welcome`/`subtitle` 两个 key（中英文各一份），确认零引用后从 `i18n/index.ts` 删除
- [ ] 8.2 `i18n/index.ts:352,843`（`menu:title`）"CCG 主菜单"/"CCG Main Menu"去掉品牌名
- [ ] 8.3 `i18n/index.ts:37,528,354,845`（`initConfig`/`menu:options.init`）"初始化 CCG 多模型协作系统"/"初始化 CCG 配置"改为不含旧品牌/旧架构描述的文案
- [ ] 8.4 `i18n/index.ts:362,853,479,970`（`menu:options.uninstall`/卸载确认文案）"卸载 CCG"/"确定要卸载 CCG 吗..."去掉品牌名
- [ ] 8.5 `i18n/index.ts:367,858`（"CCG 命令 (v3):"）去掉品牌名，同时核对`v3`版本号标注是否也已过时（若过时一并去掉或更新）
- [ ] 8.6 `i18n/index.ts:115,606,194,685`（`apiSelfManaged`/`skipNoticeTitle`）"CCG 不介入"/"CCG 不会修改..."改为不含品牌名的等价描述

## 9. 模板文档路径纠错（统一盘点，不只挑一处）

- [ ] 9.1 `templates/skills/domains/frontend-design/SKILL.md:171` 把 `~/.claude/skills/ccg/impeccable/` 改为实际安装路径 `~/.claude/skills/ly/impeccable/`
- [ ] 9.2 `templates/skills/domains/frontend-design/agents/openai.yaml:4` 把 `~/.claude/skills/ccg/domains/frontend-design/SKILL.md` 改为 `~/.claude/skills/ly/domains/frontend-design/SKILL.md`
- [ ] 9.3 `templates/skills/tools/override-refusal/agents/openai.yaml:4` 把 `~/.claude/skills/ccg/tools/override-refusal/SKILL.md` 和 `~/.claude/skills/ccg/run_skill.js` 改为 `~/.claude/skills/ly/...` 对应路径

## 10. 验证

- [ ] 10.1 宽口径复查：`grep -rniE "ccg[^a-z-]|Claude \+ Codex \+ Gemini|Multi-Model Collaboration|/ccg:|npx ccg" src` 逐条过一遍，结果里每一条要么已改掉、要么写进下面的排除清单——不能是"搜出来的比任务列表多但没处理"
- [ ] 10.2 排除清单（明确不改，写明原因）：`templates/prompts/**`（下一个独立change范围）、`syncMcpToGemini`/`GrokSearch`相关代码、`.ccg`配置目录路径、`CcgConfig`类型等内部标识符
- [ ] 10.3 `pnpm typecheck && pnpm build` 过
- [ ] 10.4 本地跑一遍 `node bin/ly.mjs menu`：H帮助（确认核心命令+技能命令数量分组展示正常）、菜单项6、init首屏、`node bin/ly.mjs --help`、`node bin/ly.mjs doctor`、`node bin/ly.mjs status`、`node bin/ly.mjs uninstall`，确认文案对得上且没有崩溃
- [ ] 10.5 模拟"未安装任何技能命令"和"装了impeccable"两种状态各跑一次 `ly menu` 的 H 帮助，确认技能命令数量随实际状态变化
