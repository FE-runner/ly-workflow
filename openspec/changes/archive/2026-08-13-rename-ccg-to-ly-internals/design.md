## Context

见 proposal.md - Why。本文档只记录"怎么改"的关键决策，尤其是哪些字符串能直接改、哪些不能碰、以及顺手发现的既存 bug 怎么处理。

## Goals / Non-Goals

**Goals:**
- 把 `src/` 与 `templates/` 里所有描述性的 `Ccg`/`CCG`/`ccg` 残留统一改成 `Ly`/`LY`/`ly`
- 同步修正随手发现的、因命名不一致导致功能静默失效的 bug（`skill-router.js` 路径、installer 卸载数组与实际文件名不一致）
- 清理明确无用的历史残留（死代码、失效文档引用、无引用的 logo 资产）

**Non-Goals:**
- 不做任何向后兼容 / 双标记迁移设计（自用项目，明确不考虑老用户升级路径）
- 不修复 `src/utils/migration.ts` 里独立存在的旧 bug（`oldCcgDir` 值被误写成 `~/.ly`，导致 v1.3.x→v1.4.0 迁移早已静默失效）——这是另一个问题，混进本次改名会扩大 diff 且引入未经评估的行为变化
- 不给 `README.md`/`CHANGELOG.md`/`package.json` description 里的历史性文字改名（历史记录，不是当前状态描述）

## Decisions

**1. 区分"纯标识符改名"与"运行时字符串改名"两类，但都直接改，不加兼容层**
本来这两类风险不同（前者零行为影响，后者改变磁盘上的文件名/marker），但用户已明确本项目自用、不需要考虑老用户升级——所以不需要为后者设计"新旧两种都认"的兼容读取逻辑，直接把字符串值改掉即可。唯一要做的补偿动作是：改完代码后，在**这台机器上**手动清理已经用旧名字写下的产物（`~/.claude/rules/ccg-fast-context.md` 和 AGENTS.md/GEMINI.md 里的旧 marker），否则下次触发相关写入逻辑时会在旧内容旁边再追加一份新内容（因为新代码认不出旧 marker，会走"不存在则追加"分支）。

**2. `migration.ts` 排除在本次改动之外**
探索时发现 `oldCcgDir = join(homedir(), '.ly')` 是错的（本该是 `.ccg`，用来查找真正的旧版目录），这是先前某次改名操作误伤的产物，属于独立 bug。修复它涉及"迁移逻辑该不该继续存在"这个更大的问题（自用项目还需要不需要兼容 v1.3.x 的老布局），超出本次"改名"范围，所以本次只重命名会被波及的标识符——但 `migration.ts` 干脆整个跳过不动，避免在同一个 diff 里混入两个不同性质的决策。

**3. `skill-router.js` 与 installer 卸载数组的 bug 修复，视为改名的自然结果而非额外范围**
`skill-router.js` 检查 `~/.claude/skills/ccg/` 存在与否来决定是否注入域知识提示——但实际安装目录早就是 `skills/ly/`（installer.ts 里的写入路径已经改过）。把检查路径里的 `ccg` 改成 `ly` 既是"改名"的一部分，又顺带修复了这个功能。同理，`installer.ts` 卸载数组里已经有一行写成 `ly-workflow.py`，但当时对应的模板文件还叫 `ccg-workflow.py`——这次把模板文件也重命名为 `ly-workflow.py`，两边自然对齐，不需要额外的兼容判断。

**4. 模板文件重命名用 `git mv`，不是复制+删除**
`templates/codex/agents/ccg-*.toml`、`templates/codex/hooks/ccg-workflow.py` 用 `git mv` 保留文件历史，而不是新建文件再删旧文件。

**5. 项目根目录 `.ccg/tasks|spec` 改为 `.ly/tasks|spec`，与内存态 XML 标签一起改**
这两个目录名和 `subagent-context.js` 里的 `<ccg-active-task>` 等标签同属"任务上下文注入"这一个功能域，放在一起改，避免留下half-renamed 的中间状态（比如目录改了但标签没改，看起来更混乱）。

## Risks / Trade-offs

- **[风险]** 改名后如果这台机器上还残留旧的 `~/.claude/rules/ccg-fast-context.md` 或 AGENTS.md/GEMINI.md 里的旧 marker，下次触发写入会导致新旧内容并存 → **[缓解]** 实施任务里包含一步"本机一次性清理"，在改完代码之后手动执行
- **[风险]** `templates/prompts/**/*.md` 删除过时的 `> For: /ccg:...` 行属于内容删除而非纯改名，如果之后有人想恢复这些历史上下文会找不到 → **[缓解]** 这些引用指向的命令在当前代码里根本不存在（已用 grep 确认过），不是"暂时未接线"而是"从未存在于当前产品形态"，删除不会丢失任何仍然有效的信息；git 历史里仍能查到
- **[风险]** `assets/logo/ccg-*.png` 删除后，如果未来想恢复品牌视觉资产会找不到 → **[缓解]** 已确认全仓库无任何引用（代码/文档/package.json 都没有），且用户已明确表示不需要 logo

## Migration Plan

不需要迁移脚本或回滚设计（自用项目，直接改）。实施顺序：先改 `src/` 代码标识符（低风险，编译期能捕获遗漏），再改运行时文件名/marker + 同步更新对应的 installer 逻辑，再做内容清理（prompts 引用、死代码、logo），最后跑一次 `pnpm typecheck && pnpm build` 加全仓库 grep 复查，再执行本机一次性清理。

## Open Questions

（无——探索阶段已经和用户确认了所有范围边界：prompts 过时引用删除、死代码删除、logo 删除、migration.ts 不动）
