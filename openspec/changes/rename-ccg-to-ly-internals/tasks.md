## 1. 代码标识符重命名（src/，低风险，可编译验证）

- [ ] 1.1 `src/types/index.ts`、`src/types/cli.ts`：`CcgConfig` → `LyConfig`，相关注释同步
- [ ] 1.2 `src/utils/config.ts`：`CCG_DIR`→`LY_DIR`、`getCcgDir`→`getLyDir`、`ensureCcgDir`→`ensureLyDir`、`readCcgConfig`→`readLyConfig`、`writeCcgConfig`→`writeLyConfig`，注释同步
- [ ] 1.3 `src/utils/installer-mcp.ts`：`CCG_MCP_IDS`→`LY_MCP_IDS`、`getCcgMcpServersFromClaude`→`getLyMcpServersFromClaude`、`mirrorCcgServers`→`mirrorLyServers`，注释同步
- [ ] 1.4 `src/utils/installer.ts`：`ccgLegacyItems`/`ccgFiles`/`ccgHookDefs`/`ccgCommand`/`ccgConfigDir`/`hooksCcgDir`/`isCcgEntry` 等变量重命名为 `ly*`；修正沿途已经过时的注释（如误写成 `skills/ccg/`/`hooks/ccg/`/`commands/ccg/` 的路径描述，实际早已是 `ly` 路径）
- [ ] 1.5 `src/utils/skill-registry.ts`：JSDoc 里 `~/.claude/skills/ccg/` 改成实际路径 `skills/ly/`
- [ ] 1.6 `src/commands/init.ts`、`src/commands/menu.ts`、`src/commands/doctor.ts`、`src/commands/update.ts`、`src/cli-setup.ts`、`src/index.ts`：更新对 1.1-1.3 重命名函数/类型的调用点；`init.ts` 里的 `BACK_SENTINEL`/`CANCEL_SENTINEL`、`menu.ts`/`update.ts` 里的 `CCG_UPDATE_MODE` 改为 `ly` 前缀；修正 `init.ts:1027` 打印 `ccg-skills.md` 的错误提示（应为 `ly-skills.md`）
- [ ] 1.7 确认 `src/utils/migration.ts` 未被本轮改动波及（保持原样，范围决策明确排除）
- [ ] 1.8 `pnpm typecheck` 通过，确认 1.1-1.6 没有遗漏的引用

## 2. 运行时文件名 / marker 字符串改名

- [ ] 2.1 `src/utils/installer-prompt.ts`：`FC_MARKER_START/END` 改为 `<!-- LY-FAST-CONTEXT-START/END -->`；写入/删除路径 `ccg-fast-context.md` 改为 `ly-fast-context.md`
- [ ] 2.2 `src/commands/init.ts`（`appendGrokSearchPrompt`）、`src/commands/config-mcp.ts`（`writeGrokPromptToRules`）：`ccg-grok-search.md` 改为 `ly-grok-search.md`；`CCG-GROK-SEARCH-PROMPT-START/END` marker 改为 `LY-GROK-SEARCH-PROMPT-START/END`
- [ ] 2.3 `src/utils/installer.ts`：`.ccg-version` 写入路径（`installCodexMode`）、卸载数组、成功提示文案统一改为 `.ly-version`
- [ ] 2.4 `src/commands/update.ts`：`BACKUP_SUFFIX = '.ccg-update-bak'` 改为 `.ly-update-bak`
- [ ] 2.5 `templates/codex/AGENTS.md`：`<!-- CCG:START/END -->` 改为 `<!-- LY:START/END -->`；`src/utils/installer.ts` 里 `uninstallCodexMode` 的对应检测字符串同步改
- [ ] 2.6 `git mv templates/codex/agents/ccg-implement.toml templates/codex/agents/ly-implement.toml`（`ccg-review.toml`/`ccg-research.toml` 同样处理）；`src/utils/installer.ts` 里 `installCodexMode`/`uninstallCodexMode` 的文件名列表与成功提示文案同步改
- [ ] 2.7 `git mv templates/codex/hooks/ccg-workflow.py templates/codex/hooks/ly-workflow.py`；同步更新 `templates/codex/hooks.json` 里的命令路径（`python3 ~/.codex/hooks/ly-workflow.py`）；确认 `src/utils/installer.ts` 卸载数组里原本写的 `ly-workflow.py` 与新文件名一致（这一步顺带修掉了既存的名字不匹配 bug）
- [ ] 2.8 `templates/hooks/skill-router.js`：把硬编码的 `skills/ccg` 路径改为 `skills/ly`（修复域知识自动注入静默失效的 bug）
- [ ] 2.9 `templates/hooks/session-start.js`、`templates/hooks/task-utils.js`、`templates/codex/AGENTS.md`：项目根目录 `.ccg/tasks/`、`.ccg/spec/` 改为 `.ly/tasks/`、`.ly/spec/`
- [ ] 2.10 `templates/hooks/subagent-context.js`：内存态 XML 标签 `<ccg-active-task>`、`<ccg-specs>`、`<ccg-task-context>`、`<ccg-research>`、`<ccg-injected-context>` 改为 `<ly-*>` 对应名称

## 3. 内容清理

- [ ] 3.1 `templates/prompts/codex/*.md`、`templates/prompts/claude/*.md`（共 14 个文件）：删除第 3 行过时的 `> For: /ccg:...` 整行
- [ ] 3.2 `templates/prompts/codex/reviewer.md`：`## Scoring Format (for /ccg:bugfix)` 标题改为 `## Scoring Format`（去掉过时括号引用）
- [ ] 3.3 删除 `src/utils/installer.ts` 里未被调用的死代码 `installCcgEntryCommand()`
- [ ] 3.4 `git rm assets/logo/ccg-*.png`（17 个文件；`favicon.ico` 保留）

## 4. 验证

- [ ] 4.1 `pnpm typecheck && pnpm build` 全绿
- [ ] 4.2 复查 `src/` 与 `templates/`（`src/utils/migration.ts` 明确豁免，不检查）：分别 grep `Ccg`、`CCG`、`ccg-`、`\.ccg-`、`CCG:`，确认零命中；`grep -rli ccg` 作为兜底整体扫描
- [ ] 4.3 抽查 `templates/codex/hooks.json` 命令路径、`src/utils/installer.ts` 里 Codex mode 安装/卸载的文件名数组，确认三处（写入路径、卸载路径、成功提示文案）互相一致

## 5. 本机一次性清理（非代码改动，执行阶段手动跑一次）

- [ ] 5.1 `rm ~/.claude/rules/ccg-fast-context.md`
- [ ] 5.2 从 `~/.codex/AGENTS.md` 和 `~/.gemini/GEMINI.md` 里删掉 `<!-- CCG-FAST-CONTEXT-START -->...<!-- CCG-FAST-CONTEXT-END -->` 整段
- [ ] 5.3 若本机存在 `~/.claude/rules/ccg-grok-search.md`，先确认再删除；若 `~/.claude/CLAUDE.md` 或 `~/.codex/AGENTS.md`/`~/.gemini/GEMINI.md` 里残留 `<!-- CCG-GROK-SEARCH-PROMPT-START -->...<!-- CCG-GROK-SEARCH-PROMPT-END -->` 一并删除（新代码用新 marker 名，认不出旧的，不清理会导致下次写入新旧并存）
- [ ] 5.4 检查本机是否存在 `~/.codex/.ccg-version`、`~/.codex/agents/ccg-*.toml`、`~/.codex/hooks/ccg-workflow.py`、任何 `*.ccg-update-bak` 备份文件——若存在，视为无主残留直接删除（新代码的安装/卸载逻辑已改用新文件名，不会再识别这些旧文件）
