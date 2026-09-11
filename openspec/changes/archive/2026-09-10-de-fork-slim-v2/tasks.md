## 1. 前置基线：记录 Go 版 wrapper 行为对照

- [x] 1.1 从 codeagent-wrapper Go 源码提取四 backend（codex/claude/hermes/openclaw）的实际 CLI 参数构造、stdin/参数传递方式、SESSION_ID/OVERALL 解析规则与超时默认值，整理成对照基线（写入 design 附注或临时笔记，供 2.x 移植与测试对照）
- [x] 1.2 梳理 `src/utils/installer.ts` 中 wrapper 下载/安装（EXPECTED_BINARY_VERSION、多源 fallback、版本门禁）与安装产物路径的全部代码位置清单

## 2. TS wrapper 实现（src/wrapper/）

- [x] 2.1 新建 `src/wrapper/` 模块：CLI 参数解析（--backend/--progress/--lite/--timeout/resume 子形态/WORKDIR 位置参数/stdin `-`）+ stdin 任务文本读取
- [x] 2.2 实现 codex backend 参数构造（agentic/JSON 输出模式）
- [x] 2.3 实现 claude backend 参数构造
- [x] 2.4 实现 hermes backend 参数构造（-z 一次性任务文本提升为 argv；-r <session_id> resume）
- [x] 2.5 实现 openclaw backend 参数构造（agent --local --json；--session-id resume）
- [x] 2.6 实现进程管理：spawn + stdin 写入 + 流式 stdout/stderr 转发（--progress 进度语义）+ 超时 kill 进程树 + 非零退出转发 + 后端 CLI 缺失（PATH 检测）报错
- [x] 2.7 实现输出解析：JSON 事件流提取最终报告与 SESSION_ID、纯文本兜底收集为 message、openclaw 多行 JSON blob（payloads[].text/sessionId）提取、未知 JSON 事件（如 {"item":null}）不误收、OVERALL: PASS/FAIL 判定透出
- [x] 2.8 按 spec 场景补 vitest 测试：四 backend 参数构造、stdin 读取、SESSION_ID/OVERALL 解析（含纯文本兜底与未知 JSON 事件）、resume 拼参、后端缺失报错；进程类场景（流式转发/超时 kill）用 fake child 进程
- [x] 2.9 build.config.ts 增加 wrapper entry，确认 unbuild 产出 `dist/ly-wrapper.js`（node shebang 可直接执行）

## 3. 安装器接入 ly-wrapper 并删除 Go 分发链

- [x] 3.1 installer 改为安装 `dist/ly-wrapper.js` → `~/.claude/bin/ly-wrapper`（复制 + chmod +x + 版本随包），删除 GitHub Release 下载、EXPECTED_BINARY_VERSION 版本门禁、多源 fallback 全部代码与常量
- [x] 3.2 installer/update 路径确保升级用户处旧 `~/.claude/bin/codeagent-wrapper` 被移除（与 4.x cleanup 衔接，避免双 wrapper 共存）

## 4. 遗产清理模块（upstream-legacy-cleanup）

- [x] 4.1 新建 `src/utils/legacy-cleanup.ts`：逐项清理函数——~/.claude/skills/ly/ 下历史分类产物（impeccable/tools/orchestration/scrapling/SKILL.md/run_skill.js）、~/.claude/commands/ly/ 下分类生成器生成的历史命令文件（判据常量化保留在本模块内——如标题行 + 安装路径子串，不依赖将被删除的生成器代码；不误删用户自定义）、~/.claude/hooks/ly/ 五个 hook 文件、~/.claude/output-styles/ 中 ly 安装的风格文件、~/.claude/rules/ly-skill-routing.md、MCP 注册项（~/.claude.json mcpServers 中本工具注册的条目 + 全部同步副本，实施前核对 installer-mcp.ts 的完整落盘路径清单——含 ~/.codex/config.toml、~/.gemini/settings.json、~/.contextweaver/）、~/.codex/ 的 LY 管理区块（AGENTS.md/config.toml 剥区块）与 hooks.json/hooks/ly-workflow.py/agents/ly-*.toml/.ly-version、~/.claude/bin/codeagent-wrapper
- [x] 4.2 settings.json hook 注册项清理：仅移除命令字段指向 ~/.claude/hooks/ly/ 路径的条目，其余条目不动；原子写（临时文件 + rename）
- [x] 4.3 接入 update 与 uninstall 主流程：存在才清、逐项 try/catch、汇总逐项报告（清理/跳过/失败），失败不阻断；补 vitest 测试（含幂等与不误删场景）

## 5. 删除上游遗产资产与引用清零

- [x] 5.1 删除 templates/skills/（domains/impeccable/scrapling/orchestration/tools/SKILL.md/run_skill.js 整目录）、templates/output-styles/、templates/codex/、templates/hooks/
- [x] 5.2 installer 引用清零：可选 skill 分类机制（CORE/分类过滤/清理逻辑中 skill 相关部分）、skill-registry.ts、output-styles/hooks/codex mode 的安装函数与文件清单同步删除或收敛
- [x] 5.3 menu/init/update/doctor 引用清零：Codex Mode 菜单入口与安装调用、hooks 安装项、output-styles 项、skill 分类选项、doctor/status 中随功能消失的体检项
- [x] 5.4 删除 src/commands/config-mcp.ts、src/commands/diagnose-mcp.ts、src/utils/installer-mcp.ts、src/utils/mcp.ts 及 menu/init/update 中全部 MCP 入口；`--skip-mcp` 标志随 MCP 功能一并移除（update 内部对 `init --force --skip-prompt` 的调用不再传该标志，CLI 参数面同步删除）
- [x] 5.5 删除 templates/rules/ly-skill-routing.md；更新 templates/rules/ly-skills.md 移除 orchestration skill 路径引用（ly-codegraph.md 保留）；installer 卸载清单同步
- [x] 5.6 删除 src/utils/migration.ts 及其调用点（init/update 中迁移触发逻辑）
- [x] 5.7 命令模板改名：templates/commands/*.md 中 `~/.claude/bin/codeagent-wrapper` → `~/.claude/bin/ly-wrapper`（review-plan/review-code/apply 及其他出现处）

## 6. 构建与发布链收敛

- [x] 6.1 package.json：files 白名单移除 templates/output-styles/、templates/skills/，确认 dist/（含 ly-wrapper.js）在列；scripts 不变
- [x] 6.2 删除 .github/workflows/build-binaries.yml；release.yml 移除 Go 构建段，保留 tag 触发的 npm publish
- [x] 6.3 删除 codeagent-wrapper/ 整目录（Go 工程 + Go 测试）
- [x] 6.4 npm pack --dry-run 验证发布内容：含 dist/ly-wrapper.js 与瘦身后 templates，不含已删目录

## 7. 文档与社区姿态文件

- [x] 7.1 删除 CONTRIBUTING.md、CODE_OF_CONDUCT.md、SECURITY.md 及 .github 下 issue/PR 模板（保留 workflows/）
- [x] 7.2 根 CLAUDE.md 改写：模块职责（删 Go wrapper/质量关卡技能描述，补 ly-wrapper）、发版规则（删 Go 版本号同步条款）、命令表核对（14 个命令不变）
- [x] 7.3 README 改写：架构图、安装产物说明、发布方式描述同步瘦身后的形态

## 8. 验收

- [x] 8.1 `pnpm typecheck && pnpm build && pnpm test` 全绿；被删功能的既有测试已随删除同步移除，无残留引用
- [x] 8.2 全局 grep `codeagent-wrapper` 清零（src/templates/.github/根文档；`openspec/specs/` 中未被 delta 覆盖的非 Requirement 文本（如 Purpose 段）直接改基线同步更名；openspec/changes/ 历史归档除外）；grep `Ccg|ccg` 清零（migration.ts 已删，应为 0）
- [x] 8.3 本地实跑验证：`node dist/ly-wrapper.js --backend codex - "$PWD"` 单任务调用形态可用（含 SESSION_ID/OVERALL 解析输出）；`npx ly-workflow`（本地包路径）安装后 ~/.claude/bin/ly-wrapper 可直接执行
