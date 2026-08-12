## Why

项目从 `ccg-workflow` 改名为 `ly-workflow` 时（v1.0.0/v1.1.0）只清理了对外展示层，内部代码标识符、部分运行时文件名/marker 字符串、以及历史遗留的模板内容仍大量保留旧品牌名 `Ccg`/`CCG`/`ccg`（`src/CLAUDE.md:41` 已记录为已知技术债）。本项目仅自用，不需要考虑老用户升级兼容，可以直接把这些残留清理干净，不必设计双标记兼容/迁移 shim。

## What Changes

- 机械重命名 `src/` 下（除 `src/utils/migration.ts` 外——该文件全部内容，包括其中的旧品牌残留、注释、字符串，均豁免于本次改名，原因见下方 Impact）纯代码标识符/注释里的 `Ccg`/`CCG`/`ccg`（类型名、函数名、常量名、JSDoc、日志文案）
- 运行时文件名与 marker 字符串直接改名，不留兼容层：
  - `~/.claude/rules/ccg-fast-context.md` → `ly-fast-context.md`，`<!-- CCG-FAST-CONTEXT-* -->` → `<!-- LY-FAST-CONTEXT-* -->`
  - `~/.claude/rules/ccg-grok-search.md` → `ly-grok-search.md`，`<!-- CCG-GROK-SEARCH-PROMPT-* -->` → `<!-- LY-GROK-SEARCH-PROMPT-* -->`
  - `~/.codex/.ccg-version` → `~/.codex/.ly-version`
  - `.ccg-update-bak` → `.ly-update-bak`（`update.ts` 备份后缀）
  - `<!-- CCG:START/END -->` → `<!-- LY:START/END -->`（`~/.codex/AGENTS.md` 管理标记）
  - `templates/codex/agents/ccg-*.toml` 三个文件重命名为 `ly-*.toml`；`templates/codex/hooks/ccg-workflow.py` 重命名为 `ly-workflow.py`，同步更新 `hooks.json` 里的命令路径
  - 项目根目录的 `.ccg/tasks/`、`.ccg/spec/` 改为 `.ly/tasks/`、`.ly/spec/`；`subagent-context.js` 里的内存态 XML 标签 `<ccg-*>` 改为 `<ly-*>`
- 顺手修复两个因命名不一致导致的既存 bug（改名后自然对齐）：
  - `templates/hooks/skill-router.js` 硬编码检查 `~/.claude/skills/ccg/`，但实际安装路径早已是 `skills/ly/` —— 域知识自动注入功能因此静默失效，改名后恢复正常
  - `src/utils/installer.ts` 卸载逻辑与安装产出的文件名不一致（`ccg-*.toml` vs 卸载数组里已经写成 `ly-workflow.py`），改名后统一
- 删除 `installer.ts` 里未被调用的死代码 `installCcgEntryCommand()`（对应模板文件已不存在）
- 删除 `templates/prompts/codex/*.md`、`templates/prompts/claude/*.md`（共 14 个文件）里引用不存在命令的过时 `> For: /ccg:...` 行
- 删除 `assets/logo/ccg-*.png`（17 个文件，已确认无任何代码/文档引用，不需要 logo）

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

（无 —— 本次是内部标识符重命名 + 顺手修复因命名不一致导致的死功能，不引入新的对外行为契约。skill-router.js/AGENTS.md marker 等变化属于恢复既定设计的原本行为，不是新增需求）

## Impact

- **代码**：`src/types/`、`src/utils/config.ts`、`src/utils/installer.ts`、`src/utils/installer-mcp.ts`、`src/utils/installer-prompt.ts`、`src/utils/skill-registry.ts`、`src/commands/{init,menu,doctor,update,config-mcp}.ts`、`src/cli-setup.ts`、`src/index.ts`
- **模板**：`templates/codex/agents/*.toml`（重命名）、`templates/codex/hooks/*.py`（重命名）、`templates/codex/hooks.json`、`templates/codex/AGENTS.md`、`templates/hooks/{session-start,task-utils,subagent-context,skill-router}.js`、`templates/prompts/{codex,claude}/*.md`
- **资产**：`assets/logo/ccg-*.png` 整批删除
- **不涉及**：`src/utils/migration.ts`（整份文件豁免，含其中所有旧品牌字符串/注释——该文件有一个独立于本次改名的既存 bug，修复超出本次范围）、`README.md`/`CHANGELOG.md`（历史文档不改）、`package.json` description 里的历史性 "forked from ccg-workflow"（历史事实不改）
- **执行阶段的本机清理**（非代码改动）：删除本机现存的 `~/.claude/rules/ccg-fast-context.md`；清掉 `~/.codex/AGENTS.md`/`~/.gemini/GEMINI.md` 里的旧 `<!-- CCG-FAST-CONTEXT-* -->` 标记块；若本机存在 `~/.claude/rules/ccg-grok-search.md`、旧 `<!-- CCG-GROK-SEARCH-PROMPT-* -->` 标记、`~/.codex/.ccg-version`、`~/.codex/agents/ccg-*.toml`、`~/.codex/hooks/ccg-workflow.py`、`*.ccg-update-bak` 备份文件，一并作为无主残留清理（新代码不再识别这些旧名称）
