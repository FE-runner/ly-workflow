## Why

CLI 展示层（banner、菜单、help、doctor 输出）还留着旧三模型架构（Claude+Codex+Gemini / Multi-Model Collaboration）文案，跟当前 Claude+Codex 两角色定位互相矛盾，也跟已删除的 `/ccg:spec-*` 命令、"前端/后端模型切换"概念对不上。用户跑 `npx ly-workflow@latest` 第一眼看到的 banner 就和代码实际行为冲突，`ccg help` 列出的命令全是不存在的。纯展示文案错误，不修的话每个新用户都会被误导。

## What Changes

- `init.ts:188` 首屏 banner 由 "CCG - Claude + Codex + Gemini / Multi-Model Collaboration Workflow" 改为反映实际两角色定位（Claude 主导 + Codex 审查）
- `menu.ts` header 同样文案（Claude + Codex + Gemini / Multi-Model Collaboration）同步改
- `menu.ts` 菜单项6标签 "前端/后端模型切换" 改为准确描述（实际只切换 reviewer：codex/claude）
- `menu.ts` `showHelp()` 函数不再手工枚举命令清单（上一版"12个真实命令"仍是错的——安装器还会从`templates/skills/**/SKILL.md`动态扫描`user-invocable:true`的技能生成额外命令，当前动态部分有28个：20个impeccable+6个tools+frontend-design+scrapling，实际可用命令数随用户是否装impeccable在20~40+之间浮动，不是固定数字）。改为运行时读取`~/.claude/commands/ly/`目录实际文件列表，分两组展示：**核心命令**（匹配`templates/commands/*.md`静态清单的12个）+ **技能命令**（目录里其余文件，按数量展示，不逐个写死名字）。这样以后不管装不装impeccable、以后加不加新技能，help输出都自动跟实际安装状态一致，不会再变成手工维护清单又跟实际脱节
- `menu.ts`菜单项1描述"安装 CCG 工作流"改为不含旧品牌名的描述；`menu.ts:176`分组标题`'CCG'`改为不带品牌名的分组名（如"帮助与卸载"）；`menu.ts:178`"移除 CCG 配置"同步改；`cli-setup.ts:33`"Uninstall CCG (non-interactive)"同步改
- `installer.ts:246`（模板缺失时的命令占位符内容，含`# /ccg:${cmd}`和"This command is part of CCG multi-model collaboration system."）改为不引用旧命令前缀和旧品牌描述的占位符文案
- `installer.ts:763`二进制下载失败提示"多模型协作命令 (/ccg:workflow, /ccg:plan 等) 需要此文件才能工作"——`/ccg:workflow`、`/ccg:plan`这两个命令本身也不存在（早已随多模型引擎删除），改为准确描述当前哪些命令依赖该二进制（`review-plan`/`review-code`）
- `cli-setup.ts:143,148,182,183,190`（`doctor`/`status`/`codex-mode`用法提示/`uninstall`命令描述及"✓ CCG uninstalled"输出）去掉品牌名
- `doctor.ts` 标题 "CCG Doctor" / "CCG Status" 统一为 ly-workflow 命名
- `i18n/index.ts` 中活跃（非死key）但含"CCG"品牌名的用户可见文案统一处理：菜单标题（`'CCG 主菜单'`/`'CCG Main Menu'`）、init描述（`'初始化 CCG 配置'`/`'初始化 CCG 多模型协作系统'`）、卸载相关（`'卸载 CCG'`/`'确定要卸载 CCG 吗...'`）、`'CCG 命令 (v3):'`标题（连带核对`v3`版本号标注是否也过时）、`apiSelfManaged`/`skipNoticeTitle`里的"CCG 不介入"/"CCG 不会修改"这类描述性提及
- **明确排除、不在本次范围内**：`.ccg`配置目录路径、`CcgConfig`类型等内部标识符（CLAUDE.md已注明有意保留）；`templates/prompts/**`目录下的历史提示词文本（体量大、且是prompt内容不是CLI直接展示的UI文案，留给后续单独盘点，不在这次"CLI展示层"范围内打包处理）
- `cli-setup.ts` help 输出区分两类调用场景，不能混用同一改法：
  - 全局装完用 `ly xxx`（[cli-setup.ts:25-33](../../../src/cli-setup.ts) 的裸命令示例）
  - 未全局装、临时跑用 `npx ly-workflow xxx`（[cli-setup.ts:60-67](../../../src/cli-setup.ts) 的 `npx` 示例，不能写成 `npx ly`——npx 后面接的是 npm 包名 `ly-workflow`，不是 bin 名 `ly`）
- 补齐上一轮审查漏掉的用户可见输出：`init.ts:993`（`/ccg:${cmd}` 前缀）、`update.ts:294`（同样前缀）、`diagnose-mcp.ts:39,83`（`npx ccg fix-mcp` / `npx ccg diagnose-mcp` 提示）
- 清理 `i18n/index.ts` 中未被引用的死 key：`welcome`、`subtitle`（中英文两份）
- 模板内已安装路径统一盘点修复，不只挑一处：`templates/skills/domains/frontend-design/SKILL.md:171`、`templates/skills/domains/frontend-design/agents/openai.yaml:4`、`templates/skills/tools/override-refusal/agents/openai.yaml:4`——三处都写着不存在的 `~/.claude/skills/ccg/...`，实际路径是 `~/.claude/skills/ly/...`

**不改动**：`syncMcpToGemini()`、Grok Search MCP 相关代码——这两个是独立功能（把 MCP 配置镜像到用户自己装的 Gemini CLI；接入第三方 Grok 搜索工具），跟被删除的"Gemini 作为前端模型 backend"无关，容易被误认成同一批要删的东西。

## Capabilities

无 spec 级行为变更——纯展示文案/字符串修正，底层功能、命令实际行为不变。本变更在 `.openspec.yaml` 中标记 `skip_specs: true`。

### New Capabilities
（无）

### Modified Capabilities
（无）

## Impact

- 受影响文件：`src/commands/init.ts`、`src/commands/update.ts`、`src/commands/menu.ts`、`src/commands/doctor.ts`、`src/commands/diagnose-mcp.ts`、`src/cli-setup.ts`、`src/utils/installer.ts`、`src/i18n/index.ts`、`templates/skills/domains/frontend-design/SKILL.md`、`templates/skills/domains/frontend-design/agents/openai.yaml`、`templates/skills/tools/override-refusal/agents/openai.yaml`
- 无 API/依赖变更，`showHelp()`改为运行时读目录展示是本变更唯一带有一点行为性质的改动（用户看到的输出会随实际安装状态变化，而非固定文案），但不改变任何命令的实际功能，仍属于展示层调整，维持`skip_specs: true`
- 无需数据迁移，无破坏性变更（**非 BREAKING**）
- 与 `fix-impeccable-uninstall` 的交叉点：本变更改的 `frontend-design/SKILL.md` 文档里提到 impeccable 命令路径，但不描述"impeccable 被跳过安装时该提示什么"——那部分行为留给 `fix-impeccable-uninstall` 处理，本变更只修路径文字，不新增可用性判断逻辑。`showHelp()`改成动态读目录后，该问题天然消失（装了才会出现在列表里），两个change之间不需要额外协调
